package server

import (
	"compress/gzip"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/avalokhq/avalok/internal/provider"
	"github.com/avalokhq/avalok/internal/provider/cloudutil"
	"github.com/coder/websocket"
	"github.com/coder/websocket/wsjson"
)

func (s *Server) buildServiceCloudProvider(ctx context.Context, wsName, svcName string) (provider.Provider, error) {
	ws, err := s.store.GetWorkspace(ctx, wsName)
	if err != nil {
		return nil, fmt.Errorf("workspace %q not found: %w", wsName, err)
	}

	svc := ws.FindService(svcName)
	if svc == nil {
		return nil, fmt.Errorf("service %q not found", svcName)
	}

	if !isCloudStorageType(svc.Provider) {
		return nil, fmt.Errorf("service %q is not a cloud storage type", svcName)
	}

	config := make(map[string]any)

	if svc.Resource != "" {
		res, err := s.store.GetResource(ctx, svc.Resource)
		if err == nil {
			for k, v := range res.Config {
				config[k] = v
			}
		}
	}

	for k, v := range svc.Config {
		if v != nil {
			config[k] = v
		}
	}

	if profileName, ok := config["credential_profile"].(string); ok && profileName != "" && s.creds != nil {
		credType := svc.Provider
		if credType == "azure-blob" || credType == "azure-file" {
			credType = "azure-storage"
		}
		resolved, err := s.creds.Resolve(ctx, svc.Provider, credType, config)
		if err != nil {
			return nil, fmt.Errorf("resolving credentials: %w", err)
		}
		config = resolved.Config
	}

	p, ok := provider.Get(svc.Provider)
	if !ok {
		return nil, fmt.Errorf("provider %q not available", svc.Provider)
	}

	if err := p.Connect(ctx, config); err != nil {
		return nil, fmt.Errorf("connecting to %s: %w", svc.Provider, err)
	}

	return p, nil
}

func (s *Server) handleListServiceStorageObjects(w http.ResponseWriter, r *http.Request) {
	user := userFromContext(r)
	wsName := r.PathValue("name")
	svcName := r.PathValue("svc")

	if !user.HasWorkspaceAccess(wsName) {
		writeError(w, http.StatusForbidden, "access denied")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()

	p, err := s.buildServiceCloudProvider(ctx, wsName, svcName)
	if err != nil {
		writeInternalError(w, "failed to connect", err)
		return
	}
	defer p.Close()

	path := r.URL.Query().Get("path")

	hs, ok := p.(cloudutil.HierarchicalStore)
	if !ok {
		writeError(w, http.StatusBadRequest, "provider does not support hierarchical listing")
		return
	}

	lr, err := hs.ListHierarchical(ctx, path)
	if err != nil {
		writeInternalError(w, "failed to list objects", err)
		return
	}

	type dirResponse struct {
		Name string `json:"name"`
		Path string `json:"path"`
	}
	type objResponse struct {
		Key          string `json:"key"`
		Name         string `json:"name"`
		Size         int64  `json:"size"`
		LastModified string `json:"last_modified"`
	}

	dirs := make([]dirResponse, 0, len(lr.Directories))
	for _, d := range lr.Directories {
		dirs = append(dirs, dirResponse{Name: d.Name, Path: d.Path})
	}
	objs := make([]objResponse, 0, len(lr.Objects))
	for _, o := range lr.Objects {
		lastMod := ""
		if !o.LastModified.IsZero() {
			lastMod = o.LastModified.Format(time.RFC3339)
		}
		name := o.Key
		if idx := len(path); idx > 0 && len(name) > idx {
			name = name[idx:]
		}
		objs = append(objs, objResponse{
			Key:          o.Key,
			Name:         name,
			Size:         o.Size,
			LastModified: lastMod,
		})
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"path":        lr.Path,
		"directories": dirs,
		"objects":     objs,
	})
}

func (s *Server) handleServiceStorageContent(w http.ResponseWriter, r *http.Request) {
	user := userFromContext(r)
	wsName := r.PathValue("name")
	svcName := r.PathValue("svc")
	objectKey := r.PathValue("key")

	if !user.HasWorkspaceAccess(wsName) {
		writeError(w, http.StatusForbidden, "access denied")
		return
	}

	if objectKey == "" {
		writeError(w, http.StatusBadRequest, "object key is required")
		return
	}

	ctx, cancel := context.WithCancel(r.Context())
	defer cancel()

	p, err := s.buildServiceCloudProvider(ctx, wsName, svcName)
	if err != nil {
		writeInternalError(w, "failed to connect", err)
		return
	}
	defer p.Close()

	objStore, ok := p.(cloudutil.ObjectStore)
	if !ok {
		writeError(w, http.StatusBadRequest, "provider does not support direct content access")
		return
	}

	rc, err := objStore.GetObject(ctx, objectKey)
	if err != nil {
		writeInternalError(w, "failed to download object", err)
		return
	}
	defer rc.Close()

	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	w.Header().Set("X-Content-Type-Options", "nosniff")

	var reader io.Reader = rc
	if strings.HasSuffix(strings.ToLower(objectKey), ".gz") {
		gz, gzErr := gzip.NewReader(rc)
		if gzErr != nil {
			writeInternalError(w, "failed to decompress object", gzErr)
			return
		}
		defer gz.Close()
		reader = gz
	}

	io.Copy(w, reader)
}

func (s *Server) handleServiceStorageStream(w http.ResponseWriter, r *http.Request) {
	user := userFromContext(r)
	wsName := r.PathValue("name")
	svcName := r.PathValue("svc")
	objectKey := r.URL.Query().Get("key")

	if !user.HasWorkspaceAccess(wsName) {
		writeError(w, http.StatusForbidden, "access denied")
		return
	}

	if objectKey == "" {
		writeError(w, http.StatusBadRequest, "object key is required")
		return
	}

	if activeWSConns.Load() >= s.wsMaxConnections() {
		http.Error(w, "too many active connections", http.StatusServiceUnavailable)
		return
	}

	conn, err := websocket.Accept(w, r, &websocket.AcceptOptions{
		OriginPatterns: s.originPatterns(),
	})
	if err != nil {
		logger.Error("websocket accept error", "error", err)
		return
	}
	activeWSConns.Add(1)
	defer activeWSConns.Add(-1)
	defer conn.CloseNow()

	conn.SetReadLimit(s.wsReadLimit())

	ctx, cancel := context.WithCancel(r.Context())
	defer cancel()

	p, err := s.buildServiceCloudProvider(ctx, wsName, svcName)
	if err != nil {
		wsjson.Write(ctx, conn, wsLogEntry{Type: "error", Error: "failed to connect: " + err.Error()})
		return
	}
	defer p.Close()

	streamOpts := provider.StreamOpts{Follow: true, Tail: s.streamTailLines()}
	if mode := r.URL.Query().Get("mode"); mode != "" {
		lines := 0
		if v := r.URL.Query().Get("lines"); v != "" {
			if n, err := strconv.Atoi(v); err == nil && n > 0 {
				lines = n
			}
		}
		switch mode {
		case "head":
			if lines <= 0 {
				lines = 100
			}
			streamOpts = provider.StreamOpts{Head: lines}
		case "tail":
			if lines <= 0 {
				lines = 1000
			}
			streamOpts = provider.StreamOpts{Tail: lines, Follow: true}
		case "live":
			streamOpts = provider.StreamOpts{SkipInitial: true, Follow: true}
		}
	}

	objStore, ok := p.(cloudutil.ObjectStore)
	if !ok {
		wsjson.Write(ctx, conn, wsLogEntry{Type: "error", Error: "provider does not support object storage"})
		return
	}

	ws, _ := s.store.GetWorkspace(ctx, wsName)
	svc := ws.FindService(svcName)
	pollInterval := 30 * time.Second
	if svc != nil {
		cfg := cloudutil.ParseCommonConfig(svc.Config)
		if cfg.PollInterval > 0 {
			pollInterval = cfg.PollInterval
		}
	}

	ch := make(chan provider.LogEntry, 100)
	go func() {
		defer close(ch)
		cloudutil.StreamSingleObject(ctx, objStore, objectKey, svc.Provider, streamOpts, pollInterval, ch)
	}()

	var mu sync.Mutex
	paused := false

	go func() {
		for {
			_, data, readErr := conn.Read(ctx)
			if readErr != nil {
				cancel()
				return
			}
			var cmd wsCommand
			if err := json.Unmarshal(data, &cmd); err != nil {
				continue
			}
			mu.Lock()
			switch cmd.Action {
			case "pause":
				paused = true
			case "resume":
				paused = false
			}
			mu.Unlock()
		}
	}()

	for entry := range ch {
		mu.Lock()
		isPaused := paused
		mu.Unlock()
		if isPaused {
			continue
		}
		err := wsjson.Write(ctx, conn, wsLogEntry{
			Type:      "log",
			Timestamp: entry.Timestamp.Format("2006-01-02T15:04:05.000Z07:00"),
			Source:    entry.Source,
			Instance:  entry.Instance,
			Line:      entry.Line,
		})
		if err != nil {
			return
		}
	}

	conn.Close(websocket.StatusNormalClosure, "stream ended")
}
