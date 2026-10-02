package workspace

import (
	"fmt"
	"strings"
)

// reservedNameChars are separators in user access scopes ("ws/env/svc", "env:name", "svc:name",
// "res:name/ns", "*"); allowing them in names would let one entity's scope match another's.
const reservedNameChars = "/:*"

// ValidateName checks a workspace, environment, service or resource name.
func ValidateName(kind, name string) error {
	if strings.TrimSpace(name) == "" {
		return fmt.Errorf("%s name is required", kind)
	}
	if strings.ContainsAny(name, reservedNameChars) {
		return fmt.Errorf("%s name %q must not contain '/', ':' or '*'", kind, name)
	}
	return nil
}

// ValidateNames checks the workspace name and every service and environment name inside it.
func (w *Workspace) ValidateNames() error {
	if err := ValidateName("workspace", w.Name); err != nil {
		return err
	}
	for _, s := range w.Services {
		if err := ValidateName("service", s.Name); err != nil {
			return err
		}
	}
	for _, env := range w.Environments {
		if err := ValidateName("environment", env.Name); err != nil {
			return err
		}
	}
	return nil
}

// ValidateNames checks the environment name and every service name inside it.
func (se *StandaloneEnvironment) ValidateNames() error {
	if err := ValidateName("environment", se.Name); err != nil {
		return err
	}
	for _, s := range se.Services {
		if err := ValidateName("service", s.Name); err != nil {
			return err
		}
	}
	return nil
}
