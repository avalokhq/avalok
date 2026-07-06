package managed

import (
	"context"
	"fmt"

	"github.com/avalokhq/avalok/internal/credential"
	"github.com/avalokhq/avalok/internal/store"
)

type Resolver struct {
	store store.Store
}

func New(s store.Store) *Resolver {
	return &Resolver{store: s}
}

func (r *Resolver) Resolve(ctx context.Context, providerType string, targetType string, targetConfig map[string]any) (*credential.Credentials, error) {
	profileName, _ := targetConfig["credential_profile"].(string)
	if profileName == "" {
		return &credential.Credentials{
			Type:   targetType,
			Config: targetConfig,
		}, nil
	}

	cred, err := r.store.GetCredential(ctx, profileName)
	if err != nil {
		return nil, fmt.Errorf("credential profile %q: %w", profileName, err)
	}

	if cred.TargetType != targetType {
		return nil, fmt.Errorf("credential profile %q is type %q but target expects %q", profileName, cred.TargetType, targetType)
	}

	merged := make(map[string]any)
	for k, v := range cred.Config {
		merged[k] = v
	}
	for k, v := range targetConfig {
		if k == "credential_profile" {
			continue
		}
		merged[k] = v
	}

	return &credential.Credentials{
		Type:   targetType,
		Config: merged,
	}, nil
}
