package server

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/avalokhq/avalok/internal/provider"
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
		CreatedAt   any    `json:"created_at"`
		UpdatedAt   any    `json:"updated_at"`
	}

	result := make([]credResponse, 0, len(creds))
	for _, c := range creds {
		result = append(result, credResponse{
			ID:          c.ID,
			Name:        c.Name,
			TargetType:  c.TargetType,
			Description: c.Description,
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

	if req.TargetType != nil {
		validTypes := map[string]bool{"kubernetes": true, "ssh": true, "winrm": true, "s3": true, "azure-storage": true, "gcs": true}
		if !validTypes[*req.TargetType] {
			writeError(w, http.StatusBadRequest, "target_type must be kubernetes, ssh, winrm, s3, azure-storage, or gcs")
			return
		}
		existing.TargetType = *req.TargetType
	}
	if req.Config != nil {
		if existing.Config == nil {
			existing.Config = req.Config
		} else {
			for k, v := range req.Config {
				if s, ok := v.(string); ok && (s == "" || s == "***redacted***") {
					continue
				}
				existing.Config[k] = v
			}
		}
	}
	if req.Description != nil {
		existing.Description = *req.Description
	}

	if err := s.store.SaveCredential(r.Context(), existing); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to update credential")
		return
	}

	s.store.RecordAudit(r.Context(), &store.AuditEntry{
		UserID:   actor.ID,
		Action:   "update_credential",
		Resource: "credential/" + name,
	})

	writeJSON(w, http.StatusOK, map[string]any{
		"id":          existing.ID,
		"name":        existing.Name,
		"target_type": existing.TargetType,
		"description": existing.Description,
	})
}

func (s *Server) handleDeleteCredential(w http.ResponseWriter, r *http.Request) {
	actor := userFromContext(r)
	name := r.PathValue("name")

	if _, err := s.store.GetCredential(r.Context(), name); err != nil {
		writeError(w, http.StatusNotFound, "credential not found")
		return
	}

	resources, _ := s.store.ListResources(r.Context())
	var dependents []string
	for _, res := range resources {
		if profile, _ := res.Config["credential_profile"].(string); profile == name {
			dependents = append(dependents, res.Name)
		}
	}
	if len(dependents) > 0 && r.URL.Query().Get("force") != "true" {
		writeError(w, http.StatusConflict, fmt.Sprintf("credential is used by resources: %s", strings.Join(dependents, ", ")))
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

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	var testProvider string
	switch cred.TargetType {
	case "ssh":
		testProvider = "ssh"
	case "winrm":
		testProvider = "winrm"
	case "kubernetes":
		testProvider = "kubernetes"
	case "s3":
		testProvider = "s3"
	case "azure-storage":
		accountName, _ := cred.Config["account_name"].(string)
		connStr, _ := cred.Config["connection_string"].(string)
		if accountName == "" && connStr == "" {
			writeJSON(w, http.StatusOK, map[string]any{
				"status": "error",
				"error":  "account_name or connection_string is required",
			})
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{
			"status":  "ok",
			"message": "credential configuration looks valid",
		})
		return
	case "gcs":
		testProvider = "gcs"
	default:
		writeError(w, http.StatusBadRequest, fmt.Sprintf("cannot test target type: %s", cred.TargetType))
		return
	}

	p, ok := provider.Get(testProvider)
	if !ok {
		writeJSON(w, http.StatusOK, map[string]any{
			"status": "error",
			"error":  fmt.Sprintf("provider %s not available", testProvider),
		})
		return
	}

	testConfig := make(map[string]any)
	for k, v := range cred.Config {
		testConfig[k] = v
	}
	if body.Host != "" {
		testConfig["host"] = body.Host
	}
	if testProvider == "ssh" {
		if _, ok := testConfig["command"]; !ok {
			testConfig["command"] = "echo ok"
		}
	}

	host, _ := testConfig["host"].(string)
	if host == "" && (testProvider == "ssh" || testProvider == "winrm") {
		writeJSON(w, http.StatusOK, map[string]any{
			"status": "error",
			"error":  "host is required to test this credential",
		})
		return
	}

	if err := p.Connect(ctx, testConfig); err != nil {
		logger.Error("credential test connection failed", "credential", cred.Name, "error", err)
		writeJSON(w, http.StatusOK, map[string]any{
			"status": "error",
			"error":  "connection failed",
		})
		return
	}
	defer p.Close()

	writeJSON(w, http.StatusOK, map[string]any{
		"status":  "ok",
		"message": "connection successful",
	})
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
