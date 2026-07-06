package memory

import (
	"context"
	"fmt"
	"sync"
	"time"

	"github.com/avalokhq/avalok/internal/store"
	"github.com/avalokhq/avalok/internal/workspace"
)

const maxAuditEntries = 10000

type Store struct {
	mu                 sync.RWMutex
	workspaces         map[string]*workspace.Workspace
	users              map[string]*store.User
	tokens             map[string]*store.User
	usernames          map[string]*store.User
	credentials        map[string]*store.Credential
	sessions           map[string]*store.Session // keyed by token
	audit              []*store.AuditEntry
	settings           map[string]string
	standaloneEnvs     map[string]*workspace.StandaloneEnvironment
	standaloneServices map[string]*workspace.StandaloneService
	resources          map[string]*store.Resource
}

func New() *Store {
	s := &Store{
		workspaces:         make(map[string]*workspace.Workspace),
		users:              make(map[string]*store.User),
		tokens:             make(map[string]*store.User),
		usernames:          make(map[string]*store.User),
		credentials:        make(map[string]*store.Credential),
		sessions:           make(map[string]*store.Session),
		settings:           make(map[string]string),
		standaloneEnvs:     make(map[string]*workspace.StandaloneEnvironment),
		standaloneServices: make(map[string]*workspace.StandaloneService),
		resources:          make(map[string]*store.Resource),
	}
	go s.cleanupExpiredSessions()
	return s
}

func (s *Store) cleanupExpiredSessions() {
	for {
		time.Sleep(5 * time.Minute)
		now := time.Now()
		s.mu.Lock()
		for token, sess := range s.sessions {
			if !sess.ExpiresAt.IsZero() && now.After(sess.ExpiresAt) {
				delete(s.sessions, token)
			}
		}
		s.mu.Unlock()
	}
}

func (s *Store) SaveWorkspace(_ context.Context, w *workspace.Workspace) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.workspaces[w.Name] = w
	return nil
}

func (s *Store) GetWorkspace(_ context.Context, name string) (*workspace.Workspace, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	w, ok := s.workspaces[name]
	if !ok {
		return nil, fmt.Errorf("workspace %q not found", name)
	}
	return w, nil
}

func (s *Store) ListWorkspaces(_ context.Context) ([]*workspace.Workspace, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	ws := make([]*workspace.Workspace, 0, len(s.workspaces))
	for _, w := range s.workspaces {
		ws = append(ws, w)
	}
	return ws, nil
}

func (s *Store) DeleteWorkspace(_ context.Context, name string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.workspaces, name)
	return nil
}

func (s *Store) CreateUser(_ context.Context, user *store.User) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.users[user.ID] = user
	if user.Token != "" {
		s.tokens[user.Token] = user
	}
	if user.Username != "" {
		s.usernames[user.Username] = user
	}
	return nil
}

func (s *Store) GetUser(_ context.Context, id string) (*store.User, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	u, ok := s.users[id]
	if !ok {
		return nil, fmt.Errorf("user %q not found", id)
	}
	return u, nil
}

func (s *Store) GetUserByToken(_ context.Context, token string) (*store.User, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	u, ok := s.tokens[token]
	if !ok {
		return nil, fmt.Errorf("invalid token")
	}
	return u, nil
}

func (s *Store) ListUsers(_ context.Context) ([]*store.User, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	users := make([]*store.User, 0, len(s.users))
	for _, u := range s.users {
		users = append(users, u)
	}
	return users, nil
}

func (s *Store) GetUserByUsername(_ context.Context, username string) (*store.User, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	u, ok := s.usernames[username]
	if !ok {
		return nil, fmt.Errorf("user %q not found", username)
	}
	return u, nil
}

func (s *Store) UpdateUser(_ context.Context, user *store.User) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	old, ok := s.users[user.ID]
	if !ok {
		return fmt.Errorf("user %q not found", user.ID)
	}
	if old.Token != "" {
		delete(s.tokens, old.Token)
	}
	if old.Username != "" {
		delete(s.usernames, old.Username)
	}
	s.users[user.ID] = user
	if user.Token != "" {
		s.tokens[user.Token] = user
	}
	if user.Username != "" {
		s.usernames[user.Username] = user
	}
	return nil
}

func (s *Store) DeleteUser(_ context.Context, id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	u, ok := s.users[id]
	if ok {
		if u.Token != "" {
			delete(s.tokens, u.Token)
		}
		if u.Username != "" {
			delete(s.usernames, u.Username)
		}
	}
	delete(s.users, id)
	return nil
}

func (s *Store) SaveCredential(_ context.Context, cred *store.Credential) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.credentials[cred.Name] = cred
	return nil
}

func (s *Store) GetCredential(_ context.Context, name string) (*store.Credential, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	c, ok := s.credentials[name]
	if !ok {
		return nil, fmt.Errorf("credential %q not found", name)
	}
	return c, nil
}

func (s *Store) ListCredentials(_ context.Context) ([]*store.Credential, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	creds := make([]*store.Credential, 0, len(s.credentials))
	for _, c := range s.credentials {
		creds = append(creds, c)
	}
	return creds, nil
}

func (s *Store) DeleteCredential(_ context.Context, name string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.credentials, name)
	return nil
}

func (s *Store) SaveResource(_ context.Context, res *store.Resource) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.resources[res.Name] = res
	return nil
}

func (s *Store) GetResource(_ context.Context, name string) (*store.Resource, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	r, ok := s.resources[name]
	if !ok {
		return nil, fmt.Errorf("resource %q not found", name)
	}
	return r, nil
}

func (s *Store) ListResources(_ context.Context) ([]*store.Resource, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	resources := make([]*store.Resource, 0, len(s.resources))
	for _, r := range s.resources {
		resources = append(resources, r)
	}
	return resources, nil
}

func (s *Store) DeleteResource(_ context.Context, name string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.resources, name)
	return nil
}

func (s *Store) CreateSession(_ context.Context, sess *store.Session) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.sessions[sess.Token] = sess
	return nil
}

func (s *Store) GetSession(_ context.Context, token string) (*store.Session, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	sess, ok := s.sessions[token]
	if !ok {
		return nil, fmt.Errorf("session not found")
	}
	return sess, nil
}

func (s *Store) DeleteSession(_ context.Context, token string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.sessions, token)
	return nil
}

func (s *Store) DeleteUserSessions(_ context.Context, userID string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	for token, sess := range s.sessions {
		if sess.UserID == userID {
			delete(s.sessions, token)
		}
	}
	return nil
}

func (s *Store) RecordAudit(_ context.Context, entry *store.AuditEntry) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.audit = append(s.audit, entry)
	if len(s.audit) > maxAuditEntries {
		s.audit = s.audit[len(s.audit)-maxAuditEntries:]
	}
	return nil
}

func (s *Store) GetSetting(_ context.Context, key string) (string, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.settings[key], nil
}

func (s *Store) SetSetting(_ context.Context, key, value string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.settings[key] = value
	return nil
}

func (s *Store) GetAllSettings(_ context.Context) (map[string]string, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make(map[string]string, len(s.settings))
	for k, v := range s.settings {
		out[k] = v
	}
	return out, nil
}

func (s *Store) SaveStandaloneEnv(_ context.Context, env *workspace.StandaloneEnvironment) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.standaloneEnvs[env.Name] = env
	return nil
}

func (s *Store) GetStandaloneEnv(_ context.Context, name string) (*workspace.StandaloneEnvironment, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	env, ok := s.standaloneEnvs[name]
	if !ok {
		return nil, fmt.Errorf("standalone environment %q not found", name)
	}
	return env, nil
}

func (s *Store) ListStandaloneEnvs(_ context.Context) ([]*workspace.StandaloneEnvironment, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	envs := make([]*workspace.StandaloneEnvironment, 0, len(s.standaloneEnvs))
	for _, env := range s.standaloneEnvs {
		envs = append(envs, env)
	}
	return envs, nil
}

func (s *Store) DeleteStandaloneEnv(_ context.Context, name string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.standaloneEnvs, name)
	return nil
}

func (s *Store) SaveStandaloneService(_ context.Context, svc *workspace.StandaloneService) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.standaloneServices[svc.Name] = svc
	return nil
}

func (s *Store) GetStandaloneService(_ context.Context, name string) (*workspace.StandaloneService, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	svc, ok := s.standaloneServices[name]
	if !ok {
		return nil, fmt.Errorf("standalone service %q not found", name)
	}
	return svc, nil
}

func (s *Store) ListStandaloneServices(_ context.Context) ([]*workspace.StandaloneService, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	svcs := make([]*workspace.StandaloneService, 0, len(s.standaloneServices))
	for _, svc := range s.standaloneServices {
		svcs = append(svcs, svc)
	}
	return svcs, nil
}

func (s *Store) DeleteStandaloneService(_ context.Context, name string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.standaloneServices, name)
	return nil
}
