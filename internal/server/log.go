package server

import (
	"log/slog"
	"os"

	"github.com/avalokhq/avalok/internal/logbuffer"
)

var logger = slog.New(slog.NewJSONHandler(os.Stderr, nil))

func SetupLogger(buf *logbuffer.Buffer, logDir string) *logbuffer.Handler {
	h := logbuffer.NewHandler(logbuffer.HandlerConfig{
		Buffer: buf,
		LogDir: logDir,
	})
	logger = slog.New(h)
	slog.SetDefault(logger)
	return h
}
