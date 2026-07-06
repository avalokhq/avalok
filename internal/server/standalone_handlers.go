package server

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"

	"github.com/avalokhq/avalok/internal/provider"
	"github.com/avalokhq/avalok/internal/store"
	"github.com/avalokhq/avalok/internal/workspace"

	"context"
	"time"
)

func (s *Server) handlePublicConfig(w http.ResponseWriter, r *http.Request) {
	settings, err := s.store.GetAllSettings(r.Context())
	if err != nil {
		settings = make(map[string]string)
	}

	boolSetting := func(key string) bool {
		v, ok := settings[key]
		return !ok || v != "false"
	}

	logBufferLines := 10000
	if v, ok := settings["log_buffer_lines"]; ok {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			logBufferLines = n
		}
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"enable_workspaces":   boolSetting("enable_workspaces"),
		"enable_environments": boolSetting("enable_environments"),
		"enable_services":     boolSetting("enable_services"),
		"log_buffer_lines":    logBufferLines,
	})
}

// --- Standalone Environment read endpoints ---

func (s *Server) handleListStandaloneEnvs(w http.ResponseWriter, r *http.Request) {
	user := userFromContext(r)
	envs, err := s.store.ListStandaloneEnvs(r.Context())
	if err != nil {
		writeInternalError(w, "internal error", err)
		return
	}

	type envSummary struct {
		Name        string `json:"name"`
		Description string `json:"description"`
		Services    int    `json:"services"`
	}

	result := make([]envSummary, 0)
	for _, env := range envs {
		if !user.HasStandaloneEnvAccess(env.Name) {
			continue
		}
		resolved := env.ResolveAll()
		result = append(result, envSummary{
			Name:        env.Name,
			Description: env.Description,
			Services:    len(resolved),
		})
	}
	writeJSON(w, http.StatusOK, result)
}

func (s *Server) handleListStandaloneEnvServices(w http.ResponseWriter, r *http.Request) {
	user := userFromContext(r)
	name := r.PathValue("name")

	if !user.HasStandaloneEnvAccess(name) {
		writeError(w, http.StatusForbidden, "access denied")
		return
	}

	env, err := s.store.GetStandaloneEnv(r.Context(), name)
	if err != nil {
		writeError(w, http.StatusNotFound, err.Error())
		return
	}

	resolved := env.ResolveAll()

	type serviceSummary struct {
		Name         string `json:"name"`
		FriendlyName string `json:"friendly_name"`
		Provider     string `json:"provider"`
		Target       string `json:"target"`
		HasLogDir    bool   `json:"has_log_dir"`
	}

	services := make([]serviceSummary, 0)
	for _, rs := range resolved {
		if !user.HasStandaloneEnvServiceAccess(name, rs.Service.Name) {
			continue
		}
		_, hasLogDir := rs.Config["log_dir"]
		services = append(services, serviceSummary{
			Name:         rs.Service.Name,
			FriendlyName: rs.Service.FriendlyName,
			Provider:     rs.Service.Provider,
			Target:       rs.Target.Name,
			HasLogDir:    hasLogDir,
		})
	}
	writeJSON(w, http.StatusOK, services)
}

func (s *Server) handleCheckStandaloneEnvService(w http.ResponseWriter, r *http.Request) {
	user := userFromContext(r)
	name := r.PathValue("name")
	svcName := r.PathValue("svc")

	if !user.HasStandaloneEnvServiceAccess(name, svcName) {
		writeError(w, http.StatusForbidden, "access denied")
		return
	}

	env, err := s.store.GetStandaloneEnv(r.Context(), name)
	if err != nil {
		writeJSON(w, http.StatusOK, map[string]any{"status": "down", "error": err.Error()})
		return
	}

	resolved, err := env.ResolveService(svcName)
	if err != nil {
		writeJSON(w, http.StatusOK, map[string]any{"status": "down", "error": err.Error()})
		return
	}

	s.checkResolved(w, r, resolved)
}

func (s *Server) handleStreamStandaloneEnvService(w http.ResponseWriter, r *http.Request) {
	user := userFromContext(r)
	name := r.PathValue("name")
	svcName := r.PathValue("svc")

	if !user.HasStandaloneEnvServiceAccess(name, svcName) {
		writeError(w, http.StatusForbidden, "access denied")
		return
	}

	env, err := s.store.GetStandaloneEnv(r.Context(), name)
	if err != nil {
		writeError(w, http.StatusNotFound, err.Error())
		return
	}

	resolved, err := env.ResolveService(svcName)
	if err != nil {
		writeError(w, http.StatusNotFound, err.Error())
		return
	}

	s.streamResolved(w, r, resolved)
}

// --- Standalone Service read endpoints ---

func (s *Server) handleListStandaloneServices(w http.ResponseWriter, r *http.Request) {
	user := userFromContext(r)
	svcs, err := s.store.ListStandaloneServices(r.Context())
	if err != nil {
		writeInternalError(w, "internal error", err)
		return
	}

	type svcSummary struct {
		Name        string `json:"name"`
		Description string `json:"description"`
		Provider    string `json:"provider"`
	}

	result := make([]svcSummary, 0)
	for _, svc := range svcs {
		if !user.HasStandaloneServiceAccess(svc.Name) {
			continue
		}
		result = append(result, svcSummary{
			Name:        svc.Name,
			Description: svc.Description,
			Provider:    svc.Provider,
		})
	}
	writeJSON(w, http.StatusOK, result)
}

func (s *Server) handleCheckStandaloneService(w http.ResponseWriter, r *http.Request) {
	user := userFromContext(r)
	name := r.PathValue("name")

	if !user.HasStandaloneServiceAccess(name) {
		writeError(w, http.StatusForbidden, "access denied")
		return
	}

	svc, err := s.store.GetStandaloneService(r.Context(), name)
	if err != nil {
		writeJSON(w, http.StatusOK, map[string]any{"status": "down", "error": err.Error()})
		return
	}

	resolved := svc.Resolve()
	s.checkResolved(w, r, resolved)
}

func (s *Server) handleStreamStandaloneService(w http.ResponseWriter, r *http.Request) {
	user := userFromContext(r)
	name := r.PathValue("name")

	if !user.HasStandaloneServiceAccess(name) {
		writeError(w, http.StatusForbidden, "access denied")
		return
	}

	svc, err := s.store.GetStandaloneService(r.Context(), name)
	if err != nil {
		writeError(w, http.StatusNotFound, err.Error())
		return
	}

	resolved := svc.Resolve()
	s.streamResolved(w, r, resolved)
}

// --- Shared check/stream helpers ---

func (s *Server) checkResolved(w http.ResponseWriter, r *http.Request, resolved *workspace.ResolvedService) {
	providerName, providerConfig := s.resolveWithCredentials(r.Context(), resolved, false, 0)

	p, ok := provider.Get(providerName)
	if !ok {
		writeJSON(w, http.StatusOK, map[string]any{"status": "down", "error": fmt.Sprintf("unknown provider: %s", providerName)})
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	if err := p.Connect(ctx, providerConfig); err != nil {
		writeJSON(w, http.StatusOK, map[string]any{"status": "down", "error": fmt.Sprintf("connect: %v", err)})
		return
	}
	defer p.Close()

	instances, err := p.ListInstances(ctx)
	if err != nil {
		writeJSON(w, http.StatusOK, map[string]any{"status": "down", "error": fmt.Sprintf("list instances: %v", err)})
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"status": "up", "instances": len(instances)})
}

func (s *Server) streamResolved(w http.ResponseWriter, r *http.Request, resolved *workspace.ResolvedService) {
	if r.Header.Get("Upgrade") == "websocket" {
		s.handleWebSocketStream(w, r, resolved)
		return
	}
	s.handleSSEStream(w, r, resolved)
}

// --- Admin CRUD: Standalone Environments ---

func (s *Server) handleAdminListStandaloneEnvs(w http.ResponseWriter, r *http.Request) {
	envs, err := s.store.ListStandaloneEnvs(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list standalone environments")
		return
	}

	type envSummary struct {
		Name        string `json:"name"`
		Description string `json:"description"`
		Services    int    `json:"services"`
	}

	result := make([]envSummary, 0, len(envs))
	for _, env := range envs {
		result = append(result, envSummary{
			Name:        env.Name,
			Description: env.Description,
			Services:    len(env.Services),
		})
	}
	writeJSON(w, http.StatusOK, result)
}

func (s *Server) handleCreateStandaloneEnv(w http.ResponseWriter, r *http.Request) {
	actor := userFromContext(r)
	var env workspace.StandaloneEnvironment
	if err := json.NewDecoder(r.Body).Decode(&env); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON: "+err.Error())
		return
	}
	if env.Name == "" {
		writeError(w, http.StatusBadRequest, "environment name is required")
		return
	}

	if err := s.store.SaveStandaloneEnv(r.Context(), &env); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to save standalone environment")
		return
	}

	s.store.RecordAudit(r.Context(), &store.AuditEntry{
		UserID:   actor.ID,
		Action:   "create_standalone_env",
		Resource: "env/" + env.Name,
	})

	logger.Info("standalone environment created", "user", actor.Username, "environment", env.Name)
	writeJSON(w, http.StatusCreated, map[string]any{
		"name":        env.Name,
		"description": env.Description,
		"services":    len(env.Services),
	})
}

func (s *Server) handleUpdateStandaloneEnv(w http.ResponseWriter, r *http.Request) {
	actor := userFromContext(r)
	name := r.PathValue("name")

	var env workspace.StandaloneEnvironment
	if err := json.NewDecoder(r.Body).Decode(&env); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON: "+err.Error())
		return
	}
	env.Name = name

	if err := s.store.SaveStandaloneEnv(r.Context(), &env); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to update standalone environment")
		return
	}

	s.store.RecordAudit(r.Context(), &store.AuditEntry{
		UserID:   actor.ID,
		Action:   "update_standalone_env",
		Resource: "env/" + name,
	})

	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (s *Server) handleDeleteStandaloneEnv(w http.ResponseWriter, r *http.Request) {
	actor := userFromContext(r)
	name := r.PathValue("name")

	if err := s.store.DeleteStandaloneEnv(r.Context(), name); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to delete standalone environment")
		return
	}

	s.store.RecordAudit(r.Context(), &store.AuditEntry{
		UserID:   actor.ID,
		Action:   "delete_standalone_env",
		Resource: "env/" + name,
	})

	logger.Info("standalone environment deleted", "user", actor.Username, "environment", name)
	writeJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}

// --- Admin CRUD: Standalone Services ---

func (s *Server) handleAdminListStandaloneServices(w http.ResponseWriter, r *http.Request) {
	svcs, err := s.store.ListStandaloneServices(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list standalone services")
		return
	}

	type svcSummary struct {
		Name        string `json:"name"`
		Description string `json:"description"`
		Provider    string `json:"provider"`
	}

	result := make([]svcSummary, 0, len(svcs))
	for _, svc := range svcs {
		result = append(result, svcSummary{
			Name:        svc.Name,
			Description: svc.Description,
			Provider:    svc.Provider,
		})
	}
	writeJSON(w, http.StatusOK, result)
}

func (s *Server) handleCreateStandaloneService(w http.ResponseWriter, r *http.Request) {
	actor := userFromContext(r)
	var svc workspace.StandaloneService
	if err := json.NewDecoder(r.Body).Decode(&svc); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON: "+err.Error())
		return
	}
	if svc.Name == "" {
		writeError(w, http.StatusBadRequest, "service name is required")
		return
	}
	if svc.Provider == "" {
		writeError(w, http.StatusBadRequest, "provider is required")
		return
	}

	if err := s.store.SaveStandaloneService(r.Context(), &svc); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to save standalone service")
		return
	}

	s.store.RecordAudit(r.Context(), &store.AuditEntry{
		UserID:   actor.ID,
		Action:   "create_standalone_service",
		Resource: "svc/" + svc.Name,
	})

	logger.Info("standalone service created", "user", actor.Username, "service", svc.Name)
	writeJSON(w, http.StatusCreated, map[string]any{
		"name":        svc.Name,
		"description": svc.Description,
		"provider":    svc.Provider,
	})
}

func (s *Server) handleUpdateStandaloneService(w http.ResponseWriter, r *http.Request) {
	actor := userFromContext(r)
	name := r.PathValue("name")

	var svc workspace.StandaloneService
	if err := json.NewDecoder(r.Body).Decode(&svc); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON: "+err.Error())
		return
	}
	svc.Name = name

	if err := s.store.SaveStandaloneService(r.Context(), &svc); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to update standalone service")
		return
	}

	s.store.RecordAudit(r.Context(), &store.AuditEntry{
		UserID:   actor.ID,
		Action:   "update_standalone_service",
		Resource: "svc/" + name,
	})

	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (s *Server) handleDeleteStandaloneService(w http.ResponseWriter, r *http.Request) {
	actor := userFromContext(r)
	name := r.PathValue("name")

	if err := s.store.DeleteStandaloneService(r.Context(), name); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to delete standalone service")
		return
	}

	s.store.RecordAudit(r.Context(), &store.AuditEntry{
		UserID:   actor.ID,
		Action:   "delete_standalone_service",
		Resource: "svc/" + name,
	})

	logger.Info("standalone service deleted", "user", actor.Username, "service", name)
	writeJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}
