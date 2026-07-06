package server

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/avalokhq/avalok/internal/filebrowser"
	"github.com/avalokhq/avalok/internal/sshclient"
	"github.com/avalokhq/avalok/internal/workspace"
)

func (s *Server) handleListFiles(w http.ResponseWriter, r *http.Request) {
	user := userFromContext(r)
	name := r.PathValue("name")
	envName := r.PathValue("env")
	svcName := r.PathValue("svc")

	if !user.HasAccess(name, envName, svcName) {
		writeError(w, http.StatusForbidden, "access denied")
		return
	}

	resolved, err := s.resolveServiceForBrowser(r, name, envName, svcName)
	if err != nil {
		writeError(w, http.StatusNotFound, err.Error())
		return
	}

	logDir := cfgStr(resolved.Config, "log_dir")
	if logDir == "" {
		writeError(w, http.StatusNotFound, "file browsing not configured for this service")
		return
	}

	browser, err := s.createBrowser(r, resolved, logDir)
	if err != nil {
		writeError(w, http.StatusInternalServerError, fmt.Sprintf("creating browser: %v", err))
		return
	}
	defer browser.Close()

	files, err := browser.ListFiles(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, fmt.Sprintf("listing files: %v", err))
		return
	}
	if files == nil {
		files = []filebrowser.FileInfo{}
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"files":   files,
		"log_dir": logDir,
	})
}

func (s *Server) handleReadFile(w http.ResponseWriter, r *http.Request) {
	user := userFromContext(r)
	name := r.PathValue("name")
	envName := r.PathValue("env")
	svcName := r.PathValue("svc")
	filename := r.PathValue("filename")

	if !user.HasAccess(name, envName, svcName) {
		writeError(w, http.StatusForbidden, "access denied")
		return
	}

	if !filebrowser.ValidateFilename(filename) {
		writeError(w, http.StatusBadRequest, "invalid filename")
		return
	}

	resolved, err := s.resolveServiceForBrowser(r, name, envName, svcName)
	if err != nil {
		writeError(w, http.StatusNotFound, err.Error())
		return
	}

	logDir := cfgStr(resolved.Config, "log_dir")
	if logDir == "" {
		writeError(w, http.StatusNotFound, "file browsing not configured for this service")
		return
	}

	browser, err := s.createBrowser(r, resolved, logDir)
	if err != nil {
		writeError(w, http.StatusInternalServerError, fmt.Sprintf("creating browser: %v", err))
		return
	}
	defer browser.Close()

	page, _ := strconv.Atoi(r.URL.Query().Get("page"))
	if page <= 0 {
		page = 1
	}

	pageSize := s.getFileBrowserPageSize(r)

	resp, err := browser.ReadPage(r.Context(), filename, filebrowser.PageRequest{
		Page:     page,
		PageSize: pageSize,
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, fmt.Sprintf("reading file: %v", err))
		return
	}

	writeJSON(w, http.StatusOK, resp)
}

func (s *Server) handleDownloadFile(w http.ResponseWriter, r *http.Request) {
	user := userFromContext(r)
	name := r.PathValue("name")
	envName := r.PathValue("env")
	svcName := r.PathValue("svc")
	filename := r.PathValue("filename")

	if !user.HasAccess(name, envName, svcName) {
		writeError(w, http.StatusForbidden, "access denied")
		return
	}

	if !filebrowser.ValidateFilename(filename) {
		writeError(w, http.StatusBadRequest, "invalid filename")
		return
	}

	resolved, err := s.resolveServiceForBrowser(r, name, envName, svcName)
	if err != nil {
		writeError(w, http.StatusNotFound, err.Error())
		return
	}

	logDir := cfgStr(resolved.Config, "log_dir")
	if logDir == "" {
		writeError(w, http.StatusNotFound, "file browsing not configured for this service")
		return
	}

	w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=%q", filename))
	w.Header().Set("Content-Type", "application/octet-stream")

	if needsSSHTransport(resolved) {
		fullPath := strings.TrimRight(logDir, "/") + "/" + filename
		catCmd := fmt.Sprintf("cat %s", shellEscapePath(fullPath))
		if cfgBool(resolved.Config, "sudo") {
			catCmd = "sudo " + catCmd
		}

		client := s.createSSHClient(resolved)
		if err := client.Connect(r.Context()); err != nil {
			writeError(w, http.StatusInternalServerError, fmt.Sprintf("SSH connect: %v", err))
			return
		}
		defer client.Close()

		data, err := client.Run(r.Context(), catCmd)
		if err != nil {
			writeError(w, http.StatusInternalServerError, fmt.Sprintf("reading file: %v", err))
			return
		}
		w.Write(data)
		return
	}

	safePath := filepath.Join(logDir, filename)
	if !strings.HasPrefix(safePath, filepath.Clean(logDir)+string(filepath.Separator)) {
		writeError(w, http.StatusBadRequest, "invalid file path")
		return
	}
	http.ServeFile(w, r, safePath)
}

func (s *Server) handleSearchFiles(w http.ResponseWriter, r *http.Request) {
	user := userFromContext(r)
	name := r.PathValue("name")
	envName := r.PathValue("env")
	svcName := r.PathValue("svc")

	if !user.HasAccess(name, envName, svcName) {
		writeError(w, http.StatusForbidden, "access denied")
		return
	}

	resolved, err := s.resolveServiceForBrowser(r, name, envName, svcName)
	if err != nil {
		writeError(w, http.StatusNotFound, err.Error())
		return
	}

	logDir := cfgStr(resolved.Config, "log_dir")
	if logDir == "" {
		writeError(w, http.StatusNotFound, "file browsing not configured for this service")
		return
	}

	var req filebrowser.SearchRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON")
		return
	}

	if req.Pattern == "" {
		writeError(w, http.StatusBadRequest, "pattern is required")
		return
	}

	browser, err := s.createBrowser(r, resolved, logDir)
	if err != nil {
		writeError(w, http.StatusInternalServerError, fmt.Sprintf("creating browser: %v", err))
		return
	}
	defer browser.Close()

	results, err := browser.Search(r.Context(), req)
	if err != nil {
		writeError(w, http.StatusInternalServerError, fmt.Sprintf("searching: %v", err))
		return
	}
	if results == nil {
		results = []filebrowser.SearchResult{}
	}

	truncated := req.MaxHits > 0 && len(results) >= req.MaxHits
	if !truncated && len(results) >= 500 {
		truncated = true
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"results":   results,
		"truncated": truncated,
	})
}

func (s *Server) resolveServiceForBrowser(r *http.Request, wsName, envName, svcName string) (*workspace.ResolvedService, error) {
	ws, err := s.store.GetWorkspace(r.Context(), wsName)
	if err != nil {
		return nil, fmt.Errorf("workspace %q not found", wsName)
	}

	resolved, err := ws.ResolveService(envName, svcName)
	if err != nil {
		return nil, err
	}

	if s.creds != nil && resolved.Target.CredentialProfile != "" {
		resolved.Config["credential_profile"] = resolved.Target.CredentialProfile
		creds, err := s.creds.Resolve(r.Context(), resolved.Service.Provider, resolved.Target.Type, resolved.Config)
		if err == nil {
			resolved.Config = creds.Config
		}
	}

	return resolved, nil
}

func (s *Server) createBrowser(r *http.Request, resolved *workspace.ResolvedService, logDir string) (filebrowser.Browser, error) {
	if needsSSHTransport(resolved) {
		client := s.createSSHClient(resolved)
		if err := client.Connect(r.Context()); err != nil {
			return nil, fmt.Errorf("SSH connect: %w", err)
		}

		sudo := cfgBool(resolved.Config, "sudo")
		return &sshBrowserWrapper{
			browser: filebrowser.NewRemoteBrowser(logDir, client, sudo),
			client:  client,
		}, nil
	}

	return filebrowser.NewLocalBrowser(logDir, s.tempManager), nil
}

func (s *Server) createSSHClient(resolved *workspace.ResolvedService) *sshclient.Client {
	cfg := sshclient.ConfigFromMap(resolved.Config)
	return sshclient.New(cfg)
}

type sshBrowserWrapper struct {
	browser *filebrowser.RemoteBrowser
	client  *sshclient.Client
}

func (w *sshBrowserWrapper) ListFiles(ctx context.Context) ([]filebrowser.FileInfo, error) {
	return w.browser.ListFiles(ctx)
}

func (w *sshBrowserWrapper) ReadPage(ctx context.Context, filename string, req filebrowser.PageRequest) (*filebrowser.PageResponse, error) {
	return w.browser.ReadPage(ctx, filename, req)
}

func (w *sshBrowserWrapper) Search(ctx context.Context, req filebrowser.SearchRequest) ([]filebrowser.SearchResult, error) {
	return w.browser.Search(ctx, req)
}

func (w *sshBrowserWrapper) Close() error {
	w.browser.Close()
	return w.client.Close()
}

func (s *Server) getFileBrowserPageSize(r *http.Request) int {
	if v := r.URL.Query().Get("page_size"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 && n <= 100000 {
			return n
		}
	}

	if v, err := s.store.GetSetting(r.Context(), "file_browser_page_size"); err == nil && v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			return n
		}
	}

	return filebrowser.DefaultPageSize
}

func shellEscapePath(s string) string {
	return "'" + cfgEscapeSingleQuotes(s) + "'"
}

func cfgEscapeSingleQuotes(s string) string {
	result := ""
	for _, c := range s {
		if c == '\'' {
			result += "'\"'\"'"
		} else {
			result += string(c)
		}
	}
	return result
}

