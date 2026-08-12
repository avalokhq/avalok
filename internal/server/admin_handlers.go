package server

import (
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"

	"gopkg.in/yaml.v3"

	"github.com/avalokhq/avalok/internal/store"
	"github.com/avalokhq/avalok/internal/workspace"
)

// --- User Management ---

func (s *Server) handleListUsers(w http.ResponseWriter, r *http.Request) {
	users, err := s.store.ListUsers(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list users")
		return
	}

	type userResponse struct {
		ID        string   `json:"id"`
		Username  string   `json:"username"`
		Email     string   `json:"email,omitempty"`
		Role      string   `json:"role"`
		Status    string   `json:"status"`
		Scope     []string `json:"scope"`
		ExpiresAt any      `json:"expires_at"`
		CreatedAt any      `json:"created_at"`
	}

	result := make([]userResponse, 0, len(users))
	for _, u := range users {
		result = append(result, userResponse{
			ID:        u.ID,
			Username:  u.Username,
			Email:     u.Email,
			Role:      u.Role,
			Status:    effectiveStatus(u.Status),
			Scope:     u.Scope,
			ExpiresAt: nullTimeJSON(u.ExpiresAt),
			CreatedAt: nullTimeJSON(u.CreatedAt),
		})
	}

	writeJSON(w, http.StatusOK, result)
}

func (s *Server) handleGetUser(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	user, err := s.store.GetUser(r.Context(), id)
	if err != nil {
		writeError(w, http.StatusNotFound, "user not found")
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"id":         user.ID,
		"username":   user.Username,
		"email":      user.Email,
		"role":       user.Role,
		"status":     effectiveStatus(user.Status),
		"scope":      user.Scope,
		"expires_at": nullTimeJSON(user.ExpiresAt),
		"created_at": nullTimeJSON(user.CreatedAt),
		"updated_at": nullTimeJSON(user.UpdatedAt),
	})
}

func (s *Server) handleCreateUser(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Username  string   `json:"username"`
		Email     string   `json:"email"`
		Password  string   `json:"password"`
		Role      string   `json:"role"`
		Scope     []string `json:"scope"`
		ExpiresAt string   `json:"expires_at"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if req.Username == "" || req.Password == "" {
		writeError(w, http.StatusBadRequest, "username and password are required")
		return
	}

	if req.Role == "" {
		req.Role = "reader"
	}
	if req.Role != "admin" && req.Role != "reader" {
		writeError(w, http.StatusBadRequest, "role must be admin or reader")
		return
	}

	if existing, _ := s.store.GetUserByUsername(r.Context(), req.Username); existing != nil {
		writeError(w, http.StatusConflict, "username already taken")
		return
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to hash password")
		return
	}

	scope := req.Scope
	if scope == nil {
		scope = []string{}
	}

	user := &store.User{
		ID:       uuid.New().String(),
		Username: req.Username,
		Email:    req.Email,
		Password: string(hash),
		Role:     req.Role,
		Status:   "active",
		Scope:    scope,
	}

	if req.ExpiresAt != "" {
		t, err := time.Parse(time.RFC3339, req.ExpiresAt)
		if err != nil {
			writeError(w, http.StatusBadRequest, "expires_at must be RFC3339 format")
			return
		}
		user.ExpiresAt = t
	}

	if err := s.store.CreateUser(r.Context(), user); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to create user")
		return
	}

	actor := userFromContext(r)
	s.store.RecordAudit(r.Context(), &store.AuditEntry{
		UserID:   actor.ID,
		Action:   "create_user",
		Resource: "user/" + user.ID,
		Details:  map[string]string{"username": user.Username, "role": user.Role},
	})

	writeJSON(w, http.StatusCreated, map[string]any{
		"id":       user.ID,
		"username": user.Username,
		"role":     user.Role,
		"status":   user.Status,
	})
}

func (s *Server) handleUpdateUser(w http.ResponseWriter, r *http.Request) {
	actor := userFromContext(r)
	id := r.PathValue("id")

	user, err := s.store.GetUser(r.Context(), id)
	if err != nil {
		writeError(w, http.StatusNotFound, "user not found")
		return
	}

	var req struct {
		Role      *string  `json:"role"`
		Status    *string  `json:"status"`
		Scope     []string `json:"scope"`
		ExpiresAt *string  `json:"expires_at"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if req.Role != nil {
		if *req.Role != "admin" && *req.Role != "reader" {
			writeError(w, http.StatusBadRequest, "role must be admin or reader")
			return
		}
		user.Role = *req.Role
	}

	if req.Status != nil {
		if *req.Status != "active" && *req.Status != "pending" && *req.Status != "disabled" {
			writeError(w, http.StatusBadRequest, "status must be active, pending, or disabled")
			return
		}
		user.Status = *req.Status
	}

	if req.Scope != nil {
		user.Scope = req.Scope
	}

	if req.ExpiresAt != nil {
		if *req.ExpiresAt == "" {
			user.ExpiresAt = time.Time{}
		} else {
			t, err := time.Parse(time.RFC3339, *req.ExpiresAt)
			if err != nil {
				writeError(w, http.StatusBadRequest, "expires_at must be RFC3339 format")
				return
			}
			user.ExpiresAt = t
		}
	}

	if err := s.store.UpdateUser(r.Context(), user); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to update user")
		return
	}

	s.store.RecordAudit(r.Context(), &store.AuditEntry{
		UserID:   actor.ID,
		Action:   "update_user",
		Resource: "user/" + user.ID,
		Details:  map[string]string{"username": user.Username},
	})

	writeJSON(w, http.StatusOK, map[string]any{
		"id":       user.ID,
		"username": user.Username,
		"role":     user.Role,
		"status":   effectiveStatus(user.Status),
		"scope":    user.Scope,
	})
}

func (s *Server) handleDeleteUser(w http.ResponseWriter, r *http.Request) {
	actor := userFromContext(r)
	id := r.PathValue("id")

	if actor.ID == id {
		writeError(w, http.StatusBadRequest, "cannot delete yourself")
		return
	}

	user, err := s.store.GetUser(r.Context(), id)
	if err != nil {
		writeError(w, http.StatusNotFound, "user not found")
		return
	}

	s.store.DeleteUserSessions(r.Context(), id)

	if err := s.store.DeleteUser(r.Context(), id); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to delete user")
		return
	}

	s.store.RecordAudit(r.Context(), &store.AuditEntry{
		UserID:   actor.ID,
		Action:   "delete_user",
		Resource: "user/" + id,
		Details:  map[string]string{"username": user.Username},
	})

	writeJSON(w, http.StatusOK, map[string]string{"message": "user deleted"})
}

func (s *Server) handleApproveUser(w http.ResponseWriter, r *http.Request) {
	actor := userFromContext(r)
	id := r.PathValue("id")

	user, err := s.store.GetUser(r.Context(), id)
	if err != nil {
		writeError(w, http.StatusNotFound, "user not found")
		return
	}

	if user.Status != "pending" {
		writeError(w, http.StatusBadRequest, "user is not pending approval")
		return
	}

	var req struct {
		Scope     []string `json:"scope"`
		ExpiresAt string   `json:"expires_at"`
	}
	json.NewDecoder(r.Body).Decode(&req)

	user.Status = "active"
	if req.Scope != nil {
		user.Scope = req.Scope
	}
	if req.ExpiresAt != "" {
		t, err := time.Parse(time.RFC3339, req.ExpiresAt)
		if err != nil {
			writeError(w, http.StatusBadRequest, "expires_at must be RFC3339 format")
			return
		}
		user.ExpiresAt = t
	}

	if err := s.store.UpdateUser(r.Context(), user); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to approve user")
		return
	}

	s.store.RecordAudit(r.Context(), &store.AuditEntry{
		UserID:   actor.ID,
		Action:   "approve_user",
		Resource: "user/" + user.ID,
		Details:  map[string]string{"username": user.Username},
	})

	writeJSON(w, http.StatusOK, map[string]any{
		"id":       user.ID,
		"username": user.Username,
		"status":   "active",
		"scope":    user.Scope,
	})
}

func (s *Server) handleDisableUser(w http.ResponseWriter, r *http.Request) {
	actor := userFromContext(r)
	id := r.PathValue("id")

	if actor.ID == id {
		writeError(w, http.StatusBadRequest, "cannot disable yourself")
		return
	}

	user, err := s.store.GetUser(r.Context(), id)
	if err != nil {
		writeError(w, http.StatusNotFound, "user not found")
		return
	}

	user.Status = "disabled"
	if err := s.store.UpdateUser(r.Context(), user); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to disable user")
		return
	}

	s.store.DeleteUserSessions(r.Context(), id)

	s.store.RecordAudit(r.Context(), &store.AuditEntry{
		UserID:   actor.ID,
		Action:   "disable_user",
		Resource: "user/" + user.ID,
		Details:  map[string]string{"username": user.Username},
	})

	writeJSON(w, http.StatusOK, map[string]any{
		"id":       user.ID,
		"username": user.Username,
		"status":   "disabled",
	})
}

func (s *Server) handleResetPassword(w http.ResponseWriter, r *http.Request) {
	actor := userFromContext(r)
	id := r.PathValue("id")

	user, err := s.store.GetUser(r.Context(), id)
	if err != nil {
		writeError(w, http.StatusNotFound, "user not found")
		return
	}

	var req struct {
		Password string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Password == "" {
		writeError(w, http.StatusBadRequest, "password is required")
		return
	}
	if len(req.Password) < 8 {
		writeError(w, http.StatusBadRequest, "password must be at least 8 characters")
		return
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to hash password")
		return
	}

	user.Password = string(hash)
	if err := s.store.UpdateUser(r.Context(), user); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to reset password")
		return
	}

	s.store.DeleteUserSessions(r.Context(), id)

	s.store.RecordAudit(r.Context(), &store.AuditEntry{
		UserID:   actor.ID,
		Action:   "reset_password",
		Resource: "user/" + user.ID,
		Details:  map[string]string{"username": user.Username},
	})

	writeJSON(w, http.StatusOK, map[string]string{"message": "password reset"})
}

// --- Workspace Management ---

func (s *Server) handleAdminListWorkspaces(w http.ResponseWriter, r *http.Request) {
	workspaces, err := s.store.ListWorkspaces(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list workspaces")
		return
	}

	type wsSummary struct {
		Name         string `json:"name"`
		Description  string `json:"description"`
		Environments int    `json:"environments"`
		Services     int    `json:"services"`
	}

	result := make([]wsSummary, 0, len(workspaces))
	for _, ws := range workspaces {
		result = append(result, wsSummary{
			Name:         ws.Name,
			Description:  ws.Description,
			Environments: len(ws.Environments),
			Services:     len(ws.Services),
		})
	}

	writeJSON(w, http.StatusOK, result)
}

func (s *Server) handleImportWorkspace(w http.ResponseWriter, r *http.Request) {
	actor := userFromContext(r)
	contentType := r.Header.Get("Content-Type")

	var ws *workspace.Workspace
	var err error

	if strings.Contains(contentType, "application/json") {
		if err := json.NewDecoder(r.Body).Decode(&ws); err != nil {
			writeError(w, http.StatusBadRequest, "invalid JSON workspace")
			return
		}
	} else {
		body, readErr := io.ReadAll(r.Body)
		if readErr != nil {
			writeError(w, http.StatusBadRequest, "failed to read request body")
			return
		}
		ws, err = workspace.Parse(body)
		if err != nil {
			writeError(w, http.StatusBadRequest, "invalid workspace YAML: "+err.Error())
			return
		}
	}

	if ws.Name == "" {
		writeError(w, http.StatusBadRequest, "workspace name is required")
		return
	}

	if err := s.store.SaveWorkspace(r.Context(), ws); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to save workspace")
		return
	}

	s.store.RecordAudit(r.Context(), &store.AuditEntry{
		UserID:   actor.ID,
		Action:   "import_workspace",
		Resource: "workspace/" + ws.Name,
	})

	writeJSON(w, http.StatusCreated, map[string]any{
		"name":         ws.Name,
		"description":  ws.Description,
		"environments": len(ws.Environments),
		"services":     len(ws.Services),
	})
}

func (s *Server) handleUpdateWorkspace(w http.ResponseWriter, r *http.Request) {
	actor := userFromContext(r)
	name := r.PathValue("name")

	existing, err := s.store.GetWorkspace(r.Context(), name)
	if err != nil {
		writeError(w, http.StatusNotFound, "workspace not found")
		return
	}

	contentType := r.Header.Get("Content-Type")
	var ws *workspace.Workspace

	if strings.Contains(contentType, "application/json") {
		if err := json.NewDecoder(r.Body).Decode(&ws); err != nil {
			writeError(w, http.StatusBadRequest, "invalid JSON workspace")
			return
		}
	} else {
		body, readErr := io.ReadAll(r.Body)
		if readErr != nil {
			writeError(w, http.StatusBadRequest, "failed to read request body")
			return
		}
		ws, err = workspace.Parse(body)
		if err != nil {
			writeError(w, http.StatusBadRequest, "invalid workspace YAML: "+err.Error())
			return
		}
	}

	if ws.Name != name {
		writeError(w, http.StatusBadRequest, "workspace name in body must match URL")
		return
	}

	preserveSensitiveTargetFields(ws, existing)

	if err := s.store.SaveWorkspace(r.Context(), ws); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to update workspace")
		return
	}

	s.store.RecordAudit(r.Context(), &store.AuditEntry{
		UserID:   actor.ID,
		Action:   "update_workspace",
		Resource: "workspace/" + ws.Name,
	})

	writeJSON(w, http.StatusOK, map[string]any{
		"name":         ws.Name,
		"description":  ws.Description,
		"environments": len(ws.Environments),
		"services":     len(ws.Services),
	})
}

func (s *Server) handleDeleteWorkspace(w http.ResponseWriter, r *http.Request) {
	actor := userFromContext(r)
	name := r.PathValue("name")

	if _, err := s.store.GetWorkspace(r.Context(), name); err != nil {
		writeError(w, http.StatusNotFound, "workspace not found")
		return
	}

	if err := s.store.DeleteWorkspace(r.Context(), name); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to delete workspace")
		return
	}

	s.store.RecordAudit(r.Context(), &store.AuditEntry{
		UserID:   actor.ID,
		Action:   "delete_workspace",
		Resource: "workspace/" + name,
	})

	writeJSON(w, http.StatusOK, map[string]string{"message": "workspace deleted"})
}

func preserveSensitiveTargetFields(incoming, existing *workspace.Workspace) {
	for i := range incoming.Environments {
		env := &incoming.Environments[i]
		oldEnv := existing.FindEnvironment(env.Name)
		if oldEnv == nil {
			continue
		}
		for j := range env.Targets {
			t := &env.Targets[j]
			old := oldEnv.FindTarget(t.Name)
			if old == nil {
				continue
			}
			if t.CredentialProfile != "" {
				continue
			}
			if t.Password == "" {
				t.Password = old.Password
			}
			if t.Passphrase == "" {
				t.Passphrase = old.Passphrase
			}
			if t.BearerToken == "" {
				t.BearerToken = old.BearerToken
			}
			if t.KubeconfigContent == "" {
				t.KubeconfigContent = old.KubeconfigContent
			}
			if t.CACert == "" {
				t.CACert = old.CACert
			}
		}
	}
}

func (s *Server) handleExportWorkspaceYAML(w http.ResponseWriter, r *http.Request) {
	name := r.PathValue("name")
	ws, err := s.store.GetWorkspace(r.Context(), name)
	if err != nil {
		writeError(w, http.StatusNotFound, "workspace not found")
		return
	}

	sanitized := make([]workspace.Environment, len(ws.Environments))
	copy(sanitized, ws.Environments)
	for i := range sanitized {
		targets := make([]workspace.Target, len(sanitized[i].Targets))
		copy(targets, sanitized[i].Targets)
		for j := range targets {
			targets[j].Password = ""
			targets[j].Passphrase = ""
			targets[j].BearerToken = ""
			targets[j].KubeconfigContent = ""
		}
		sanitized[i].Targets = targets
	}

	type workspaceMeta struct {
		Name        string `yaml:"name"`
		Description string `yaml:"description,omitempty"`
	}
	fileFormat := struct {
		Workspace    workspaceMeta          `yaml:"workspace"`
		Services     []workspace.Service     `yaml:"services"`
		Environments []workspace.Environment `yaml:"environments"`
		Settings     workspace.Settings      `yaml:"settings,omitempty"`
	}{
		Workspace:    workspaceMeta{Name: ws.Name, Description: ws.Description},
		Services:     ws.Services,
		Environments: sanitized,
		Settings:     ws.Settings,
	}

	data, err := yaml.Marshal(fileFormat)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to marshal workspace")
		return
	}

	w.Header().Set("Content-Type", "application/x-yaml")
	w.Write(data)
}

func (s *Server) handleGetSettings(w http.ResponseWriter, r *http.Request) {
	settings, err := s.store.GetAllSettings(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load settings")
		return
	}
	writeJSON(w, http.StatusOK, settings)
}

var allowedSettings = map[string]bool{
	"enable_workspaces":      true,
	"enable_environments":    true,
	"enable_services":        true,
	"company_name":           true,
	"log_buffer_lines":       true,
	"self_registration":      true,
	"redact_credentials":     true,
	"file_browser_page_size": true,
	"ws_max_connections":     true,
	"ws_max_message_kb":      true,
	"stream_tail_lines":      true,
}

func (s *Server) handleUpdateSettings(w http.ResponseWriter, r *http.Request) {
	var body map[string]string
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON")
		return
	}
	for k, v := range body {
		if !allowedSettings[k] {
			writeError(w, http.StatusBadRequest, "unknown setting: "+k)
			return
		}
		if err := s.store.SetSetting(r.Context(), k, v); err != nil {
			writeError(w, http.StatusInternalServerError, "failed to save setting")
			return
		}
	}
	settings, _ := s.store.GetAllSettings(r.Context())
	writeJSON(w, http.StatusOK, settings)
}

func effectiveStatus(status string) string {
	if status == "" {
		return "active"
	}
	return status
}
