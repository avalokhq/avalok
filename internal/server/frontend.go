package server

import (
	"embed"
	"io/fs"
	"net/http"
)

//go:embed all:frontend
var frontendFS embed.FS

func (s *Server) serveFrontend() {
	subFS, err := fs.Sub(frontendFS, "frontend")
	if err != nil {
		panic("failed to load embedded frontend: " + err.Error())
	}

	fileServer := http.FileServer(http.FS(subFS))

	s.mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		// Serve API routes normally
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
}
