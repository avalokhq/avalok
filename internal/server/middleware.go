package server

import "net/http"

func (s *Server) requireRole(roles ...string) func(http.HandlerFunc) http.HandlerFunc {
	allowed := make(map[string]bool, len(roles))
	for _, r := range roles {
		allowed[r] = true
	}
	return func(next http.HandlerFunc) http.HandlerFunc {
		return s.authMiddleware(func(w http.ResponseWriter, r *http.Request) {
			user := userFromContext(r)
			if user == nil || !allowed[user.Role] {
				writeError(w, http.StatusForbidden, "insufficient permissions")
				return
			}
			next(w, r)
		})
	}
}

func (s *Server) adminOnly(next http.HandlerFunc) http.HandlerFunc {
	return s.requireRole("admin")(next)
}

func (s *Server) adminOrResourceScoped(next http.HandlerFunc) http.HandlerFunc {
	return s.authMiddleware(func(w http.ResponseWriter, r *http.Request) {
		user := userFromContext(r)
		if user == nil {
			writeError(w, http.StatusUnauthorized, "authentication required")
			return
		}
		if !user.HasAnyResourceAccess() {
			writeError(w, http.StatusForbidden, "insufficient permissions")
			return
		}
		next(w, r)
	})
}
