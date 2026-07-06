package server

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"

	jwtauth "github.com/avalokhq/avalok/internal/auth/jwt"
	"github.com/avalokhq/avalok/internal/store"
)

func (s *Server) handleRegister(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Username string `json:"username"`
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if req.Username == "" || req.Password == "" {
		writeError(w, http.StatusBadRequest, "username and password are required")
		return
	}
	if len(req.Password) < 8 {
		writeError(w, http.StatusBadRequest, "password must be at least 8 characters")
		return
	}

	if existing, _ := s.store.GetUserByUsername(r.Context(), req.Username); existing != nil {
		bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
		writeJSON(w, http.StatusCreated, map[string]any{
			"message": "registration successful — awaiting admin approval",
		})
		return
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to hash password")
		return
	}

	user := &store.User{
		ID:       uuid.New().String(),
		Username: req.Username,
		Email:    req.Email,
		Password: string(hash),
		Role:     "reader",
		Status:   "pending",
		Scope:    []string{},
	}

	if err := s.store.CreateUser(r.Context(), user); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to create user")
		return
	}

	s.store.RecordAudit(r.Context(), &store.AuditEntry{
		UserID:   user.ID,
		Action:   "register",
		Resource: "user/" + user.ID,
		Details:  map[string]string{"username": user.Username},
	})

	writeJSON(w, http.StatusCreated, map[string]any{
		"id":       user.ID,
		"username": user.Username,
		"status":   user.Status,
		"message":  "registration successful — awaiting admin approval",
	})
}

func (s *Server) handleLogin(w http.ResponseWriter, r *http.Request) {
	jwtMgr, ok := s.auth.(*jwtauth.Manager)
	if !ok {
		writeError(w, http.StatusInternalServerError, "login not available in this mode")
		return
	}

	var req struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if req.Username == "" || req.Password == "" {
		writeError(w, http.StatusBadRequest, "username and password are required")
		return
	}

	user, err := s.store.GetUserByUsername(r.Context(), req.Username)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "invalid credentials")
		return
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.Password), []byte(req.Password)); err != nil {
		writeError(w, http.StatusUnauthorized, "invalid credentials")
		return
	}

	if user.Status == "pending" {
		writeError(w, http.StatusForbidden, "account pending approval")
		return
	}
	if user.Status == "disabled" {
		writeError(w, http.StatusForbidden, "account disabled")
		return
	}

	if !user.ExpiresAt.IsZero() && time.Now().After(user.ExpiresAt) {
		writeError(w, http.StatusForbidden, "account expired")
		return
	}

	token, jti, err := jwtMgr.Generate(user)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to generate token")
		return
	}

	sess := &store.Session{
		ID:        uuid.New().String(),
		UserID:    user.ID,
		Token:     jti,
		ExpiresAt: time.Now().Add(jwtMgr.Expiration()),
	}
	if err := s.store.CreateSession(r.Context(), sess); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to create session")
		return
	}

	s.store.RecordAudit(r.Context(), &store.AuditEntry{
		UserID:   user.ID,
		Action:   "login",
		Resource: "session/" + sess.ID,
	})

	writeJSON(w, http.StatusOK, map[string]any{
		"token": token,
		"user": map[string]any{
			"id":       user.ID,
			"username": user.Username,
			"email":    user.Email,
			"role":     user.Role,
			"scope":    user.Scope,
		},
	})
}

func (s *Server) handleLogout(w http.ResponseWriter, r *http.Request) {
	jwtMgr, ok := s.auth.(*jwtauth.Manager)
	if !ok {
		writeError(w, http.StatusInternalServerError, "logout not available in this mode")
		return
	}

	tokenString := extractBearerToken(r)
	if tokenString == "" {
		writeError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	claims, err := jwtMgr.Validate(tokenString)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "invalid token")
		return
	}

	if err := s.store.DeleteSession(r.Context(), claims.ID); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to revoke session")
		return
	}

	s.store.RecordAudit(r.Context(), &store.AuditEntry{
		UserID:   claims.UserID,
		Action:   "logout",
		Resource: "session/" + claims.ID,
	})

	writeJSON(w, http.StatusOK, map[string]string{"message": "logged out"})
}

func (s *Server) handleMe(w http.ResponseWriter, r *http.Request) {
	user := userFromContext(r)
	if user == nil {
		writeError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"id":         user.ID,
		"username":   user.Username,
		"email":      user.Email,
		"role":       user.Role,
		"status":     user.Status,
		"scope":      user.Scope,
		"expires_at": nullTimeJSON(user.ExpiresAt),
	})
}

func extractBearerToken(r *http.Request) string {
	if token := r.URL.Query().Get("token"); token != "" {
		return token
	}
	auth := r.Header.Get("Authorization")
	if len(auth) > 7 && auth[:7] == "Bearer " {
		return auth[7:]
	}
	return ""
}

func nullTimeJSON(t time.Time) any {
	if t.IsZero() {
		return nil
	}
	return t
}
