package workspace

import "fmt"

type StandaloneEnvironment struct {
	Name        string    `json:"name" yaml:"name"`
	Description string    `json:"description" yaml:"description"`
	Services    []Service `json:"services" yaml:"services"`
	Targets     []Target  `json:"targets" yaml:"targets"`
}

type StandaloneService struct {
	Name        string         `json:"name" yaml:"name"`
	Description string         `json:"description" yaml:"description"`
	Provider    string         `json:"provider" yaml:"provider"`
	Config      map[string]any `json:"config" yaml:"config"`
	Target      Target         `json:"target" yaml:"target"`
}

func (se *StandaloneEnvironment) FindService(name string) *Service {
	for i := range se.Services {
		if se.Services[i].Name == name {
			return &se.Services[i]
		}
	}
	return nil
}

func (se *StandaloneEnvironment) ResolveAll() []ResolvedService {
	var resolved []ResolvedService
	for _, target := range se.Targets {
		for _, svcName := range target.AllServiceNames() {
			svc := se.FindService(svcName)
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
				Service: *svc,
				Target:  target,
				Config:  config,
			})
		}
	}
	return resolved
}

func (se *StandaloneEnvironment) ResolveService(serviceName string) (*ResolvedService, error) {
	svc := se.FindService(serviceName)
	if svc == nil {
		return nil, fmt.Errorf("service %q not found", serviceName)
	}
	for _, target := range se.Targets {
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
					Service: *svc,
					Target:  target,
					Config:  config,
				}, nil
			}
		}
	}
	return nil, fmt.Errorf("service %q not mapped to any target", serviceName)
}

func (ss *StandaloneService) Resolve() *ResolvedService {
	config := make(map[string]any, len(ss.Config))
	for k, v := range ss.Config {
		config[k] = v
	}
	switch ss.Target.Type {
	case "ssh", "winrm":
		injectTargetFields(config, &ss.Target)
	case "kubernetes":
		injectKubernetesTargetFields(config, &ss.Target)
	}
	return &ResolvedService{
		Service: Service{
			Name:     ss.Name,
			Provider: ss.Provider,
			Config:   ss.Config,
		},
		Target: ss.Target,
		Config: config,
	}
}
