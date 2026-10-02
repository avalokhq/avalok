package server

import (
	"context"
	"fmt"
	"net/http"

	"github.com/avalokhq/avalok/internal/workspace"
)

// credentialUsage is one place that references a credential profile by name.
type credentialUsage struct {
	Kind string `json:"kind"` // resource, workspace, environment, service
	Name string `json:"name"` // owning entity, e.g. the workspace name
	Path string `json:"path"` // where inside it, e.g. "prod › target web-1"
}

// credentialUsages lists everything that references the named credential:
// resources, workspace/standalone targets, and service configs (storage
// providers carry credential_profile in their config). Any store error is
// returned so callers can fail closed.
func (s *Server) credentialUsages(ctx context.Context, name string) ([]credentialUsage, error) {
	usages := []credentialUsage{}
	add := func(kind, owner, path string) {
		usages = append(usages, credentialUsage{Kind: kind, Name: owner, Path: path})
	}

	resources, err := s.store.ListResources(ctx)
	if err != nil {
		return nil, fmt.Errorf("listing resources: %w", err)
	}
	for _, res := range resources {
		if configUsesProfile(res.Config, name) {
			add("resource", res.Name, "")
		}
	}

	workspaces, err := s.store.ListWorkspaces(ctx)
	if err != nil {
		return nil, fmt.Errorf("listing workspaces: %w", err)
	}
	for _, ws := range workspaces {
		for _, svc := range ws.Services {
			if configUsesProfile(svc.Config, name) {
				add("workspace", ws.Name, "service "+svc.Name)
			}
		}
		for _, env := range ws.Environments {
			for _, t := range env.Targets {
				if p := targetUsage(t, name); p != "" {
					add("workspace", ws.Name, env.Name+" › "+p)
				}
			}
		}
	}

	envs, err := s.store.ListStandaloneEnvs(ctx)
	if err != nil {
		return nil, fmt.Errorf("listing environments: %w", err)
	}
	for _, env := range envs {
		for _, svc := range env.Services {
			if configUsesProfile(svc.Config, name) {
				add("environment", env.Name, "service "+svc.Name)
			}
		}
		for _, t := range env.Targets {
			if p := targetUsage(t, name); p != "" {
				add("environment", env.Name, p)
			}
		}
	}

	services, err := s.store.ListStandaloneServices(ctx)
	if err != nil {
		return nil, fmt.Errorf("listing services: %w", err)
	}
	for _, svc := range services {
		if configUsesProfile(svc.Config, name) {
			add("service", svc.Name, "config")
		}
		if p := targetUsage(svc.Target, name); p != "" {
			add("service", svc.Name, p)
		}
	}

	return usages, nil
}

// targetUsage describes how a target references the profile, or "" if it doesn't.
func targetUsage(t workspace.Target, name string) string {
	if t.CredentialProfile == name {
		return "target " + t.Name
	}
	for _, o := range t.Services {
		if configUsesProfile(o.Config, name) {
			return "target " + t.Name + " › service " + o.Name
		}
	}
	return ""
}

func configUsesProfile(cfg map[string]any, name string) bool {
	profile, _ := cfg["credential_profile"].(string)
	return profile != "" && profile == name
}

func (s *Server) handleCredentialUsage(w http.ResponseWriter, r *http.Request) {
	name := r.PathValue("name")
	if _, err := s.store.GetCredential(r.Context(), name); err != nil {
		writeError(w, http.StatusNotFound, "credential not found")
		return
	}
	usages, err := s.credentialUsages(r.Context(), name)
	if err != nil {
		writeInternalError(w, "failed to check credential usage", err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"used_by": usages})
}
