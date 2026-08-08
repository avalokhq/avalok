package server

import (
	"context"
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"sync"
	"time"

	"github.com/avalokhq/avalok/internal/auth"
	tokenauth "github.com/avalokhq/avalok/internal/auth/token"
	"github.com/avalokhq/avalok/internal/credential"
	"github.com/avalokhq/avalok/internal/filebrowser"
	"github.com/avalokhq/avalok/internal/provider"
	"github.com/avalokhq/avalok/internal/store"
	"github.com/avalokhq/avalok/internal/stream"
	"github.com/avalokhq/avalok/internal/workspace"
)

type contextKey string

const userContextKey contextKey = "user"

type Server struct {
	store   store.Store
	creds   credential.Resolver
	auth    auth.Strategy
	mux     *http.ServeMux
	httpSrv *http.Server

	serverMode     bool
	allowedOrigins []string

	tempManager *filebrowser.TempManager

	healthMu      sync.RWMutex
	healthCache   []ServiceCheckResult
	healthChecked bool
}

type Option func(*Server)

func WithAuth(strategy auth.Strategy) Option {
	return func(s *Server) {
		s.auth = strategy
	}
}

func WithServerMode() Option {
	return func(s *Server) {
		s.serverMode = true
	}
}

func New(s store.Store, creds credential.Resolver, opts ...Option) *Server {
	srv := &Server{
		store:       s,
		creds:       creds,
		mux:         http.NewServeMux(),
		tempManager: filebrowser.NewTempManager(0),
	}
	for _, opt := range opts {
		opt(srv)
	}
	if srv.auth == nil {
		srv.auth = tokenauth.New(s)
	}
	srv.routes()
	srv.serveFrontend()
	return srv
}

func (s *Server) routes() {
	s.mux.HandleFunc("GET /api/health", s.handleHealth)
	s.mux.HandleFunc("GET /api/templates", s.handleListTemplates)
	s.mux.HandleFunc("GET /api/stats", s.authMiddleware(s.handleStats))
	s.mux.HandleFunc("GET /api/ws", s.authMiddleware(s.handleListWorkspaces))
	s.mux.HandleFunc("GET /api/ws/{name}", s.authMiddleware(s.handleGetWorkspace))
	s.mux.HandleFunc("GET /api/ws/{name}/env", s.authMiddleware(s.handleListEnvironments))
	s.mux.HandleFunc("GET /api/ws/{name}/svc", s.authMiddleware(s.handleListWorkspaceServices))
	s.mux.HandleFunc("GET /api/ws/{name}/svc/{svc}/env", s.authMiddleware(s.handleListServiceEnvironments))
	s.mux.HandleFunc("GET /api/ws/{name}/env/{env}/svc", s.authMiddleware(s.handleListServices))
	s.mux.HandleFunc("GET /api/ws/{name}/env/{env}/svc/{svc}/instances", s.authMiddleware(s.handleListInstances))
	s.mux.HandleFunc("GET /api/ws/{name}/env/{env}/svc/{svc}/check", s.authMiddleware(s.handleCheckService))
	s.mux.HandleFunc("/api/ws/{name}/env/{env}/svc/{svc}/stream", s.authMiddleware(s.handleStream))

	s.mux.HandleFunc("GET /api/ws/{name}/svc/{svc}/storage/objects", s.authMiddleware(s.handleListServiceStorageObjects))
	s.mux.HandleFunc("GET /api/ws/{name}/svc/{svc}/storage/content/{key...}", s.authMiddleware(s.handleServiceStorageContent))
	s.mux.HandleFunc("/api/ws/{name}/svc/{svc}/storage/stream", s.authMiddleware(s.handleServiceStorageStream))

	s.mux.HandleFunc("GET /api/ws/{name}/env/{env}/svc/{svc}/files", s.authMiddleware(s.handleListFiles))
	s.mux.HandleFunc("GET /api/ws/{name}/env/{env}/svc/{svc}/files/{filename}", s.authMiddleware(s.handleReadFile))
	s.mux.HandleFunc("GET /api/ws/{name}/env/{env}/svc/{svc}/files/{filename}/download", s.authMiddleware(s.handleDownloadFile))
	s.mux.HandleFunc("POST /api/ws/{name}/env/{env}/svc/{svc}/files/search", s.authMiddleware(s.handleSearchFiles))

	s.mux.HandleFunc("GET /api/config", s.authMiddleware(s.handlePublicConfig))

	s.mux.HandleFunc("GET /api/env", s.authMiddleware(s.handleListStandaloneEnvs))
	s.mux.HandleFunc("GET /api/env/{name}/svc", s.authMiddleware(s.handleListStandaloneEnvServices))
	s.mux.HandleFunc("GET /api/env/{name}/svc/{svc}/check", s.authMiddleware(s.handleCheckStandaloneEnvService))
	s.mux.HandleFunc("/api/env/{name}/svc/{svc}/stream", s.authMiddleware(s.handleStreamStandaloneEnvService))

	s.mux.HandleFunc("GET /api/svc", s.authMiddleware(s.handleListStandaloneServices))
	s.mux.HandleFunc("GET /api/svc/{name}/check", s.authMiddleware(s.handleCheckStandaloneService))
	s.mux.HandleFunc("/api/svc/{name}/stream", s.authMiddleware(s.handleStreamStandaloneService))

	if s.serverMode {
		s.mux.HandleFunc("POST /api/auth/register", rateLimitMiddleware(s.handleRegister))
		s.mux.HandleFunc("POST /api/auth/login", rateLimitMiddleware(s.handleLogin))
		s.mux.HandleFunc("POST /api/auth/logout", s.handleLogout)
		s.mux.HandleFunc("GET /api/auth/me", s.authMiddleware(s.handleMe))

		s.mux.HandleFunc("GET /api/admin/users", s.adminOrManager(s.handleListUsers))
		s.mux.HandleFunc("GET /api/admin/users/{id}", s.adminOrManager(s.handleGetUser))
		s.mux.HandleFunc("POST /api/admin/users", s.adminOnly(s.handleCreateUser))
		s.mux.HandleFunc("PUT /api/admin/users/{id}", s.adminOrManager(s.handleUpdateUser))
		s.mux.HandleFunc("DELETE /api/admin/users/{id}", s.adminOnly(s.handleDeleteUser))
		s.mux.HandleFunc("POST /api/admin/users/{id}/approve", s.adminOrManager(s.handleApproveUser))
		s.mux.HandleFunc("POST /api/admin/users/{id}/disable", s.adminOnly(s.handleDisableUser))
		s.mux.HandleFunc("POST /api/admin/users/{id}/reset-password", s.adminOnly(s.handleResetPassword))

		s.mux.HandleFunc("GET /api/admin/workspaces", s.adminOnly(s.handleAdminListWorkspaces))
		s.mux.HandleFunc("POST /api/admin/workspaces", s.adminOnly(s.handleImportWorkspace))
		s.mux.HandleFunc("PUT /api/admin/workspaces/{name}", s.adminOnly(s.handleUpdateWorkspace))
		s.mux.HandleFunc("DELETE /api/admin/workspaces/{name}", s.adminOnly(s.handleDeleteWorkspace))
		s.mux.HandleFunc("GET /api/admin/workspaces/{name}/yaml", s.adminOnly(s.handleExportWorkspaceYAML))

		s.mux.HandleFunc("GET /api/admin/credentials", s.adminOnly(s.handleListCredentials))
		s.mux.HandleFunc("GET /api/admin/credentials/{name}", s.adminOnly(s.handleGetCredential))
		s.mux.HandleFunc("POST /api/admin/credentials", s.adminOnly(s.handleCreateCredential))
		s.mux.HandleFunc("PUT /api/admin/credentials/{name}", s.adminOnly(s.handleUpdateCredential))
		s.mux.HandleFunc("DELETE /api/admin/credentials/{name}", s.adminOnly(s.handleDeleteCredential))
		s.mux.HandleFunc("POST /api/admin/credentials/{name}/test", s.adminOnly(s.handleTestCredential))

		s.mux.HandleFunc("GET /api/admin/resources", s.adminOrResourceScoped(s.handleListResources))
		s.mux.HandleFunc("GET /api/admin/resources/{name}", s.adminOrResourceScoped(s.handleGetResource))
		s.mux.HandleFunc("POST /api/admin/resources", s.adminOnly(s.handleCreateResource))
		s.mux.HandleFunc("PUT /api/admin/resources/{name}", s.adminOnly(s.handleUpdateResource))
		s.mux.HandleFunc("DELETE /api/admin/resources/{name}", s.adminOnly(s.handleDeleteResource))
		s.mux.HandleFunc("POST /api/admin/resources/{name}/test", s.adminOnly(s.handleTestResource))
		s.mux.HandleFunc("GET /api/admin/resources/{name}/overview", s.adminOrResourceScoped(s.handleResourceOverview))
		s.mux.HandleFunc("GET /api/admin/resources/{name}/namespaces", s.adminOrResourceScoped(s.handleListResourceNamespaces))
		s.mux.HandleFunc("GET /api/admin/resources/{name}/namespaces/{ns}/workloads", s.adminOrResourceScoped(s.handleListResourceWorkloads))
		s.mux.HandleFunc("/api/admin/resources/{name}/namespaces/{ns}/workloads/{kind}/{workload}/stream", s.adminOrResourceScoped(s.handleResourceStream))
		s.mux.HandleFunc("GET /api/admin/resources/{name}/storage/objects", s.adminOrResourceScoped(s.handleListStorageObjects))
		s.mux.HandleFunc("/api/admin/resources/{name}/storage/stream/{key...}", s.adminOrResourceScoped(s.handleStorageObjectStream))
		s.mux.HandleFunc("GET /api/admin/resources/{name}/storage/content/{key...}", s.adminOrResourceScoped(s.handleStorageObjectContent))

		s.mux.HandleFunc("GET /api/admin/settings", s.adminOnly(s.handleGetSettings))
		s.mux.HandleFunc("PUT /api/admin/settings", s.adminOnly(s.handleUpdateSettings))

		s.mux.HandleFunc("GET /api/admin/environments", s.adminOnly(s.handleAdminListStandaloneEnvs))
		s.mux.HandleFunc("POST /api/admin/environments", s.adminOnly(s.handleCreateStandaloneEnv))
		s.mux.HandleFunc("PUT /api/admin/environments/{name}", s.adminOnly(s.handleUpdateStandaloneEnv))
		s.mux.HandleFunc("DELETE /api/admin/environments/{name}", s.adminOnly(s.handleDeleteStandaloneEnv))
		s.mux.HandleFunc("GET /api/admin/environments/{name}/yaml", s.adminOnly(s.handleExportStandaloneEnvYAML))

		s.mux.HandleFunc("GET /api/admin/services", s.adminOnly(s.handleAdminListStandaloneServices))
		s.mux.HandleFunc("POST /api/admin/services", s.adminOnly(s.handleCreateStandaloneService))
		s.mux.HandleFunc("PUT /api/admin/services/{name}", s.adminOnly(s.handleUpdateStandaloneService))
		s.mux.HandleFunc("DELETE /api/admin/services/{name}", s.adminOnly(s.handleDeleteStandaloneService))
		s.mux.HandleFunc("GET /api/admin/services/{name}/yaml", s.adminOnly(s.handleExportStandaloneServiceYAML))
	}
}

func (s *Server) Start(addr string) error {
	s.allowedOrigins = buildAllowedOrigins(addr)
	s.httpSrv = &http.Server{
		Addr:         addr,
		Handler:      securityHeaders(s.mux),
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 0,
		IdleTimeout:  60 * time.Second,
	}
	go s.runHealthLoop()
	return s.httpSrv.ListenAndServe()
}

func securityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("X-Frame-Options", "DENY")
		w.Header().Set("Referrer-Policy", "strict-origin-when-cross-origin")
		w.Header().Set("Permissions-Policy", "camera=(), microphone=(), geolocation=()")

		if r.Method == http.MethodPost || r.Method == http.MethodPut {
			r.Body = http.MaxBytesReader(w, r.Body, 1<<20) // 1 MB
		}

		next.ServeHTTP(w, r)
	})
}

func (s *Server) runHealthLoop() {
	s.refreshHealth()

	ticker := time.NewTicker(60 * time.Second)
	defer ticker.Stop()
	for range ticker.C {
		if s.httpSrv == nil {
			return
		}
		s.refreshHealth()
	}
}

func (s *Server) refreshHealth() {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	results := s.CheckAllServices(ctx)
	s.healthMu.Lock()
	s.healthCache = results
	s.healthChecked = true
	s.healthMu.Unlock()
}

func (s *Server) cachedHealth() ([]ServiceCheckResult, bool) {
	s.healthMu.RLock()
	defer s.healthMu.RUnlock()
	return s.healthCache, s.healthChecked
}

func (s *Server) Shutdown(ctx context.Context) error {
	if s.tempManager != nil {
		s.tempManager.CleanupAll()
	}
	if s.httpSrv != nil {
		return s.httpSrv.Shutdown(ctx)
	}
	return nil
}

func userFromContext(r *http.Request) *store.User {
	u, _ := r.Context().Value(userContextKey).(*store.User)
	return u
}

type ServiceCheckResult struct {
	Workspace      string
	Environment    string
	Service        string
	Provider       string
	Status         string
	Error          string
	StandaloneType string
}

func (s *Server) CheckAllServices(ctx context.Context) []ServiceCheckResult {
	workspaces, err := s.store.ListWorkspaces(ctx)
	if err != nil {
		return nil
	}

	var results []ServiceCheckResult
	for _, ws := range workspaces {
		for _, env := range ws.Environments {
			resolved, err := ws.Resolve(env.Name)
			if err != nil {
				continue
			}
			for _, rs := range resolved {
				result := ServiceCheckResult{
					Workspace:   ws.Name,
					Environment: env.Name,
					Service:     rs.Service.Name,
					Provider:    rs.Service.Provider,
				}
				s.checkOneService(ctx, &rs, &result)
				results = append(results, result)
			}
		}
	}

	standaloneEnvs, _ := s.store.ListStandaloneEnvs(ctx)
	for _, env := range standaloneEnvs {
		for _, rs := range env.ResolveAll() {
			result := ServiceCheckResult{
				Environment:    env.Name,
				Service:        rs.Service.Name,
				Provider:       rs.Service.Provider,
				StandaloneType: "env",
			}
			s.checkOneService(ctx, &rs, &result)
			results = append(results, result)
		}
	}

	standaloneSvcs, _ := s.store.ListStandaloneServices(ctx)
	for _, svc := range standaloneSvcs {
		rs := svc.Resolve()
		result := ServiceCheckResult{
			Service:        rs.Service.Name,
			Provider:       rs.Service.Provider,
			StandaloneType: "svc",
		}
		s.checkOneService(ctx, rs, &result)
		results = append(results, result)
	}

	return results
}

func (s *Server) checkOneService(ctx context.Context, rs *workspace.ResolvedService, result *ServiceCheckResult) {
	provName, provConfig := s.resolveWithCredentials(ctx, rs, false, 0)

	p, ok := provider.Get(provName)
	if !ok {
		result.Status = "down"
		result.Error = "unknown provider: " + provName
		return
	}

	checkCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	connErr := p.Connect(checkCtx, provConfig)
	if connErr != nil {
		cancel()
		result.Status = "down"
		result.Error = connErr.Error()
	} else {
		_, listErr := p.ListInstances(checkCtx)
		cancel()
		p.Close()
		if listErr != nil {
			result.Status = "down"
			result.Error = listErr.Error()
		} else {
			result.Status = "up"
		}
	}
}

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	mode := "serve"
	if s.serverMode {
		mode = "server"
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok", "mode": mode})
}

func (s *Server) handleListTemplates(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, workspace.ListTemplates())
}

func (s *Server) handleStats(w http.ResponseWriter, r *http.Request) {
	user := userFromContext(r)
	workspaces, err := s.store.ListWorkspaces(r.Context())
	if err != nil {
		writeInternalError(w, "internal error", err)
		return
	}

	cached, checked := s.cachedHealth()
	healthMap := make(map[string]string)
	if checked {
		for _, cr := range cached {
			var key string
			switch cr.StandaloneType {
			case "env":
				key = "env:" + cr.Environment + "/" + cr.Service
			case "svc":
				key = "svc:" + cr.Service
			default:
				key = cr.Workspace + "/" + cr.Environment + "/" + cr.Service
			}
			healthMap[key] = cr.Status
		}
	}

	getStatus := func(key string) string {
		if st, ok := healthMap[key]; ok {
			return st
		}
		return "checking"
	}

	type groupStats struct {
		Count        int `json:"count"`
		Environments int `json:"environments,omitempty"`
		Services     int `json:"services"`
		Up           int `json:"up"`
		Down         int `json:"down"`
	}

	var ws groupStats
	for _, w := range workspaces {
		if !user.HasWorkspaceAccess(w.Name) {
			continue
		}
		ws.Count++
		for _, env := range w.Environments {
			if !user.HasEnvAccess(w.Name, env.Name) {
				continue
			}
			ws.Environments++
			resolved, err := w.Resolve(env.Name)
			if err != nil {
				continue
			}
			for _, rs := range resolved {
				if !user.HasAccess(w.Name, env.Name, rs.Service.Name) {
					continue
				}
				ws.Services++
				status := getStatus(w.Name + "/" + env.Name + "/" + rs.Service.Name)
				if status == "up" {
					ws.Up++
				} else if status != "checking" {
					ws.Down++
				}
			}
		}
	}

	var envStats groupStats
	standaloneEnvs, _ := s.store.ListStandaloneEnvs(r.Context())
	for _, env := range standaloneEnvs {
		if !user.HasStandaloneEnvAccess(env.Name) {
			continue
		}
		envStats.Count++
		for _, rs := range env.ResolveAll() {
			if !user.HasStandaloneEnvServiceAccess(env.Name, rs.Service.Name) {
				continue
			}
			envStats.Services++
			status := getStatus("env:" + env.Name + "/" + rs.Service.Name)
			if status == "up" {
				envStats.Up++
			} else if status != "checking" {
				envStats.Down++
			}
		}
	}

	var svcStats groupStats
	standaloneSvcs, _ := s.store.ListStandaloneServices(r.Context())
	for _, svc := range standaloneSvcs {
		if !user.HasStandaloneServiceAccess(svc.Name) {
			continue
		}
		svcStats.Count++
		status := getStatus("svc:" + svc.Name)
		if status == "up" {
			svcStats.Up++
		} else if status != "checking" {
			svcStats.Down++
		}
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"workspace_stats":    ws,
		"environment_stats":  envStats,
		"service_stats":      svcStats,
	})
}

func (s *Server) handleListWorkspaces(w http.ResponseWriter, r *http.Request) {
	user := userFromContext(r)
	workspaces, err := s.store.ListWorkspaces(r.Context())
	if err != nil {
		writeInternalError(w, "internal error", err)
		return
	}

	type hierarchyInfo struct {
		Name   string   `json:"name"`
		Levels []string `json:"levels"`
	}

	type workspaceSummary struct {
		Name         string        `json:"name"`
		Description  string        `json:"description"`
		Environments int           `json:"environments"`
		Services     int           `json:"services"`
		Hierarchy    hierarchyInfo `json:"hierarchy"`
	}

	summaries := make([]workspaceSummary, 0)
	for _, ws := range workspaces {
		if !user.HasWorkspaceAccess(ws.Name) {
			continue
		}
		envCount := 0
		for _, env := range ws.Environments {
			if !user.HasEnvAccess(ws.Name, env.Name) {
				continue
			}
			envCount++
		}
		svcCount := len(ws.Services)
		if envCount > 0 {
			tmpl := workspace.GetTemplate(ws.Settings.Hierarchy)
			summaries = append(summaries, workspaceSummary{
				Name:         ws.Name,
				Description:  ws.Description,
				Environments: envCount,
				Services:     svcCount,
				Hierarchy:    hierarchyInfo{Name: tmpl.Name, Levels: tmpl.Levels},
			})
		}
	}

	writeJSON(w, http.StatusOK, summaries)
}

func (s *Server) handleGetWorkspace(w http.ResponseWriter, r *http.Request) {
	user := userFromContext(r)
	name := r.PathValue("name")
	if !user.HasWorkspaceAccess(name) {
		writeError(w, http.StatusForbidden, "access denied")
		return
	}
	ws, err := s.store.GetWorkspace(r.Context(), name)
	if err != nil {
		writeError(w, http.StatusNotFound, "workspace not found")
		return
	}

	if len(user.Scope) > 0 {
		var filtered []workspace.Environment
		for _, env := range ws.Environments {
			if user.HasEnvAccess(name, env.Name) {
				filtered = append(filtered, env)
			}
		}
		ws = &workspace.Workspace{
			Name:         ws.Name,
			Description:  ws.Description,
			Services:     ws.Services,
			Environments: filtered,
			Settings:     ws.Settings,
		}
	}

	writeJSON(w, http.StatusOK, ws)
}

func (s *Server) handleListEnvironments(w http.ResponseWriter, r *http.Request) {
	user := userFromContext(r)
	name := r.PathValue("name")
	if !user.HasWorkspaceAccess(name) {
		writeError(w, http.StatusForbidden, "access denied")
		return
	}

	ws, err := s.store.GetWorkspace(r.Context(), name)
	if err != nil {
		writeError(w, http.StatusNotFound, err.Error())
		return
	}

	type envSummary struct {
		Name    string `json:"name"`
		Targets int    `json:"targets"`
	}

	var envs []envSummary
	for _, env := range ws.Environments {
		if !user.HasEnvAccess(name, env.Name) {
			continue
		}
		envs = append(envs, envSummary{
			Name:    env.Name,
			Targets: len(env.Targets),
		})
	}

	writeJSON(w, http.StatusOK, envs)
}

func (s *Server) handleListServices(w http.ResponseWriter, r *http.Request) {
	user := userFromContext(r)
	name := r.PathValue("name")
	envName := r.PathValue("env")

	if !user.HasEnvAccess(name, envName) {
		writeError(w, http.StatusForbidden, "access denied")
		return
	}

	ws, err := s.store.GetWorkspace(r.Context(), name)
	if err != nil {
		writeError(w, http.StatusNotFound, err.Error())
		return
	}

	resolved, err := ws.Resolve(envName)
	if err != nil {
		writeError(w, http.StatusNotFound, err.Error())
		return
	}

	type serviceSummary struct {
		Name         string `json:"name"`
		FriendlyName string `json:"friendly_name"`
		Provider     string `json:"provider"`
		Target       string `json:"target"`
		Resource     string `json:"resource,omitempty"`
		HasLogDir    bool   `json:"has_log_dir"`
	}

	services := make([]serviceSummary, 0)
	resolvedNames := make(map[string]bool)
	for _, rs := range resolved {
		if !user.HasAccess(name, envName, rs.Service.Name) {
			continue
		}
		resolvedNames[rs.Service.Name] = true
		_, hasLogDir := rs.Config["log_dir"]
		services = append(services, serviceSummary{
			Name:         rs.Service.Name,
			FriendlyName: rs.Service.FriendlyName,
			Provider:     rs.Service.Provider,
			Target:       rs.Target.Name,
			Resource:     rs.Service.Resource,
			HasLogDir:    hasLogDir,
		})
	}

	for _, svc := range ws.Services {
		if resolvedNames[svc.Name] {
			continue
		}
		_, hasLogDir := svc.Config["log_dir"]
		services = append(services, serviceSummary{
			Name:         svc.Name,
			FriendlyName: svc.FriendlyName,
			Provider:     svc.Provider,
			Resource:     svc.Resource,
			HasLogDir:    hasLogDir,
		})
	}

	writeJSON(w, http.StatusOK, services)
}

func (s *Server) handleListWorkspaceServices(w http.ResponseWriter, r *http.Request) {
	user := userFromContext(r)
	name := r.PathValue("name")
	if !user.HasWorkspaceAccess(name) {
		writeError(w, http.StatusForbidden, "access denied")
		return
	}

	ws, err := s.store.GetWorkspace(r.Context(), name)
	if err != nil {
		writeError(w, http.StatusNotFound, err.Error())
		return
	}

	type svcSummary struct {
		Name         string `json:"name"`
		FriendlyName string `json:"friendly_name"`
		Provider     string `json:"provider"`
		Environments int    `json:"environments"`
	}

	svcNames := ws.ListUniqueServiceNames()
	summaries := make([]svcSummary, 0, len(svcNames))
	for _, svcName := range svcNames {
		svc := ws.FindService(svcName)
		if svc == nil {
			continue
		}
		envs := ws.ListEnvironmentsForService(svcName)
		envCount := 0
		for _, env := range envs {
			if user.HasEnvAccess(name, env.Name) {
				envCount++
			}
		}
		if envCount > 0 {
			summaries = append(summaries, svcSummary{
				Name:         svc.Name,
				FriendlyName: svc.FriendlyName,
				Provider:     svc.Provider,
				Environments: envCount,
			})
		}
	}

	writeJSON(w, http.StatusOK, summaries)
}

func (s *Server) handleListServiceEnvironments(w http.ResponseWriter, r *http.Request) {
	user := userFromContext(r)
	name := r.PathValue("name")
	svcName := r.PathValue("svc")

	if !user.HasWorkspaceAccess(name) {
		writeError(w, http.StatusForbidden, "access denied")
		return
	}

	ws, err := s.store.GetWorkspace(r.Context(), name)
	if err != nil {
		writeError(w, http.StatusNotFound, err.Error())
		return
	}

	type envSummary struct {
		Name    string `json:"name"`
		Targets int    `json:"targets"`
	}

	envs := ws.ListEnvironmentsForService(svcName)
	summaries := make([]envSummary, 0, len(envs))
	for _, env := range envs {
		if !user.HasEnvAccess(name, env.Name) {
			continue
		}
		summaries = append(summaries, envSummary{
			Name:    env.Name,
			Targets: len(env.Targets),
		})
	}

	writeJSON(w, http.StatusOK, summaries)
}

func (s *Server) handleListInstances(w http.ResponseWriter, r *http.Request) {
	user := userFromContext(r)
	name := r.PathValue("name")
	envName := r.PathValue("env")
	svcName := r.PathValue("svc")

	if !user.HasAccess(name, envName, svcName) {
		writeError(w, http.StatusForbidden, "access denied")
		return
	}

	ws, err := s.store.GetWorkspace(r.Context(), name)
	if err != nil {
		writeError(w, http.StatusNotFound, err.Error())
		return
	}

	resolved, err := ws.ResolveService(envName, svcName)
	if err != nil {
		writeError(w, http.StatusNotFound, err.Error())
		return
	}

	providerName, providerConfig := s.resolveWithCredentials(r.Context(), resolved, false, 0)

	p, ok := provider.Get(providerName)
	if !ok {
		writeError(w, http.StatusBadRequest, fmt.Sprintf("unknown provider: %s", providerName))
		return
	}

	if err := p.Connect(r.Context(), providerConfig); err != nil {
		writeInternalError(w, "connecting to provider", err)
		return
	}
	defer p.Close()

	instances, err := p.ListInstances(r.Context())
	if err != nil {
		writeInternalError(w, "listing instances", err)
		return
	}

	writeJSON(w, http.StatusOK, instances)
}

func (s *Server) handleCheckService(w http.ResponseWriter, r *http.Request) {
	user := userFromContext(r)
	name := r.PathValue("name")
	envName := r.PathValue("env")
	svcName := r.PathValue("svc")

	if !user.HasAccess(name, envName, svcName) {
		writeError(w, http.StatusForbidden, "access denied")
		return
	}

	ws, err := s.store.GetWorkspace(r.Context(), name)
	if err != nil {
		writeJSON(w, http.StatusOK, map[string]any{"status": "down", "error": err.Error()})
		return
	}

	resolved, err := ws.ResolveService(envName, svcName)
	if err != nil {
		writeJSON(w, http.StatusOK, map[string]any{"status": "down", "error": err.Error()})
		return
	}

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

func (s *Server) handleStream(w http.ResponseWriter, r *http.Request) {
	user := userFromContext(r)
	name := r.PathValue("name")
	envName := r.PathValue("env")
	svcName := r.PathValue("svc")

	if !user.HasAccess(name, envName, svcName) {
		writeError(w, http.StatusForbidden, "access denied")
		return
	}

	ws, err := s.store.GetWorkspace(r.Context(), name)
	if err != nil {
		writeError(w, http.StatusNotFound, err.Error())
		return
	}

	resolved, err := ws.ResolveService(envName, svcName)
	if err != nil {
		writeError(w, http.StatusNotFound, err.Error())
		return
	}

	if r.Header.Get("Upgrade") == "websocket" {
		s.handleWebSocketStream(w, r, resolved)
		return
	}

	s.handleSSEStream(w, r, resolved)
}

func (s *Server) handleSSEStream(w http.ResponseWriter, r *http.Request, resolved *workspace.ResolvedService) {
	providerName, providerConfig := s.resolveWithCredentials(r.Context(), resolved, true, s.streamTailLines())

	p, ok := provider.Get(providerName)
	if !ok {
		writeError(w, http.StatusBadRequest, fmt.Sprintf("unknown provider: %s", providerName))
		return
	}

	if err := p.Connect(r.Context(), providerConfig); err != nil {
		writeInternalError(w, "connecting to provider", err)
		return
	}
	defer p.Close()

	instances, err := p.ListInstances(r.Context())
	if err != nil {
		writeInternalError(w, "listing instances", err)
		return
	}
	if len(instances) == 0 {
		logger.Error("no instances found", "provider", resolved.Service.Provider, "service", resolved.Service.Name)
		writeError(w, http.StatusNotFound, "no instances found")
		return
	}

	var streams []<-chan provider.LogEntry
	for _, inst := range instances {
		s, sErr := p.Stream(r.Context(), inst.ID, provider.StreamOpts{
			Follow: true,
			Tail:   s.streamTailLines(),
		})
		if sErr != nil {
			logger.Warn("SSE stream error", "instance", inst.ID, "error", sErr)
			continue
		}
		streams = append(streams, s)
	}
	if len(streams) == 0 {
		writeError(w, http.StatusInternalServerError, "failed to stream any instances")
		return
	}
	ch := stream.MergeAll(r.Context(), streams...)

	flusher, ok := w.(http.Flusher)
	if !ok {
		writeError(w, http.StatusInternalServerError, "streaming not supported")
		return
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	flusher.Flush()

	for entry := range ch {
		data, _ := json.Marshal(map[string]string{
			"timestamp": entry.Timestamp.Format(time.RFC3339),
			"source":    entry.Source,
			"instance":  entry.Instance,
			"line":      entry.Line,
		})
		fmt.Fprintf(w, "data: %s\n\n", data)
		flusher.Flush()
	}
}

func (s *Server) authMiddleware(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		user, err := s.auth.Authenticate(r)
		if err != nil {
			writeError(w, http.StatusUnauthorized, err.Error())
			return
		}

		logger.Info("request",
			"user", user.Username,
			"method", r.Method,
			"path", r.URL.Path,
			"ip", r.RemoteAddr,
		)

		ctx := context.WithValue(r.Context(), userContextKey, user)
		next(w, r.WithContext(ctx))
	}
}

func buildAllowedOrigins(addr string) []string {
	host, port, err := net.SplitHostPort(addr)
	if err != nil {
		if addr != "" {
			return []string{addr}
		}
		return []string{"*"}
	}
	if host == "" || host == "0.0.0.0" || host == "::" {
		return []string{"*:" + port}
	}
	return []string{host + ":" + port}
}

func (s *Server) originPatterns() []string {
	if len(s.allowedOrigins) > 0 {
		return s.allowedOrigins
	}
	return []string{"localhost:*"}
}

func writeJSON(w http.ResponseWriter, status int, data any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(data)
}

func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}

func writeInternalError(w http.ResponseWriter, ctx string, err error) {
	logger.Error(ctx, "error", err)
	writeError(w, http.StatusInternalServerError, ctx)
}
