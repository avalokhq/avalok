package kubernetes

import (
	"testing"
	"time"
)

func TestParseConfig(t *testing.T) {
	p := &Provider{}
	p.parseConfig(map[string]any{
		"kubeconfig":        "/home/user/.kube/config",
		"kubeconfig_content": "apiVersion: v1\nclusters: []",
		"context":           "prod-context",
		"namespace":         "payments",
		"selector":          "app=api",
		"container":         "main",
		"all_containers":    true,
		"previous":          true,
		"proxy_url":         "socks5://localhost:1080",
		"bearer_token":      "tok-123",
		"insecure_skip_tls": true,
		"ca_cert":           "-----BEGIN CERTIFICATE-----",
		"api_server_url":    "https://10.0.0.1:6443",
	})

	if p.kubeconfig != "/home/user/.kube/config" {
		t.Errorf("kubeconfig = %q, want /home/user/.kube/config", p.kubeconfig)
	}
	if p.kubeconfigContent != "apiVersion: v1\nclusters: []" {
		t.Errorf("kubeconfigContent = %q", p.kubeconfigContent)
	}
	if p.contextName != "prod-context" {
		t.Errorf("contextName = %q, want prod-context", p.contextName)
	}
	if p.namespace != "payments" {
		t.Errorf("namespace = %q, want payments", p.namespace)
	}
	if p.selector != "app=api" {
		t.Errorf("selector = %q, want app=api", p.selector)
	}
	if p.container != "main" {
		t.Errorf("container = %q, want main", p.container)
	}
	if !p.allContainers {
		t.Error("allContainers = false, want true")
	}
	if !p.previous {
		t.Error("previous = false, want true")
	}
	if p.proxyURL != "socks5://localhost:1080" {
		t.Errorf("proxyURL = %q", p.proxyURL)
	}
	if p.bearerToken != "tok-123" {
		t.Errorf("bearerToken = %q", p.bearerToken)
	}
	if !p.insecureSkipTLS {
		t.Error("insecureSkipTLS = false, want true")
	}
	if p.caCert != "-----BEGIN CERTIFICATE-----" {
		t.Errorf("caCert = %q", p.caCert)
	}
	if p.apiServerURL != "https://10.0.0.1:6443" {
		t.Errorf("apiServerURL = %q", p.apiServerURL)
	}
}

func TestParseConfigDefaults(t *testing.T) {
	p := &Provider{}
	p.parseConfig(map[string]any{})

	if p.namespace != "default" {
		t.Errorf("namespace = %q, want default", p.namespace)
	}
	if p.kubeconfig != "" {
		t.Errorf("kubeconfig = %q, want empty", p.kubeconfig)
	}
	if p.allContainers {
		t.Error("allContainers = true, want false")
	}
	if p.previous {
		t.Error("previous = true, want false")
	}
	if p.insecureSkipTLS {
		t.Error("insecureSkipTLS = true, want false")
	}
}

func TestParseConfigNamespaceOverride(t *testing.T) {
	p := &Provider{}
	p.parseConfig(map[string]any{
		"namespace": "custom-ns",
	})

	if p.namespace != "custom-ns" {
		t.Errorf("namespace = %q, want custom-ns", p.namespace)
	}
}

func TestParseKubeTimestamp(t *testing.T) {
	tests := []struct {
		name     string
		line     string
		wantLine string
		wantTime bool
	}{
		{
			name:     "valid RFC3339Nano",
			line:     "2024-01-15T10:30:45.123456789Z this is a log line",
			wantLine: "this is a log line",
			wantTime: true,
		},
		{
			name:     "valid RFC3339",
			line:     "2024-01-15T10:30:45Z some output",
			wantLine: "some output",
			wantTime: true,
		},
		{
			name:     "no timestamp",
			line:     "just a plain log line without timestamp",
			wantLine: "just a plain log line without timestamp",
			wantTime: false,
		},
		{
			name:     "short line",
			line:     "short",
			wantLine: "short",
			wantTime: false,
		},
		{
			name:     "empty line",
			line:     "",
			wantLine: "",
			wantTime: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ts, logLine := parseKubeTimestamp(tt.line)
			if logLine != tt.wantLine {
				t.Errorf("logLine = %q, want %q", logLine, tt.wantLine)
			}
			if tt.wantTime {
				if ts.Year() != 2024 || ts.Month() != time.January || ts.Day() != 15 {
					t.Errorf("unexpected timestamp: %v", ts)
				}
			}
		})
	}
}

func TestConnectBearerTokenRequiresAPIServer(t *testing.T) {
	p := &Provider{}
	err := p.Connect(t.Context(), map[string]any{
		"bearer_token": "my-token",
	})
	if err == nil {
		t.Fatal("expected error when bearer_token is set without api_server_url")
	}
}
