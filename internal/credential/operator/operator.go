package operator

import (
	"context"
	"os"
	"path/filepath"
	"runtime"

	"github.com/avalokhq/avalok/internal/credential"
)

// Resolver discovers credentials from the operator's local environment.
// It reads kubeconfig, SSH config, Docker socket, etc. from their default locations.
type Resolver struct{}

func New() *Resolver {
	return &Resolver{}
}

func (r *Resolver) Resolve(ctx context.Context, providerType string, targetType string, targetConfig map[string]any) (*credential.Credentials, error) {
	config := make(map[string]any)

	switch targetType {
	case "kubernetes":
		if v, ok := targetConfig["kubeconfig"].(string); ok && v != "" {
			config["kubeconfig"] = v
		} else {
			config["kubeconfig"] = defaultKubeconfig()
		}
		if v, ok := targetConfig["context"]; ok {
			config["context"] = v
		}
		if v, ok := targetConfig["namespace"]; ok {
			config["namespace"] = v
		}
		if v, ok := targetConfig["proxy_url"]; ok {
			config["proxy_url"] = v
		}

	case "ssh":
		config["ssh_config"] = defaultSSHConfig()
		if v, ok := targetConfig["host"]; ok {
			config["host"] = v
		}

	case "winrm":
		if v, ok := targetConfig["host"]; ok {
			config["host"] = v
		}
		if v, ok := targetConfig["user"]; ok {
			config["user"] = v
		}
		if v, ok := targetConfig["password"]; ok {
			config["password"] = v
		}

	case "local":
		// no credentials needed for local access

	case "windows":
		// no credentials needed for local Windows access
	}

	for k, v := range targetConfig {
		if _, exists := config[k]; !exists {
			config[k] = v
		}
	}

	return &credential.Credentials{
		Type:   targetType,
		Config: config,
	}, nil
}

func defaultKubeconfig() string {
	if v := os.Getenv("KUBECONFIG"); v != "" {
		return v
	}
	home, _ := os.UserHomeDir()
	return filepath.Join(home, ".kube", "config")
}

func defaultSSHConfig() string {
	home, _ := os.UserHomeDir()
	if runtime.GOOS == "windows" {
		return filepath.Join(home, ".ssh", "config")
	}
	return filepath.Join(home, ".ssh", "config")
}
