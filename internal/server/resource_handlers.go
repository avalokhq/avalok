package server

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"sync"
	"time"

	"github.com/avalokhq/avalok/internal/provider"
	"github.com/avalokhq/avalok/internal/store"
	"github.com/avalokhq/avalok/internal/stream"
	"github.com/coder/websocket"
	"github.com/coder/websocket/wsjson"
	"github.com/google/uuid"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/clientcmd"
)

func (s *Server) handleListResources(w http.ResponseWriter, r *http.Request) {
	user := userFromContext(r)
	resources, err := s.store.ListResources(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list resources")
		return
	}

	type resResponse struct {
		ID          string `json:"id"`
		Name        string `json:"name"`
		Type        string `json:"type"`
		Description string `json:"description"`
		CreatedAt   any    `json:"created_at"`
		UpdatedAt   any    `json:"updated_at"`
	}

	result := make([]resResponse, 0, len(resources))
	for _, res := range resources {
		if !user.HasResourceAccess(res.Name) {
			continue
		}
		result = append(result, resResponse{
			ID:          res.ID,
			Name:        res.Name,
			Type:        res.Type,
			Description: res.Description,
			CreatedAt:   nullTimeJSON(res.CreatedAt),
			UpdatedAt:   nullTimeJSON(res.UpdatedAt),
		})
	}

	writeJSON(w, http.StatusOK, result)
}

func (s *Server) handleGetResource(w http.ResponseWriter, r *http.Request) {
	user := userFromContext(r)
	name := r.PathValue("name")
	if !user.HasResourceAccess(name) {
		writeError(w, http.StatusForbidden, "access denied")
		return
	}
	res, err := s.store.GetResource(r.Context(), name)
	if err != nil {
		writeError(w, http.StatusNotFound, "resource not found")
		return
	}

	cfg := res.Config
	if r.URL.Query().Get("full") != "true" {
		cfg = redactSensitiveKeys(cfg)
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"id":          res.ID,
		"name":        res.Name,
		"type":        res.Type,
		"config":      cfg,
		"description": res.Description,
		"created_at":  nullTimeJSON(res.CreatedAt),
		"updated_at":  nullTimeJSON(res.UpdatedAt),
	})
}

func (s *Server) handleCreateResource(w http.ResponseWriter, r *http.Request) {
	actor := userFromContext(r)

	var req struct {
		Name        string         `json:"name"`
		Type        string         `json:"type"`
		Config      map[string]any `json:"config"`
		Description string         `json:"description"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if req.Name == "" || req.Type == "" {
		writeError(w, http.StatusBadRequest, "name and type are required")
		return
	}

	validTypes := map[string]bool{"kubernetes": true}
	if !validTypes[req.Type] {
		writeError(w, http.StatusBadRequest, "type must be kubernetes")
		return
	}

	if existing, _ := s.store.GetResource(r.Context(), req.Name); existing != nil {
		writeError(w, http.StatusConflict, "resource name already exists")
		return
	}

	res := &store.Resource{
		ID:          uuid.New().String(),
		Name:        req.Name,
		Type:        req.Type,
		Config:      req.Config,
		Description: req.Description,
	}

	if err := s.store.SaveResource(r.Context(), res); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to save resource")
		return
	}

	s.store.RecordAudit(r.Context(), &store.AuditEntry{
		UserID:   actor.ID,
		Action:   "create_resource",
		Resource: "resource/" + res.Name,
		Details:  map[string]string{"type": res.Type},
	})

	writeJSON(w, http.StatusCreated, map[string]any{
		"id":          res.ID,
		"name":        res.Name,
		"type":        res.Type,
		"description": res.Description,
	})
}

func (s *Server) handleUpdateResource(w http.ResponseWriter, r *http.Request) {
	actor := userFromContext(r)
	name := r.PathValue("name")

	existing, err := s.store.GetResource(r.Context(), name)
	if err != nil {
		writeError(w, http.StatusNotFound, "resource not found")
		return
	}

	var req struct {
		Type        *string        `json:"type"`
		Config      map[string]any `json:"config"`
		Description *string        `json:"description"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if req.Type != nil {
		validTypes := map[string]bool{"kubernetes": true}
		if !validTypes[*req.Type] {
			writeError(w, http.StatusBadRequest, "type must be kubernetes")
			return
		}
		existing.Type = *req.Type
	}
	if req.Config != nil {
		existing.Config = req.Config
	}
	if req.Description != nil {
		existing.Description = *req.Description
	}

	if err := s.store.SaveResource(r.Context(), existing); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to update resource")
		return
	}

	s.store.RecordAudit(r.Context(), &store.AuditEntry{
		UserID:   actor.ID,
		Action:   "update_resource",
		Resource: "resource/" + name,
	})

	writeJSON(w, http.StatusOK, map[string]any{
		"id":          existing.ID,
		"name":        existing.Name,
		"type":        existing.Type,
		"description": existing.Description,
	})
}

func (s *Server) handleDeleteResource(w http.ResponseWriter, r *http.Request) {
	actor := userFromContext(r)
	name := r.PathValue("name")

	if _, err := s.store.GetResource(r.Context(), name); err != nil {
		writeError(w, http.StatusNotFound, "resource not found")
		return
	}

	if err := s.store.DeleteResource(r.Context(), name); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to delete resource")
		return
	}

	s.store.RecordAudit(r.Context(), &store.AuditEntry{
		UserID:   actor.ID,
		Action:   "delete_resource",
		Resource: "resource/" + name,
	})

	writeJSON(w, http.StatusOK, map[string]string{"message": "resource deleted"})
}

func (s *Server) handleTestResource(w http.ResponseWriter, r *http.Request) {
	name := r.PathValue("name")

	res, err := s.store.GetResource(r.Context(), name)
	if err != nil {
		writeError(w, http.StatusNotFound, "resource not found")
		return
	}

	client, err := buildResourceClient(res)
	if err != nil {
		logger.Error("test resource build client failed", "resource", name, "error", err)
		writeJSON(w, http.StatusOK, map[string]any{
			"status": "error",
			"error":  "failed to build client — check resource configuration",
		})
		return
	}

	version, err := client.Discovery().ServerVersion()
	if err != nil {
		logger.Error("test resource connection failed", "resource", name, "error", err)
		writeJSON(w, http.StatusOK, map[string]any{
			"status": "error",
			"error":  "connection failed — check server URL and credentials",
		})
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"status":  "ok",
		"message": fmt.Sprintf("connected to Kubernetes %s", version.GitVersion),
	})
}

func (s *Server) handleListResourceNamespaces(w http.ResponseWriter, r *http.Request) {
	user := userFromContext(r)
	name := r.PathValue("name")
	if !user.HasResourceAccess(name) {
		writeError(w, http.StatusForbidden, "access denied")
		return
	}

	res, err := s.store.GetResource(r.Context(), name)
	if err != nil {
		writeError(w, http.StatusNotFound, "resource not found")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 15*time.Second)
	defer cancel()

	client, err := buildResourceClient(res)
	if err != nil {
		writeInternalError(w, "failed to build client", err)
		return
	}

	nsList, err := client.CoreV1().Namespaces().List(ctx, metav1.ListOptions{})
	if err != nil {
		writeInternalError(w, "failed to list namespaces", err)
		return
	}

	pods, _ := client.CoreV1().Pods("").List(ctx, metav1.ListOptions{})
	deployments, _ := client.AppsV1().Deployments("").List(ctx, metav1.ListOptions{})
	statefulsets, _ := client.AppsV1().StatefulSets("").List(ctx, metav1.ListOptions{})
	daemonsets, _ := client.AppsV1().DaemonSets("").List(ctx, metav1.ListOptions{})

	type podStats struct {
		Total   int `json:"total"`
		Running int `json:"running"`
		Pending int `json:"pending"`
		Failed  int `json:"failed"`
	}

	podsByNs := make(map[string]*podStats)
	if pods != nil {
		for _, p := range pods.Items {
			s := podsByNs[p.Namespace]
			if s == nil {
				s = &podStats{}
				podsByNs[p.Namespace] = s
			}
			s.Total++
			switch p.Status.Phase {
			case "Running":
				s.Running++
			case "Pending":
				s.Pending++
			case "Failed":
				s.Failed++
			}
		}
	}

	depsByNs := make(map[string]int)
	if deployments != nil {
		for _, d := range deployments.Items {
			depsByNs[d.Namespace]++
		}
	}
	stsByNs := make(map[string]int)
	if statefulsets != nil {
		for _, ss := range statefulsets.Items {
			stsByNs[ss.Namespace]++
		}
	}
	dssByNs := make(map[string]int)
	if daemonsets != nil {
		for _, ds := range daemonsets.Items {
			dssByNs[ds.Namespace]++
		}
	}

	type nsResponse struct {
		Name         string   `json:"name"`
		Pods         podStats `json:"pods"`
		Deployments  int      `json:"deployments"`
		StatefulSets int      `json:"statefulsets"`
		DaemonSets   int      `json:"daemonsets"`
		Status       string   `json:"status"`
	}
	result := make([]nsResponse, 0, len(nsList.Items))
	for _, ns := range nsList.Items {
		if !user.HasResourceNamespaceAccess(name, ns.Name) {
			continue
		}
		ps := podsByNs[ns.Name]
		if ps == nil {
			ps = &podStats{}
		}
		status := "healthy"
		if ps.Failed > 0 {
			status = "unhealthy"
		} else if ps.Pending > 0 && ps.Running == 0 {
			status = "pending"
		} else if ps.Total == 0 {
			status = "empty"
		}
		result = append(result, nsResponse{
			Name:         ns.Name,
			Pods:         *ps,
			Deployments:  depsByNs[ns.Name],
			StatefulSets: stsByNs[ns.Name],
			DaemonSets:   dssByNs[ns.Name],
			Status:       status,
		})
	}

	writeJSON(w, http.StatusOK, result)
}

func (s *Server) handleResourceOverview(w http.ResponseWriter, r *http.Request) {
	user := userFromContext(r)
	name := r.PathValue("name")
	if !user.HasResourceAccess(name) {
		writeError(w, http.StatusForbidden, "access denied")
		return
	}

	res, err := s.store.GetResource(r.Context(), name)
	if err != nil {
		writeError(w, http.StatusNotFound, "resource not found")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 15*time.Second)
	defer cancel()

	client, err := buildResourceClient(res)
	if err != nil {
		writeInternalError(w, "failed to build client", err)
		return
	}

	nsList, err := client.CoreV1().Namespaces().List(ctx, metav1.ListOptions{})
	if err != nil {
		writeInternalError(w, "failed to list namespaces", err)
		return
	}

	allowedNs := make(map[string]bool)
	nsCount := 0
	for _, ns := range nsList.Items {
		if user.HasResourceNamespaceAccess(name, ns.Name) {
			allowedNs[ns.Name] = true
			nsCount++
		}
	}

	pods, _ := client.CoreV1().Pods("").List(ctx, metav1.ListOptions{})
	deployments, _ := client.AppsV1().Deployments("").List(ctx, metav1.ListOptions{})
	statefulsets, _ := client.AppsV1().StatefulSets("").List(ctx, metav1.ListOptions{})
	daemonsets, _ := client.AppsV1().DaemonSets("").List(ctx, metav1.ListOptions{})

	totalPods, running, pending, failed := 0, 0, 0, 0
	if pods != nil {
		for _, p := range pods.Items {
			if !allowedNs[p.Namespace] {
				continue
			}
			totalPods++
			switch p.Status.Phase {
			case "Running":
				running++
			case "Pending":
				pending++
			case "Failed":
				failed++
			}
		}
	}

	totalDeps, totalSts, totalDs := 0, 0, 0
	if deployments != nil {
		for _, d := range deployments.Items {
			if allowedNs[d.Namespace] {
				totalDeps++
			}
		}
	}
	if statefulsets != nil {
		for _, ss := range statefulsets.Items {
			if allowedNs[ss.Namespace] {
				totalSts++
			}
		}
	}
	if daemonsets != nil {
		for _, ds := range daemonsets.Items {
			if allowedNs[ds.Namespace] {
				totalDs++
			}
		}
	}

	healthPct := 100
	if totalPods > 0 {
		healthPct = (running * 100) / totalPods
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"name":       res.Name,
		"namespaces": nsCount,
		"pods": map[string]int{
			"total":   totalPods,
			"running": running,
			"pending": pending,
			"failed":  failed,
		},
		"deployments":    totalDeps,
		"statefulsets":   totalSts,
		"daemonsets":     totalDs,
		"health_percent": healthPct,
	})
}

func (s *Server) handleListResourceWorkloads(w http.ResponseWriter, r *http.Request) {
	user := userFromContext(r)
	name := r.PathValue("name")
	ns := r.PathValue("ns")
	if !user.HasResourceNamespaceAccess(name, ns) {
		writeError(w, http.StatusForbidden, "access denied")
		return
	}

	res, err := s.store.GetResource(r.Context(), name)
	if err != nil {
		writeError(w, http.StatusNotFound, "resource not found")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()

	client, err := buildResourceClient(res)
	if err != nil {
		writeInternalError(w, "failed to build client", err)
		return
	}

	type workloadEntry struct {
		Name     string `json:"name"`
		Replicas int32  `json:"replicas,omitempty"`
		Desired  int32  `json:"desired,omitempty"`
	}

	deployments, err := client.AppsV1().Deployments(ns).List(ctx, metav1.ListOptions{})
	if err != nil {
		writeInternalError(w, "failed to list deployments", err)
		return
	}
	deps := make([]workloadEntry, 0, len(deployments.Items))
	for _, d := range deployments.Items {
		var replicas int32 = 1
		if d.Spec.Replicas != nil {
			replicas = *d.Spec.Replicas
		}
		deps = append(deps, workloadEntry{Name: d.Name, Replicas: replicas})
	}

	statefulsets, err := client.AppsV1().StatefulSets(ns).List(ctx, metav1.ListOptions{})
	if err != nil {
		writeInternalError(w, "failed to list statefulsets", err)
		return
	}
	sts := make([]workloadEntry, 0, len(statefulsets.Items))
	for _, s := range statefulsets.Items {
		var replicas int32 = 1
		if s.Spec.Replicas != nil {
			replicas = *s.Spec.Replicas
		}
		sts = append(sts, workloadEntry{Name: s.Name, Replicas: replicas})
	}

	daemonsets, err := client.AppsV1().DaemonSets(ns).List(ctx, metav1.ListOptions{})
	if err != nil {
		writeInternalError(w, "failed to list daemonsets", err)
		return
	}
	dss := make([]workloadEntry, 0, len(daemonsets.Items))
	for _, ds := range daemonsets.Items {
		dss = append(dss, workloadEntry{Name: ds.Name, Desired: ds.Status.DesiredNumberScheduled})
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"deployments":  deps,
		"statefulsets": sts,
		"daemonsets":   dss,
	})
}

func (s *Server) handleResourceStream(w http.ResponseWriter, r *http.Request) {
	user := userFromContext(r)
	name := r.PathValue("name")
	ns := r.PathValue("ns")
	kind := r.PathValue("kind")
	workload := r.PathValue("workload")

	if !user.HasResourceNamespaceAccess(name, ns) {
		writeError(w, http.StatusForbidden, "access denied")
		return
	}

	validKinds := map[string]bool{"deployment": true, "statefulset": true, "daemonset": true}
	if !validKinds[kind] {
		writeError(w, http.StatusBadRequest, "kind must be deployment, statefulset, or daemonset")
		return
	}

	res, err := s.store.GetResource(r.Context(), name)
	if err != nil {
		writeError(w, http.StatusNotFound, "resource not found")
		return
	}

	config := make(map[string]any)
	for k, v := range res.Config {
		config[k] = v
	}
	if ca, _ := config["ca_cert"].(string); ca != "" {
		if decoded, err := base64.StdEncoding.DecodeString(ca); err == nil {
			config["ca_cert"] = string(decoded)
		}
	}
	config["namespace"] = ns
	config[kind] = workload

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

	p, ok := provider.Get("kubernetes")
	if !ok {
		wsjson.Write(ctx, conn, wsLogEntry{Type: "error", Error: "kubernetes provider not available"})
		return
	}

	if err := p.Connect(ctx, config); err != nil {
		logger.Error("resource stream connect failed", "resource", name, "namespace", ns, "workload", workload, "error", err)
		wsjson.Write(ctx, conn, wsLogEntry{Type: "error", Error: "failed to connect"})
		return
	}
	defer p.Close()

	instances, err := p.ListInstances(ctx)
	if err != nil {
		logger.Error("resource stream list instances failed", "resource", name, "namespace", ns, "workload", workload, "error", err)
		wsjson.Write(ctx, conn, wsLogEntry{Type: "error", Error: "failed to list instances"})
		return
	}
	if len(instances) == 0 {
		wsjson.Write(ctx, conn, wsLogEntry{Type: "error", Error: "no instances found"})
		return
	}

	streamCtx, streamCancel := context.WithCancel(ctx)
	defer streamCancel()

	var streams []<-chan provider.LogEntry
	for _, inst := range instances {
		st, sErr := p.Stream(streamCtx, inst.ID, provider.StreamOpts{Follow: true, Tail: s.streamTailLines()})
		if sErr != nil {
			logger.Warn("resource stream error", "instance", inst.ID, "error", sErr)
			continue
		}
		streams = append(streams, st)
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
			_, data, readErr := conn.Read(ctx)
			if readErr != nil {
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

func buildResourceClient(res *store.Resource) (*kubernetes.Clientset, error) {
	cfg := res.Config

	if content, _ := cfg["kubeconfig_content"].(string); content != "" {
		kubeConfig, err := clientcmd.Load([]byte(content))
		if err != nil {
			return nil, fmt.Errorf("parsing kubeconfig content: %w", err)
		}
		overrides := &clientcmd.ConfigOverrides{}
		if ctx, _ := cfg["context"].(string); ctx != "" {
			overrides.CurrentContext = ctx
		}
		restCfg, err := clientcmd.NewDefaultClientConfig(*kubeConfig, overrides).ClientConfig()
		if err != nil {
			return nil, fmt.Errorf("building client config from kubeconfig: %w", err)
		}
		return kubernetes.NewForConfig(restCfg)
	}

	apiURL, _ := cfg["api_server_url"].(string)
	token, _ := cfg["bearer_token"].(string)
	if apiURL == "" || token == "" {
		return nil, fmt.Errorf("api_server_url and bearer_token are required (or provide kubeconfig_content)")
	}

	restCfg := &rest.Config{
		Host:        apiURL,
		BearerToken: token,
	}
	if skip, ok := cfg["insecure_skip_tls"].(bool); ok && skip {
		restCfg.TLSClientConfig.Insecure = true
	}
	if ca, _ := cfg["ca_cert"].(string); ca != "" {
		decoded, err := base64.StdEncoding.DecodeString(ca)
		if err != nil {
			restCfg.TLSClientConfig.CAData = []byte(ca)
		} else {
			restCfg.TLSClientConfig.CAData = decoded
		}
	}

	return kubernetes.NewForConfig(restCfg)
}
