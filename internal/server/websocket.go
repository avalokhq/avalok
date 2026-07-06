package server

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"sync"
	"sync/atomic"

	"github.com/avalokhq/avalok/internal/provider"
	"github.com/avalokhq/avalok/internal/stream"
	"github.com/avalokhq/avalok/internal/workspace"
	"github.com/coder/websocket"
	"github.com/coder/websocket/wsjson"
)

const (
	defaultMaxWSConns    = 100
	defaultWSMaxMsgKB    = 4
	maxAllowedWSMsgKB    = 64
)

var activeWSConns atomic.Int64

func (s *Server) wsMaxConnections() int64 {
	if v, _ := s.store.GetSetting(context.Background(), "ws_max_connections"); v != "" {
		if n, err := strconv.ParseInt(v, 10, 64); err == nil && n > 0 {
			return n
		}
	}
	return defaultMaxWSConns
}

func (s *Server) streamTailLines() int {
	if v, _ := s.store.GetSetting(context.Background(), "stream_tail_lines"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			return n
		}
	}
	return 0
}

func (s *Server) wsReadLimit() int64 {
	if v, _ := s.store.GetSetting(context.Background(), "ws_max_message_kb"); v != "" {
		if n, err := strconv.ParseInt(v, 10, 64); err == nil && n > 0 {
			return n * 1024
		}
	}
	return defaultWSMaxMsgKB * 1024
}

type wsCommand struct {
	Action string `json:"action"`
}

type wsLogEntry struct {
	Type      string `json:"type"`
	Timestamp string `json:"timestamp,omitempty"`
	Source    string `json:"source,omitempty"`
	Instance string `json:"instance,omitempty"`
	Line     string `json:"line,omitempty"`
	Error    string `json:"error,omitempty"`
}

func (s *Server) handleWebSocketStream(w http.ResponseWriter, r *http.Request, resolved *workspace.ResolvedService) {
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

	providerName, providerConfig := s.resolveWithCredentials(ctx, resolved, true, s.streamTailLines())

	p, ok := provider.Get(providerName)
	if !ok {
		wsjson.Write(ctx, conn, wsLogEntry{Type: "error", Error: fmt.Sprintf("unknown provider: %s", providerName)})
		return
	}

	if err := p.Connect(ctx, providerConfig); err != nil {
		logger.Error("WS connect failed", "provider", resolved.Service.Provider, "service", resolved.Service.Name, "error", err)
		wsjson.Write(ctx, conn, wsLogEntry{Type: "error", Error: "failed to connect to provider"})
		return
	}
	defer p.Close()

	instances, err := p.ListInstances(ctx)
	if err != nil {
		logger.Error("WS list instances failed", "provider", resolved.Service.Provider, "service", resolved.Service.Name, "error", err)
		wsjson.Write(ctx, conn, wsLogEntry{Type: "error", Error: "failed to list instances"})
		return
	}
	if len(instances) == 0 {
		logger.Error("WS no instances found", "provider", resolved.Service.Provider, "service", resolved.Service.Name)
		wsjson.Write(ctx, conn, wsLogEntry{Type: "error", Error: "no instances found"})
		return
	}

	streamCtx, streamCancel := context.WithCancel(ctx)
	defer streamCancel()

	var streams []<-chan provider.LogEntry
	for _, inst := range instances {
		s, sErr := p.Stream(streamCtx, inst.ID, provider.StreamOpts{
			Follow: true,
			Tail:   s.streamTailLines(),
		})
		if sErr != nil {
			logger.Warn("WS stream error", "instance", inst.ID, "error", sErr)
			continue
		}
		streams = append(streams, s)
	}
	if len(streams) == 0 {
		wsjson.Write(ctx, conn, wsLogEntry{Type: "error", Error: "failed to stream any instances"})
		return
	}
	ch := stream.MergeAll(streamCtx, streams...)

	var mu sync.Mutex
	paused := false

	go func() {
		for {
			_, data, err := conn.Read(ctx)
			if err != nil {
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
