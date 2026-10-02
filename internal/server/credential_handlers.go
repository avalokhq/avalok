package server

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/avalokhq/avalok/internal/store"
)

func (s *Server) handleListCredentials(w http.ResponseWriter, r *http.Request) {
	creds, err := s.store.ListCredentials(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list credentials")
		return
	}

	type credResponse struct {
		ID          string `json:"id"`
		Name        string `json:"name"`
		TargetType  string `json:"target_type"`
		Description string `json:"description"`
		Host        string `json:"host,omitempty"`
		User        string `json:"user,omitempty"`
		Port        string `json:"port,omitempty"`
		CreatedAt   any    `json:"created_at"`
		UpdatedAt   any    `json:"updated_at"`
	}

	result := make([]credResponse, 0, len(creds))
	for _, c := range creds {
		host, _ := c.Config["host"].(string)
		user, _ := c.Config["user"].(string)
		var port string
		if p, ok := c.Config["port"]; ok && p != nil && p != "" {
			port = fmt.Sprint(p)
		}
		result = append(result, credResponse{
			ID:          c.ID,
			Name:        c.Name,
			TargetType:  c.TargetType,
			Description: c.Description,
			Host:        host,
			User:        user,
			Port:        port,
			CreatedAt:   nullTimeJSON(c.CreatedAt),
			UpdatedAt:   nullTimeJSON(c.UpdatedAt),
		})
	}

	writeJSON(w, http.StatusOK, result)
}

func (s *Server) handleGetCredential(w http.ResponseWriter, r *http.Request) {
	name := r.PathValue("name")
	cred, err := s.store.GetCredential(r.Context(), name)
	if err != nil {
		writeError(w, http.StatusNotFound, "credential not found")
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"id":          cred.ID,
		"name":        cred.Name,
		"target_type": cred.TargetType,
		"config":      redactSensitiveKeys(cred.Config),
		"description": cred.Description,
		"created_at":  nullTimeJSON(cred.CreatedAt),
		"updated_at":  nullTimeJSON(cred.UpdatedAt),
	})
}

func (s *Server) handleCreateCredential(w http.ResponseWriter, r *http.Request) {
	actor := userFromContext(r)

	var req struct {
		Name        string         `json:"name"`
		TargetType  string         `json:"target_type"`
		Config      map[string]any `json:"config"`
		Description string         `json:"description"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if req.Name == "" || req.TargetType == "" {
		writeError(w, http.StatusBadRequest, "name and target_type are required")
		return
	}

	validTypes := map[string]bool{"kubernetes": true, "ssh": true, "winrm": true, "s3": true, "azure-storage": true, "gcs": true}
	if !validTypes[req.TargetType] {
		writeError(w, http.StatusBadRequest, "target_type must be kubernetes, ssh, winrm, s3, azure-storage, or gcs")
		return
	}

	if existing, _ := s.store.GetCredential(r.Context(), req.Name); existing != nil {
		writeError(w, http.StatusConflict, "credential name already exists")
		return
	}

	cred := &store.Credential{
		ID:          uuid.New().String(),
		Name:        req.Name,
		TargetType:  req.TargetType,
		Config:      req.Config,
		Description: req.Description,
	}

	if err := s.store.SaveCredential(r.Context(), cred); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to save credential")
		return
	}

	s.store.RecordAudit(r.Context(), &store.AuditEntry{
		UserID:   actor.ID,
		Action:   "create_credential",
		Resource: "credential/" + cred.Name,
		Details:  map[string]string{"target_type": cred.TargetType},
	})

	writeJSON(w, http.StatusCreated, map[string]any{
		"id":          cred.ID,
		"name":        cred.Name,
		"target_type": cred.TargetType,
		"description": cred.Description,
	})
}

func (s *Server) handleUpdateCredential(w http.ResponseWriter, r *http.Request) {
	actor := userFromContext(r)
	name := r.PathValue("name")

	existing, err := s.store.GetCredential(r.Context(), name)
	if err != nil {
		writeError(w, http.StatusNotFound, "credential not found")
		return
	}

	var req struct {
		TargetType  *string        `json:"target_type"`
		Config      map[string]any `json:"config"`
		Description *string        `json:"description"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	// Type is immutable: dependents resolve the profile by type and would break.
	if req.TargetType != nil && *req.TargetType != existing.TargetType {
		writeError(w, http.StatusBadRequest, "credential type cannot be changed")
		return
	}

	// Merge into a copy so a failed save never mutates the stored credential.
	// "" or "***redacted***" keeps the existing value; null removes the key.
	merged := make(map[string]any, len(existing.Config))
	for k, v := range existing.Config {
		merged[k] = v
	}
	var changed, cleared []string
	for k, v := range req.Config {
		if v == nil {
			if _, ok := merged[k]; ok {
				delete(merged, k)
				cleared = append(cleared, k)
			}
			continue
		}
		if s, ok := v.(string); ok && (s == "" || s == "***redacted***") {
			continue
		}
		merged[k] = v
		changed = append(changed, k)
	}

	if p, ok := merged["port"]; ok && !validPort(p) {
		writeError(w, http.StatusBadRequest, "port must be a number between 1 and 65535")
		return
	}

	updated := *existing
	updated.Config = merged
	if req.Description != nil {
		updated.Description = *req.Description
	}

	if err := s.store.SaveCredential(r.Context(), &updated); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to update credential")
		return
	}

	details := map[string]string{}
	if len(changed) > 0 {
		sort.Strings(changed)
		details["changed"] = strings.Join(changed, ",")
	}
	if len(cleared) > 0 {
		sort.Strings(cleared)
		details["cleared"] = strings.Join(cleared, ",")
	}
	if req.Description != nil && *req.Description != existing.Description {
		details["description"] = "updated"
	}
	s.store.RecordAudit(r.Context(), &store.AuditEntry{
		UserID:   actor.ID,
		Action:   "update_credential",
		Resource: "credential/" + name,
		Details:  details,
	})

	host, _ := updated.Config["host"].(string)
	writeJSON(w, http.StatusOK, map[string]any{
		"id":          updated.ID,
		"name":        updated.Name,
		"target_type": updated.TargetType,
		"description": updated.Description,
		"host":        host,
	})
}

func (s *Server) handleDeleteCredential(w http.ResponseWriter, r *http.Request) {
	actor := userFromContext(r)
	name := r.PathValue("name")

	if _, err := s.store.GetCredential(r.Context(), name); err != nil {
		writeError(w, http.StatusNotFound, "credential not found")
		return
	}

	// No force override: anything still pointing at the profile would fail to
	// connect. Callers must repoint or remove those first.
	usages, err := s.credentialUsages(r.Context(), name)
	if err != nil {
		writeInternalError(w, "failed to check credential usage", err)
		return
	}
	if len(usages) > 0 {
		writeJSON(w, http.StatusConflict, map[string]any{
			"error":   fmt.Sprintf("credential is in use in %d place(s); switch or remove them before deleting", len(usages)),
			"used_by": usages,
		})
		return
	}

	if err := s.store.DeleteCredential(r.Context(), name); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to delete credential")
		return
	}

	s.store.RecordAudit(r.Context(), &store.AuditEntry{
		UserID:   actor.ID,
		Action:   "delete_credential",
		Resource: "credential/" + name,
	})

	writeJSON(w, http.StatusOK, map[string]string{"message": "credential deleted"})
}

func (s *Server) handleTestCredential(w http.ResponseWriter, r *http.Request) {
	name := r.PathValue("name")

	cred, err := s.store.GetCredential(r.Context(), name)
	if err != nil {
		writeError(w, http.StatusNotFound, "credential not found")
		return
	}

	var body struct {
		Host string `json:"host"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)

	testConfig := make(map[string]any, len(cred.Config)+1)
	for k, v := range cred.Config {
		testConfig[k] = v
	}
	if body.Host != "" {
		testConfig["host"] = body.Host
	}

	var probe func(context.Context, *probeReport, map[string]any)
	switch cred.TargetType {
	case "ssh":
		probe = probeSSH
	case "winrm":
		probe = probeWinRM
	case "kubernetes":
		probe = probeKubernetes
	case "s3":
		probe = probeS3
	case "gcs":
		probe = probeGCS
	case "azure-storage":
		probe = probeAzure
	default:
		writeError(w, http.StatusBadRequest, fmt.Sprintf("cannot test target type: %s", cred.TargetType))
		return
	}

	report := &probeReport{Steps: []probeStep{}}
	if host, _ := testConfig["host"].(string); host == "" && (cred.TargetType == "ssh" || cred.TargetType == "winrm") {
		report.Status = "error"
		report.Error = "host is required to test this credential"
		writeJSON(w, http.StatusOK, report)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), probeTimeout)
	defer cancel()
	start := time.Now()
	probe(ctx, report, testConfig)
	report.finish(start)

	if report.Status == "error" {
		logger.Info("credential test failed", "credential", cred.Name, "target", report.Target, "reason", report.Error)
	}

	result := report.Error
	if result == "" {
		result = report.Message
	}
	details := map[string]string{"result": result}
	if report.Target != "" {
		details["target"] = report.Target
	}
	if body.Host != "" {
		details["host_override"] = "true"
	}
	s.store.RecordAudit(r.Context(), &store.AuditEntry{
		UserID:   userFromContext(r).ID,
		Action:   "test_credential",
		Resource: "credential/" + cred.Name,
		Details:  details,
	})

	writeJSON(w, http.StatusOK, report)
}

func validPort(v any) bool {
	var n int
	switch p := v.(type) {
	case float64:
		if p != float64(int(p)) {
			return false
		}
		n = int(p)
	case int:
		n = p
	case string:
		var err error
		if n, err = strconv.Atoi(strings.TrimSpace(p)); err != nil {
			return false
		}
	default:
		return false
	}
	return n >= 1 && n <= 65535
}

func redactSensitiveKeys(config map[string]any) map[string]any {
	sensitive := map[string]bool{
		"password":           true,
		"passphrase":         true,
		"private_key":        true,
		"key_data":           true,
		"key_path":           true,
		"token":              true,
		"secret":             true,
		"kubeconfig_content": true,
		"bearer_token":       true,
		"ca_cert":            true,
		"proxy_url":          true,
		"secret_access_key":  true,
		"account_key":        true,
		"connection_string":  true,
		"sas_token":          true,
		"credentials_json":   true,
	}
	result := make(map[string]any, len(config))
	for k, v := range config {
		if sensitive[k] {
			if s, ok := v.(string); ok && len(s) > 0 {
				result[k] = "***redacted***"
			} else {
				result[k] = v
			}
		} else if nested, ok := v.(map[string]any); ok {
			result[k] = redactSensitiveKeys(nested)
		} else {
			result[k] = v
		}
	}
	return result
}
