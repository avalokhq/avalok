package workspace

import "fmt"

// ResolvedService combines a global service definition with target-level
// connection info and any per-target config overrides.
type ResolvedService struct {
	Service     Service
	Target      Target
	Environment Environment
	Config      map[string]any
}

// Resolve returns all services for a given environment, merging global service
// config with any target-level overrides.
func (w *Workspace) Resolve(envName string) ([]ResolvedService, error) {
	env := w.FindEnvironment(envName)
	if env == nil {
		return nil, fmt.Errorf("environment %q not found", envName)
	}
	return w.ResolveEnvironment(env), nil
}

// ResolveEnvironment returns all resolved services for an environment.
func (w *Workspace) ResolveEnvironment(env *Environment) []ResolvedService {
	var resolved []ResolvedService

	for _, target := range env.Targets {
		for _, svcName := range target.AllServiceNames() {
			svc := w.FindService(svcName)
			if svc == nil {
				continue
			}

			config := mergeConfig(svc.Config, target.GetServiceConfig(svcName))
			switch target.Type {
			case "ssh", "winrm":
				injectTargetFields(config, &target)
			case "kubernetes":
				injectKubernetesTargetFields(config, &target)
			}

			resolved = append(resolved, ResolvedService{
				Service:     *svc,
				Target:      target,
				Environment: *env,
				Config:      config,
			})
		}
	}

	return resolved
}

// ResolveService resolves a single service in an environment.
func (w *Workspace) ResolveService(envName, serviceName string) (*ResolvedService, error) {
	env := w.FindEnvironment(envName)
	if env == nil {
		return nil, fmt.Errorf("environment %q not found", envName)
	}

	svc := w.FindService(serviceName)
	if svc == nil {
		return nil, fmt.Errorf("service %q not found", serviceName)
	}

	for _, target := range env.Targets {
		for _, sn := range target.AllServiceNames() {
			if sn == serviceName {
				config := mergeConfig(svc.Config, target.GetServiceConfig(serviceName))
				switch target.Type {
				case "ssh", "winrm":
					injectTargetFields(config, &target)
				case "kubernetes":
					injectKubernetesTargetFields(config, &target)
				}
				return &ResolvedService{
					Service:     *svc,
					Target:      target,
					Environment: *env,
					Config:      config,
				}, nil
			}
		}
	}

	return nil, fmt.Errorf("service %q not found in environment %q", serviceName, envName)
}

func mergeConfig(base, override map[string]any) map[string]any {
	merged := make(map[string]any, len(base)+len(override))
	for k, v := range base {
		merged[k] = v
	}
	for k, v := range override {
		merged[k] = v
	}
	return merged
}

func injectKubernetesTargetFields(config map[string]any, target *Target) {
	if target.Context != "" {
		if _, exists := config["context"]; !exists {
			config["context"] = target.Context
		}
	}
	if target.Namespace != "" {
		if _, exists := config["namespace"]; !exists {
			config["namespace"] = target.Namespace
		}
	}
	if target.Kubeconfig != "" {
		if _, exists := config["kubeconfig"]; !exists {
			config["kubeconfig"] = target.Kubeconfig
		}
	}
	if target.ProxyURL != "" {
		if _, exists := config["proxy_url"]; !exists {
			config["proxy_url"] = target.ProxyURL
		}
	}
	if target.APIServerURL != "" {
		if _, exists := config["api_server_url"]; !exists {
			config["api_server_url"] = target.APIServerURL
		}
	}
	if target.BearerToken != "" {
		if _, exists := config["bearer_token"]; !exists {
			config["bearer_token"] = target.BearerToken
		}
	}
	if target.CACert != "" {
		if _, exists := config["ca_cert"]; !exists {
			config["ca_cert"] = target.CACert
		}
	}
	if target.KubeconfigContent != "" {
		if _, exists := config["kubeconfig_content"]; !exists {
			config["kubeconfig_content"] = target.KubeconfigContent
		}
	}
	if target.InsecureSkipTLS {
		if _, exists := config["insecure_skip_tls"]; !exists {
			config["insecure_skip_tls"] = true
		}
	}
}

func injectTargetFields(config map[string]any, target *Target) {
	if target.Host != "" {
		if _, exists := config["host"]; !exists {
			config["host"] = target.Host
		}
	}
	if target.User != "" {
		if _, exists := config["user"]; !exists {
			config["user"] = target.User
		}
	}
	if target.Port != "" {
		if _, exists := config["port"]; !exists {
			config["port"] = target.Port
		}
	}
	if target.KeyPath != "" {
		if _, exists := config["key_path"]; !exists {
			config["key_path"] = target.KeyPath
		}
	}
	if target.Password != "" {
		if _, exists := config["password"]; !exists {
			config["password"] = target.Password
		}
	}
	if target.Passphrase != "" {
		if _, exists := config["passphrase"]; !exists {
			config["passphrase"] = target.Passphrase
		}
	}
	if target.Sudo {
		if _, exists := config["sudo"]; !exists {
			config["sudo"] = true
		}
	}
	if target.UseHTTPS {
		if _, exists := config["use_https"]; !exists {
			config["use_https"] = true
		}
	}
	if target.Insecure {
		if _, exists := config["insecure"]; !exists {
			config["insecure"] = true
		}
	}
}
