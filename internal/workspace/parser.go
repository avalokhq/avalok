package workspace

import (
	"fmt"
	"os"

	"gopkg.in/yaml.v3"
)

type fileFormat struct {
	Workspace    workspaceMeta `yaml:"workspace"`
	Services     []Service     `yaml:"services"`
	Environments []Environment `yaml:"environments"`
	Settings     Settings      `yaml:"settings"`
}

type workspaceMeta struct {
	Name        string `yaml:"name"`
	Description string `yaml:"description"`
}

func Load(path string) (*Workspace, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("reading workspace file: %w", err)
	}
	return Parse(data)
}

func Parse(data []byte) (*Workspace, error) {
	var f fileFormat
	if err := yaml.Unmarshal(data, &f); err != nil {
		return nil, fmt.Errorf("parsing workspace YAML: %w", err)
	}

	w := &Workspace{
		Name:         f.Workspace.Name,
		Description:  f.Workspace.Description,
		Services:     f.Services,
		Environments: f.Environments,
		Settings:     f.Settings,
	}

	w.Normalize()

	if err := validate(w); err != nil {
		return nil, err
	}

	return w, nil
}

func validate(w *Workspace) error {
	if w.Name == "" {
		return fmt.Errorf("workspace name is required")
	}
	if len(w.Services) == 0 {
		return fmt.Errorf("at least one service must be defined")
	}

	serviceMap := map[string]bool{}
	for _, s := range w.Services {
		if s.Name == "" {
			return fmt.Errorf("service name is required")
		}
		if s.Provider == "" {
			return fmt.Errorf("service %q: provider is required", s.Name)
		}
		if serviceMap[s.Name] {
			return fmt.Errorf("duplicate service name: %q", s.Name)
		}
		serviceMap[s.Name] = true
	}

	for _, env := range w.Environments {
		if env.Name == "" {
			return fmt.Errorf("environment name is required")
		}
		for _, target := range env.Targets {
			if target.Name == "" {
				return fmt.Errorf("environment %q: target name is required", env.Name)
			}
			if target.Type == "" {
				return fmt.Errorf("environment %q, target %q: type is required", env.Name, target.Name)
			}
			for _, sn := range target.ServiceNames {
				if !serviceMap[sn] {
					return fmt.Errorf("environment %q, target %q: unknown service %q", env.Name, target.Name, sn)
				}
			}
			for _, so := range target.Services {
				if !serviceMap[so.Name] {
					return fmt.Errorf("environment %q, target %q: unknown service override %q", env.Name, target.Name, so.Name)
				}
			}
		}
	}

	return nil
}
