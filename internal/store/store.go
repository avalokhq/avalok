package store

import (
	"context"
	"time"

	"github.com/avalokhq/avalok/internal/workspace"
)

type User struct {
	ID        string
	Username  string
	Email     string
	Password  string // bcrypt hash (server mode only)
	Role      string
	Status    string // "active", "pending", "disabled" — empty treated as "active" for backward compat
	Token     string
	ExpiresAt time.Time
	Scope     []string // e.g. ["payments/development/api", "payments/development/worker"]. Empty = full access.
	CreatedAt time.Time
	UpdatedAt time.Time
}

func (u *User) IsActive() bool {
	return u.Status == "" || u.Status == "active"
}

func (u *User) HasAccess(workspace, env, service string) bool {
	if len(u.Scope) == 0 {
		return true
	}
	path := workspace + "/" + env + "/" + service
	envPath := workspace + "/" + env
	wsPath := workspace
	for _, s := range u.Scope {
		if s == path || s == envPath || s == wsPath {
			return true
		}
	}
	return false
}

func (u *User) HasWorkspaceAccess(workspace string) bool {
	if len(u.Scope) == 0 {
		return true
	}
	for _, s := range u.Scope {
		if len(s) >= len(workspace) && s[:len(workspace)] == workspace {
			if len(s) == len(workspace) || s[len(workspace)] == '/' {
				return true
			}
		}
	}
	return false
}

func (u *User) HasEnvAccess(workspace, env string) bool {
	if len(u.Scope) == 0 {
		return true
	}
	prefix := workspace + "/" + env
	for _, s := range u.Scope {
		if len(s) >= len(prefix) && s[:len(prefix)] == prefix {
			if len(s) == len(prefix) || s[len(prefix)] == '/' {
				return true
			}
		}
	}
	return false
}

func (u *User) HasWorkspaceServiceAccess(ws, service string) bool {
	if len(u.Scope) == 0 {
		return true
	}
	wsPrefix := ws + "/"
	for _, s := range u.Scope {
		if s == ws {
			return true
		}
		if len(s) > len(wsPrefix) && s[:len(wsPrefix)] == wsPrefix {
			rest := s[len(wsPrefix):]
			slashIdx := -1
			for i := 0; i < len(rest); i++ {
				if rest[i] == '/' {
					slashIdx = i
					break
				}
			}
			if slashIdx == -1 {
				return true
			}
			if rest[slashIdx+1:] == service {
				return true
			}
		}
	}
	return false
}

func (u *User) HasStandaloneEnvAccess(envName string) bool {
	if len(u.Scope) == 0 {
		return true
	}
	prefix := "env:" + envName
	for _, s := range u.Scope {
		if len(s) >= len(prefix) && s[:len(prefix)] == prefix {
			if len(s) == len(prefix) || s[len(prefix)] == '/' {
				return true
			}
		}
	}
	return false
}

func (u *User) HasStandaloneEnvServiceAccess(envName, serviceName string) bool {
	if len(u.Scope) == 0 {
		return true
	}
	full := "env:" + envName + "/" + serviceName
	envOnly := "env:" + envName
	for _, s := range u.Scope {
		if s == full || s == envOnly {
			return true
		}
	}
	return false
}

func (u *User) HasStandaloneServiceAccess(serviceName string) bool {
	if len(u.Scope) == 0 {
		return true
	}
	target := "svc:" + serviceName
	for _, s := range u.Scope {
		if s == target {
			return true
		}
	}
	return false
}

func (u *User) HasResourceAccess(resourceName string) bool {
	if len(u.Scope) == 0 {
		return true
	}
	prefix := "res:" + resourceName
	for _, s := range u.Scope {
		if len(s) >= len(prefix) && s[:len(prefix)] == prefix {
			if len(s) == len(prefix) || s[len(prefix)] == '/' {
				return true
			}
		}
	}
	return false
}

func (u *User) HasResourceNamespaceAccess(resourceName, namespace string) bool {
	if len(u.Scope) == 0 {
		return true
	}
	full := "res:" + resourceName + "/" + namespace
	resOnly := "res:" + resourceName
	for _, s := range u.Scope {
		if s == full || s == resOnly {
			return true
		}
	}
	return false
}

type Credential struct {
	ID          string
	Name        string
	TargetType  string         // "kubernetes", "ssh", "winrm"
	Config      map[string]any // connection details (kubeconfig content, SSH key, etc.)
	Description string
	CreatedAt   time.Time
	UpdatedAt   time.Time
}

type Resource struct {
	ID          string
	Name        string
	Type        string         // "kubernetes"
	Config      map[string]any // api_server_url, bearer_token, ca_cert, insecure_skip_tls
	Description string
	CreatedAt   time.Time
	UpdatedAt   time.Time
}

type Session struct {
	ID        string
	UserID    string
	Token     string // JWT jti claim, stored for revocation
	ExpiresAt time.Time
	CreatedAt time.Time
}

type AuditEntry struct {
	ID        string
	UserID    string
	Action    string
	Resource  string
	Timestamp time.Time
	Details   map[string]string
}

type Store interface {
	SaveWorkspace(ctx context.Context, w *workspace.Workspace) error
	GetWorkspace(ctx context.Context, name string) (*workspace.Workspace, error)
	ListWorkspaces(ctx context.Context) ([]*workspace.Workspace, error)
	DeleteWorkspace(ctx context.Context, name string) error

	CreateUser(ctx context.Context, user *User) error
	GetUser(ctx context.Context, id string) (*User, error)
	GetUserByToken(ctx context.Context, token string) (*User, error)
	GetUserByUsername(ctx context.Context, username string) (*User, error)
	ListUsers(ctx context.Context) ([]*User, error)
	UpdateUser(ctx context.Context, user *User) error
	DeleteUser(ctx context.Context, id string) error

	SaveCredential(ctx context.Context, cred *Credential) error
	GetCredential(ctx context.Context, name string) (*Credential, error)
	ListCredentials(ctx context.Context) ([]*Credential, error)
	DeleteCredential(ctx context.Context, name string) error

	SaveResource(ctx context.Context, res *Resource) error
	GetResource(ctx context.Context, name string) (*Resource, error)
	ListResources(ctx context.Context) ([]*Resource, error)
	DeleteResource(ctx context.Context, name string) error

	CreateSession(ctx context.Context, sess *Session) error
	GetSession(ctx context.Context, token string) (*Session, error)
	DeleteSession(ctx context.Context, token string) error
	DeleteUserSessions(ctx context.Context, userID string) error

	RecordAudit(ctx context.Context, entry *AuditEntry) error

	GetSetting(ctx context.Context, key string) (string, error)
	SetSetting(ctx context.Context, key, value string) error
	GetAllSettings(ctx context.Context) (map[string]string, error)

	SaveStandaloneEnv(ctx context.Context, env *workspace.StandaloneEnvironment) error
	GetStandaloneEnv(ctx context.Context, name string) (*workspace.StandaloneEnvironment, error)
	ListStandaloneEnvs(ctx context.Context) ([]*workspace.StandaloneEnvironment, error)
	DeleteStandaloneEnv(ctx context.Context, name string) error

	SaveStandaloneService(ctx context.Context, svc *workspace.StandaloneService) error
	GetStandaloneService(ctx context.Context, name string) (*workspace.StandaloneService, error)
	ListStandaloneServices(ctx context.Context) ([]*workspace.StandaloneService, error)
	DeleteStandaloneService(ctx context.Context, name string) error
}
