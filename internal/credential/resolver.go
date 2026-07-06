package credential

import "context"

// Credentials holds resolved connection details for a provider.
type Credentials struct {
	Type   string
	Config map[string]any
}

// Resolver resolves credentials for a given provider and target config.
// In serve mode, this auto-discovers from the operator's local environment.
// In server mode, this reads from managed credential profiles.
type Resolver interface {
	Resolve(ctx context.Context, providerType string, targetType string, targetConfig map[string]any) (*Credentials, error)
}
