package workspace

import (
	"testing"
)

func TestParseValidWorkspace(t *testing.T) {
	yaml := `
workspace:
  name: test-app
  description: Test Application

services:
  - name: api
    provider: kubernetes
    friendly_name: API Server
    config:
      selector: app=api

  - name: logs
    provider: file
    friendly_name: App Logs
    config:
      path: /var/log/app.log

environments:
  - name: dev
    targets:
      - name: dev-cluster
        type: kubernetes
        namespace: test-dev
        service_names: [api]

      - name: dev-server
        type: ssh
        host: dev-01
        service_names: [logs]
`
	w, err := Parse([]byte(yaml))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if w.Name != "test-app" {
		t.Errorf("expected name 'test-app', got %q", w.Name)
	}
	if len(w.Services) != 2 {
		t.Errorf("expected 2 services, got %d", len(w.Services))
	}
	if len(w.Environments) != 1 {
		t.Errorf("expected 1 environment, got %d", len(w.Environments))
	}
	if len(w.Environments[0].Targets) != 2 {
		t.Errorf("expected 2 targets, got %d", len(w.Environments[0].Targets))
	}
}

func TestParseEmptyName(t *testing.T) {
	yaml := `
workspace:
  description: No name

services:
  - name: api
    provider: kubernetes

environments: []
`
	_, err := Parse([]byte(yaml))
	if err == nil {
		t.Fatal("expected error for missing workspace name")
	}
}

func TestParseDuplicateService(t *testing.T) {
	yaml := `
workspace:
  name: test

services:
  - name: api
    provider: kubernetes
  - name: api
    provider: docker

environments: []
`
	_, err := Parse([]byte(yaml))
	if err == nil {
		t.Fatal("expected error for duplicate service name")
	}
}

func TestParseUnknownServiceReference(t *testing.T) {
	yaml := `
workspace:
  name: test

services:
  - name: api
    provider: kubernetes

environments:
  - name: dev
    targets:
      - name: cluster
        type: kubernetes
        service_names: [api, nonexistent]
`
	_, err := Parse([]byte(yaml))
	if err == nil {
		t.Fatal("expected error for unknown service reference")
	}
}

func TestResolveService(t *testing.T) {
	yaml := `
workspace:
  name: test

services:
  - name: cache
    provider: docker
    friendly_name: Redis
    config:
      container_name: redis

environments:
  - name: prod
    targets:
      - name: db-server
        type: ssh
        host: db-01
        services:
          - name: cache
            config:
              container_name: redis-prod
`
	w, err := Parse([]byte(yaml))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	resolved, err := w.ResolveService("prod", "cache")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	containerName, ok := resolved.Config["container_name"].(string)
	if !ok || containerName != "redis-prod" {
		t.Errorf("expected container_name 'redis-prod', got %v", resolved.Config["container_name"])
	}
}

func TestResolveEnvironment(t *testing.T) {
	yaml := `
workspace:
  name: test

services:
  - name: api
    provider: kubernetes
    config:
      selector: app=api
  - name: cache
    provider: docker
    config:
      container_name: redis

environments:
  - name: dev
    targets:
      - name: cluster
        type: kubernetes
        namespace: dev
        service_names: [api]
      - name: server
        type: ssh
        host: dev-01
        service_names: [cache]
`
	w, err := Parse([]byte(yaml))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	resolved, err := w.Resolve("dev")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if len(resolved) != 2 {
		t.Fatalf("expected 2 resolved services, got %d", len(resolved))
	}

	if resolved[0].Service.Name != "api" {
		t.Errorf("expected first service 'api', got %q", resolved[0].Service.Name)
	}
	if resolved[0].Target.Type != "kubernetes" {
		t.Errorf("expected target type 'kubernetes', got %q", resolved[0].Target.Type)
	}
	if resolved[1].Service.Name != "cache" {
		t.Errorf("expected second service 'cache', got %q", resolved[1].Service.Name)
	}
}

func TestResolveKubernetesTargetFieldInjection(t *testing.T) {
	yaml := `
workspace:
  name: test

services:
  - name: api
    provider: kubernetes
    config:
      selector: app=api

environments:
  - name: dev
    targets:
      - name: cluster
        type: kubernetes
        context: dev-context
        namespace: payments-dev
        kubeconfig: /custom/kubeconfig
        proxy_url: socks5://localhost:1080
        service_names: [api]
`
	w, err := Parse([]byte(yaml))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	resolved, err := w.ResolveService("dev", "api")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if v, _ := resolved.Config["context"].(string); v != "dev-context" {
		t.Errorf("context = %q, want dev-context", v)
	}
	if v, _ := resolved.Config["namespace"].(string); v != "payments-dev" {
		t.Errorf("namespace = %q, want payments-dev", v)
	}
	if v, _ := resolved.Config["kubeconfig"].(string); v != "/custom/kubeconfig" {
		t.Errorf("kubeconfig = %q, want /custom/kubeconfig", v)
	}
	if v, _ := resolved.Config["proxy_url"].(string); v != "socks5://localhost:1080" {
		t.Errorf("proxy_url = %q, want socks5://localhost:1080", v)
	}
	if v, _ := resolved.Config["selector"].(string); v != "app=api" {
		t.Errorf("selector = %q, want app=api (from service config)", v)
	}
}

func TestResolveKubernetesServiceConfigTakesPrecedence(t *testing.T) {
	yaml := `
workspace:
  name: test

services:
  - name: api
    provider: kubernetes
    config:
      selector: app=api
      namespace: svc-level-ns

environments:
  - name: dev
    targets:
      - name: cluster
        type: kubernetes
        namespace: target-level-ns
        service_names: [api]
`
	w, err := Parse([]byte(yaml))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	resolved, err := w.ResolveService("dev", "api")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// Service-level config for namespace should be preserved (inject doesn't overwrite)
	if v, _ := resolved.Config["namespace"].(string); v != "svc-level-ns" {
		t.Errorf("namespace = %q, want svc-level-ns (service config should take precedence)", v)
	}
}
