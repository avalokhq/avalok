package logbuffer

import (
	"context"
	"fmt"
	"io"
	"log/slog"
	"os"
	"path/filepath"
	"sync"
)

type Handler struct {
	buf     *Buffer
	stderr  slog.Handler
	file    slog.Handler
	fileMu  sync.Mutex
	fileW   *rotatingWriter
}

type HandlerConfig struct {
	Buffer  *Buffer
	LogDir  string
	MaxSize int64
	Keep    int
}

func NewHandler(cfg HandlerConfig) *Handler {
	h := &Handler{
		buf:    cfg.Buffer,
		stderr: slog.NewJSONHandler(os.Stderr, nil),
	}

	if cfg.LogDir != "" {
		if err := os.MkdirAll(cfg.LogDir, 0755); err == nil {
			maxSize := cfg.MaxSize
			if maxSize <= 0 {
				maxSize = 10 * 1024 * 1024 // 10MB
			}
			keep := cfg.Keep
			if keep <= 0 {
				keep = 5
			}
			rw := newRotatingWriter(filepath.Join(cfg.LogDir, "avalok.log"), maxSize, keep)
			if err := rw.open(); err == nil {
				h.fileW = rw
				h.file = slog.NewJSONHandler(rw, nil)
			}
		}
	}

	return h
}

func (h *Handler) Enabled(_ context.Context, level slog.Level) bool {
	return level >= slog.LevelInfo
}

func (h *Handler) Handle(ctx context.Context, r slog.Record) error {
	line := fmt.Sprintf("%s %s %s", r.Time.Format("2006-01-02T15:04:05.000Z07:00"), r.Level, r.Message)
	r.Attrs(func(a slog.Attr) bool {
		line += fmt.Sprintf(" %s=%v", a.Key, a.Value)
		return true
	})

	h.buf.Write(Entry{
		Time:    r.Time,
		Level:   r.Level.String(),
		Message: r.Message,
		Line:    line,
	})

	_ = h.stderr.Handle(ctx, r)

	if h.file != nil {
		h.fileMu.Lock()
		_ = h.file.Handle(ctx, r)
		h.fileMu.Unlock()
	}

	return nil
}

func (h *Handler) WithAttrs(attrs []slog.Attr) slog.Handler {
	return h
}

func (h *Handler) WithGroup(name string) slog.Handler {
	return h
}

func (h *Handler) Close() error {
	if h.fileW != nil {
		return h.fileW.close()
	}
	return nil
}

type rotatingWriter struct {
	path    string
	maxSize int64
	keep    int
	mu      sync.Mutex
	f       *os.File
	size    int64
}

func newRotatingWriter(path string, maxSize int64, keep int) *rotatingWriter {
	return &rotatingWriter{path: path, maxSize: maxSize, keep: keep}
}

func (rw *rotatingWriter) open() error {
	f, err := os.OpenFile(rw.path, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0644)
	if err != nil {
		return err
	}
	stat, _ := f.Stat()
	rw.f = f
	if stat != nil {
		rw.size = stat.Size()
	}
	return nil
}

func (rw *rotatingWriter) Write(p []byte) (int, error) {
	rw.mu.Lock()
	defer rw.mu.Unlock()

	if rw.size+int64(len(p)) > rw.maxSize {
		rw.rotate()
	}

	n, err := rw.f.Write(p)
	rw.size += int64(n)
	return n, err
}

func (rw *rotatingWriter) rotate() {
	rw.f.Close()

	for i := rw.keep - 1; i >= 1; i-- {
		from := fmt.Sprintf("%s.%d", rw.path, i)
		to := fmt.Sprintf("%s.%d", rw.path, i+1)
		os.Rename(from, to)
	}
	os.Rename(rw.path, rw.path+".1")

	// remove oldest
	os.Remove(fmt.Sprintf("%s.%d", rw.path, rw.keep+1))

	rw.f, _ = os.OpenFile(rw.path, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0644)
	rw.size = 0
}

func (rw *rotatingWriter) close() error {
	if rw.f != nil {
		return rw.f.Close()
	}
	return nil
}

var _ io.Writer = (*rotatingWriter)(nil)
