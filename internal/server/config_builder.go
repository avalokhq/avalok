package server

import (
	"encoding/json"
	"io/fs"
	"net/http"
	"os"
	"path/filepath"
	"strings"
)

// NewConfigBuilderHandler returns an http.Handler that serves the config builder UI
// and a POST /api/config/save endpoint for writing workspace YAML to disk.
// No authentication is required.
func NewConfigBuilderHandler(defaultOutput string) http.Handler {
	mux := http.NewServeMux()

	mux.HandleFunc("POST /api/config/save", func(w http.ResponseWriter, r *http.Request) {
		r.Body = http.MaxBytesReader(w, r.Body, 1<<20) // 1 MB limit

		var req struct {
			YAML     string `json:"yaml"`
			Filename string `json:"filename"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid JSON body"})
			return
		}

		filename := req.Filename
		if filename == "" {
			filename = defaultOutput
		}
		if filename == "" {
			filename = "workspace.yaml"
		}

		base := filepath.Base(filename)
		if base != filename || strings.Contains(filename, "..") || strings.ContainsAny(filename, `/\`) {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "filename must not contain path separators"})
			return
		}

		ext := filepath.Ext(base)
		if ext != ".yaml" && ext != ".yml" {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "only .yaml or .yml files are allowed"})
			return
		}

		absPath, err := filepath.Abs(base)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to resolve output path"})
			return
		}

		if err := os.WriteFile(absPath, []byte(req.YAML), 0644); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to write file"})
			return
		}

		writeJSON(w, http.StatusOK, map[string]string{"path": absPath})
	})

	// Serve the embedded frontend with SPA fallback
	subFS, err := fs.Sub(frontendFS, "frontend")
	if err != nil {
		panic("failed to load embedded frontend: " + err.Error())
	}

	fileServer := http.FileServer(http.FS(subFS))

	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		// API routes that don't match above get 404
		if len(r.URL.Path) >= 4 && r.URL.Path[:4] == "/api" {
			http.NotFound(w, r)
			return
		}

		// Try to serve static file
		f, err := subFS.Open(r.URL.Path[1:])
		if err != nil {
			// SPA fallback: serve index.html for all non-file routes
			r.URL.Path = "/"
			fileServer.ServeHTTP(w, r)
			return
		}
		f.Close()
		fileServer.ServeHTTP(w, r)
	})

	return mux
}
