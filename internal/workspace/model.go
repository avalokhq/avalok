package workspace

import "encoding/json"

type Workspace struct {
	Name        string       `yaml:"name"`
	Description string       `yaml:"description"`
	Services    []Service    `yaml:"services"`
	Environments []Environment `yaml:"environments"`
	Settings    Settings     `yaml:"settings"`
}

type Service struct {
	Name         string         `yaml:"name"`
	Provider     string         `yaml:"provider"`
	FriendlyName string         `yaml:"friendly_name"`
	Config       map[string]any `yaml:"config"`
}

type Environment struct {
	Name    string   `yaml:"name"`
	Profile string   `yaml:"profile,omitempty"`
	Targets []Target `yaml:"targets"`
}

type Target struct {
	Name              string            `yaml:"name" json:"name"`
	Type              string            `yaml:"type" json:"type"`
	Host              string            `yaml:"host,omitempty" json:"host,omitempty"`
	User              string            `yaml:"user,omitempty" json:"user,omitempty"`
	Port              string            `yaml:"port,omitempty" json:"port,omitempty"`
	KeyPath           string            `yaml:"key_path,omitempty" json:"key_path,omitempty"`
	Password          string            `yaml:"password,omitempty" json:"password,omitempty"`
	Passphrase        string            `yaml:"passphrase,omitempty" json:"passphrase,omitempty"`
	Sudo              bool              `yaml:"sudo,omitempty" json:"sudo,omitempty"`
	UseHTTPS          bool              `yaml:"use_https,omitempty" json:"use_https,omitempty"`
	Insecure          bool              `yaml:"insecure,omitempty" json:"insecure,omitempty"`
	Context           string            `yaml:"context,omitempty" json:"context,omitempty"`
	Namespace         string            `yaml:"namespace,omitempty" json:"namespace,omitempty"`
	Kubeconfig        string            `yaml:"kubeconfig,omitempty" json:"kubeconfig,omitempty"`
	ProxyURL          string            `yaml:"proxy_url,omitempty" json:"proxy_url,omitempty"`
	APIServerURL      string            `yaml:"api_server_url,omitempty" json:"api_server_url,omitempty"`
	BearerToken       string            `yaml:"bearer_token,omitempty" json:"bearer_token,omitempty"`
	CACert            string            `yaml:"ca_cert,omitempty" json:"ca_cert,omitempty"`
	InsecureSkipTLS   bool              `yaml:"insecure_skip_tls,omitempty" json:"insecure_skip_tls,omitempty"`
	KubeconfigContent string            `yaml:"kubeconfig_content,omitempty" json:"kubeconfig_content,omitempty"`
	CredentialProfile string            `yaml:"credential_profile,omitempty" json:"credential_profile,omitempty"`
	ServiceNames      []string          `yaml:"service_names,omitempty" json:"service_names,omitempty"`
	Services          []ServiceOverride `yaml:"services,omitempty" json:"services,omitempty"`
}

type ServiceOverride struct {
	Name   string         `yaml:"name"`
	Config map[string]any `yaml:"config"`
}

type Settings struct {
	SSHTimeout int    `yaml:"ssh_timeout,omitempty" json:"ssh_timeout,omitempty"`
	Hierarchy  string `yaml:"hierarchy,omitempty" json:"hierarchy,omitempty"`
}

func (w *Workspace) FindService(name string) *Service {
	for i := range w.Services {
		if w.Services[i].Name == name {
			return &w.Services[i]
		}
	}
	return nil
}

func (w *Workspace) FindEnvironment(name string) *Environment {
	for i := range w.Environments {
		if w.Environments[i].Name == name {
			return &w.Environments[i]
		}
	}
	return nil
}

func (e *Environment) FindTarget(name string) *Target {
	for i := range e.Targets {
		if e.Targets[i].Name == name {
			return &e.Targets[i]
		}
	}
	return nil
}

var targetPascalToSnake = map[string]string{
	"Name": "name", "Type": "type", "Host": "host", "User": "user",
	"Port": "port", "KeyPath": "key_path", "Password": "password",
	"Passphrase": "passphrase", "Sudo": "sudo", "UseHTTPS": "use_https",
	"Insecure": "insecure", "Context": "context", "Namespace": "namespace",
	"Kubeconfig": "kubeconfig", "ProxyURL": "proxy_url",
	"APIServerURL": "api_server_url", "BearerToken": "bearer_token",
	"CACert": "ca_cert", "InsecureSkipTLS": "insecure_skip_tls",
	"KubeconfigContent": "kubeconfig_content",
	"CredentialProfile": "credential_profile",
	"ServiceNames": "service_names", "Services": "services",
}

func (t *Target) UnmarshalJSON(data []byte) error {
	var raw map[string]json.RawMessage
	if err := json.Unmarshal(data, &raw); err != nil {
		return err
	}
	normalized := make(map[string]json.RawMessage, len(raw))
	for k, v := range raw {
		if snake, ok := targetPascalToSnake[k]; ok {
			normalized[snake] = v
		} else {
			normalized[k] = v
		}
	}
	norm, err := json.Marshal(normalized)
	if err != nil {
		return err
	}
	type Alias Target
	return json.Unmarshal(norm, (*Alias)(t))
}

func (t *Target) AllServiceNames() []string {
	names := make([]string, 0, len(t.ServiceNames)+len(t.Services))
	names = append(names, t.ServiceNames...)
	for _, s := range t.Services {
		names = append(names, s.Name)
	}
	return names
}

func (t *Target) GetServiceConfig(name string) map[string]any {
	for _, s := range t.Services {
		if s.Name == name {
			return s.Config
		}
	}
	return nil
}

func (w *Workspace) ListUniqueServiceNames() []string {
	seen := map[string]bool{}
	var names []string
	for _, env := range w.Environments {
		for _, target := range env.Targets {
			for _, svcName := range target.AllServiceNames() {
				if !seen[svcName] {
					seen[svcName] = true
					names = append(names, svcName)
				}
			}
		}
	}
	return names
}

func (w *Workspace) ListEnvironmentsForService(svcName string) []Environment {
	var envs []Environment
	for _, env := range w.Environments {
		for _, target := range env.Targets {
			for _, name := range target.AllServiceNames() {
				if name == svcName {
					envs = append(envs, env)
					goto next
				}
			}
		}
	next:
	}
	return envs
}
