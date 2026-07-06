package postgres

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/avalokhq/avalok/internal/store"
	"github.com/avalokhq/avalok/internal/workspace"
)

type Store struct {
	pool *pgxpool.Pool
}

func New(ctx context.Context, connString string) (*Store, error) {
	pool, err := pgxpool.New(ctx, connString)
	if err != nil {
		return nil, fmt.Errorf("connecting to database: %w", err)
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("pinging database: %w", err)
	}
	return &Store{pool: pool}, nil
}

func (s *Store) Close() {
	s.pool.Close()
}

func (s *Store) Pool() *pgxpool.Pool {
	return s.pool
}

// --- Workspaces ---

func (s *Store) SaveWorkspace(ctx context.Context, w *workspace.Workspace) error {
	configJSON, err := json.Marshal(w)
	if err != nil {
		return fmt.Errorf("marshaling workspace: %w", err)
	}
	_, err = s.pool.Exec(ctx,
		`INSERT INTO workspaces (name, description, config, updated_at)
		 VALUES ($1, $2, $3, now())
		 ON CONFLICT (name) DO UPDATE SET description = $2, config = $3, updated_at = now()`,
		w.Name, w.Description, configJSON)
	return err
}

func (s *Store) GetWorkspace(ctx context.Context, name string) (*workspace.Workspace, error) {
	var configJSON []byte
	err := s.pool.QueryRow(ctx,
		`SELECT config FROM workspaces WHERE name = $1`, name).Scan(&configJSON)
	if err == pgx.ErrNoRows {
		return nil, fmt.Errorf("workspace %q not found", name)
	}
	if err != nil {
		return nil, err
	}
	var w workspace.Workspace
	if err := json.Unmarshal(configJSON, &w); err != nil {
		return nil, fmt.Errorf("unmarshaling workspace: %w", err)
	}
	return &w, nil
}

func (s *Store) ListWorkspaces(ctx context.Context) ([]*workspace.Workspace, error) {
	rows, err := s.pool.Query(ctx, `SELECT config FROM workspaces ORDER BY name`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var workspaces []*workspace.Workspace
	for rows.Next() {
		var configJSON []byte
		if err := rows.Scan(&configJSON); err != nil {
			return nil, err
		}
		var w workspace.Workspace
		if err := json.Unmarshal(configJSON, &w); err != nil {
			return nil, fmt.Errorf("unmarshaling workspace: %w", err)
		}
		workspaces = append(workspaces, &w)
	}
	return workspaces, rows.Err()
}

func (s *Store) DeleteWorkspace(ctx context.Context, name string) error {
	_, err := s.pool.Exec(ctx, `DELETE FROM workspaces WHERE name = $1`, name)
	return err
}

// --- Users ---

func (s *Store) CreateUser(ctx context.Context, user *store.User) error {
	status := user.Status
	if status == "" {
		status = "active"
	}
	_, err := s.pool.Exec(ctx,
		`INSERT INTO users (id, username, email, password, role, status, scope, token, expires_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
		user.ID, user.Username, nullIfEmpty(user.Email), user.Password,
		user.Role, status, user.Scope, nullIfEmpty(user.Token), nullTime(user.ExpiresAt))
	return err
}

func (s *Store) GetUser(ctx context.Context, id string) (*store.User, error) {
	return s.scanUser(s.pool.QueryRow(ctx,
		`SELECT id, username, COALESCE(email, ''), password, role, status, scope, COALESCE(token, ''), expires_at, created_at, updated_at
		 FROM users WHERE id = $1`, id))
}

func (s *Store) GetUserByToken(ctx context.Context, token string) (*store.User, error) {
	return s.scanUser(s.pool.QueryRow(ctx,
		`SELECT id, username, COALESCE(email, ''), password, role, status, scope, COALESCE(token, ''), expires_at, created_at, updated_at
		 FROM users WHERE token = $1`, token))
}

func (s *Store) GetUserByUsername(ctx context.Context, username string) (*store.User, error) {
	return s.scanUser(s.pool.QueryRow(ctx,
		`SELECT id, username, COALESCE(email, ''), password, role, status, scope, COALESCE(token, ''), expires_at, created_at, updated_at
		 FROM users WHERE username = $1`, username))
}

func (s *Store) ListUsers(ctx context.Context) ([]*store.User, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT id, username, COALESCE(email, ''), password, role, status, scope, COALESCE(token, ''), expires_at, created_at, updated_at
		 FROM users ORDER BY created_at`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var users []*store.User
	for rows.Next() {
		u, err := s.scanUserRow(rows)
		if err != nil {
			return nil, err
		}
		users = append(users, u)
	}
	return users, rows.Err()
}

func (s *Store) UpdateUser(ctx context.Context, user *store.User) error {
	status := user.Status
	if status == "" {
		status = "active"
	}
	_, err := s.pool.Exec(ctx,
		`UPDATE users SET username = $2, email = $3, password = $4, role = $5, status = $6,
		 scope = $7, token = $8, expires_at = $9, updated_at = now()
		 WHERE id = $1`,
		user.ID, user.Username, nullIfEmpty(user.Email), user.Password,
		user.Role, status, user.Scope, nullIfEmpty(user.Token), nullTime(user.ExpiresAt))
	return err
}

func (s *Store) DeleteUser(ctx context.Context, id string) error {
	_, err := s.pool.Exec(ctx, `DELETE FROM users WHERE id = $1`, id)
	return err
}

func (s *Store) scanUser(row pgx.Row) (*store.User, error) {
	u := &store.User{}
	var expiresAt *time.Time
	err := row.Scan(&u.ID, &u.Username, &u.Email, &u.Password, &u.Role, &u.Status,
		&u.Scope, &u.Token, &expiresAt, &u.CreatedAt, &u.UpdatedAt)
	if err == pgx.ErrNoRows {
		return nil, fmt.Errorf("user not found")
	}
	if err != nil {
		return nil, err
	}
	if expiresAt != nil {
		u.ExpiresAt = *expiresAt
	}
	return u, nil
}

func (s *Store) scanUserRow(rows pgx.Rows) (*store.User, error) {
	u := &store.User{}
	var expiresAt *time.Time
	err := rows.Scan(&u.ID, &u.Username, &u.Email, &u.Password, &u.Role, &u.Status,
		&u.Scope, &u.Token, &expiresAt, &u.CreatedAt, &u.UpdatedAt)
	if err != nil {
		return nil, err
	}
	if expiresAt != nil {
		u.ExpiresAt = *expiresAt
	}
	return u, nil
}

// --- Credentials ---

func (s *Store) SaveCredential(ctx context.Context, cred *store.Credential) error {
	configJSON, err := json.Marshal(cred.Config)
	if err != nil {
		return fmt.Errorf("marshaling credential config: %w", err)
	}
	if cred.ID == "" {
		_, err = s.pool.Exec(ctx,
			`INSERT INTO credentials (name, target_type, config, description)
			 VALUES ($1, $2, $3, $4)
			 ON CONFLICT (name) DO UPDATE SET target_type = $2, config = $3, description = $4, updated_at = now()`,
			cred.Name, cred.TargetType, configJSON, cred.Description)
	} else {
		_, err = s.pool.Exec(ctx,
			`INSERT INTO credentials (id, name, target_type, config, description)
			 VALUES ($1, $2, $3, $4, $5)
			 ON CONFLICT (name) DO UPDATE SET target_type = $3, config = $4, description = $5, updated_at = now()`,
			cred.ID, cred.Name, cred.TargetType, configJSON, cred.Description)
	}
	return err
}

func (s *Store) GetCredential(ctx context.Context, name string) (*store.Credential, error) {
	var configJSON []byte
	c := &store.Credential{}
	err := s.pool.QueryRow(ctx,
		`SELECT id, name, target_type, config, description, created_at, updated_at
		 FROM credentials WHERE name = $1`, name).
		Scan(&c.ID, &c.Name, &c.TargetType, &configJSON, &c.Description, &c.CreatedAt, &c.UpdatedAt)
	if err == pgx.ErrNoRows {
		return nil, fmt.Errorf("credential %q not found", name)
	}
	if err != nil {
		return nil, err
	}
	if err := json.Unmarshal(configJSON, &c.Config); err != nil {
		return nil, fmt.Errorf("unmarshaling credential config: %w", err)
	}
	return c, nil
}

func (s *Store) ListCredentials(ctx context.Context) ([]*store.Credential, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT id, name, target_type, config, description, created_at, updated_at
		 FROM credentials ORDER BY name`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var creds []*store.Credential
	for rows.Next() {
		var configJSON []byte
		c := &store.Credential{}
		if err := rows.Scan(&c.ID, &c.Name, &c.TargetType, &configJSON, &c.Description, &c.CreatedAt, &c.UpdatedAt); err != nil {
			return nil, err
		}
		if err := json.Unmarshal(configJSON, &c.Config); err != nil {
			return nil, fmt.Errorf("unmarshaling credential config: %w", err)
		}
		creds = append(creds, c)
	}
	return creds, rows.Err()
}

func (s *Store) DeleteCredential(ctx context.Context, name string) error {
	_, err := s.pool.Exec(ctx, `DELETE FROM credentials WHERE name = $1`, name)
	return err
}

// --- Resources ---

func (s *Store) SaveResource(ctx context.Context, res *store.Resource) error {
	configJSON, err := json.Marshal(res.Config)
	if err != nil {
		return fmt.Errorf("marshaling resource config: %w", err)
	}
	if res.ID == "" {
		_, err = s.pool.Exec(ctx,
			`INSERT INTO resources (name, type, config, description)
			 VALUES ($1, $2, $3, $4)
			 ON CONFLICT (name) DO UPDATE SET type = $2, config = $3, description = $4, updated_at = now()`,
			res.Name, res.Type, configJSON, res.Description)
	} else {
		_, err = s.pool.Exec(ctx,
			`INSERT INTO resources (id, name, type, config, description)
			 VALUES ($1, $2, $3, $4, $5)
			 ON CONFLICT (name) DO UPDATE SET type = $3, config = $4, description = $5, updated_at = now()`,
			res.ID, res.Name, res.Type, configJSON, res.Description)
	}
	return err
}

func (s *Store) GetResource(ctx context.Context, name string) (*store.Resource, error) {
	var configJSON []byte
	r := &store.Resource{}
	err := s.pool.QueryRow(ctx,
		`SELECT id, name, type, config, description, created_at, updated_at
		 FROM resources WHERE name = $1`, name).
		Scan(&r.ID, &r.Name, &r.Type, &configJSON, &r.Description, &r.CreatedAt, &r.UpdatedAt)
	if err == pgx.ErrNoRows {
		return nil, fmt.Errorf("resource %q not found", name)
	}
	if err != nil {
		return nil, err
	}
	if err := json.Unmarshal(configJSON, &r.Config); err != nil {
		return nil, fmt.Errorf("unmarshaling resource config: %w", err)
	}
	return r, nil
}

func (s *Store) ListResources(ctx context.Context) ([]*store.Resource, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT id, name, type, config, description, created_at, updated_at
		 FROM resources ORDER BY name`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var resources []*store.Resource
	for rows.Next() {
		var configJSON []byte
		r := &store.Resource{}
		if err := rows.Scan(&r.ID, &r.Name, &r.Type, &configJSON, &r.Description, &r.CreatedAt, &r.UpdatedAt); err != nil {
			return nil, err
		}
		if err := json.Unmarshal(configJSON, &r.Config); err != nil {
			return nil, fmt.Errorf("unmarshaling resource config: %w", err)
		}
		resources = append(resources, r)
	}
	return resources, rows.Err()
}

func (s *Store) DeleteResource(ctx context.Context, name string) error {
	_, err := s.pool.Exec(ctx, `DELETE FROM resources WHERE name = $1`, name)
	return err
}

// --- Sessions ---

func (s *Store) CreateSession(ctx context.Context, sess *store.Session) error {
	_, err := s.pool.Exec(ctx,
		`INSERT INTO sessions (id, user_id, token, expires_at) VALUES ($1, $2, $3, $4)`,
		sess.ID, sess.UserID, sess.Token, sess.ExpiresAt)
	return err
}

func (s *Store) GetSession(ctx context.Context, token string) (*store.Session, error) {
	sess := &store.Session{}
	err := s.pool.QueryRow(ctx,
		`SELECT id, user_id, token, expires_at, created_at FROM sessions WHERE token = $1`, token).
		Scan(&sess.ID, &sess.UserID, &sess.Token, &sess.ExpiresAt, &sess.CreatedAt)
	if err == pgx.ErrNoRows {
		return nil, fmt.Errorf("session not found")
	}
	if err != nil {
		return nil, err
	}
	return sess, nil
}

func (s *Store) DeleteSession(ctx context.Context, token string) error {
	_, err := s.pool.Exec(ctx, `DELETE FROM sessions WHERE token = $1`, token)
	return err
}

func (s *Store) DeleteUserSessions(ctx context.Context, userID string) error {
	_, err := s.pool.Exec(ctx, `DELETE FROM sessions WHERE user_id = $1`, userID)
	return err
}

// --- Audit ---

func (s *Store) RecordAudit(ctx context.Context, entry *store.AuditEntry) error {
	detailsJSON, err := json.Marshal(entry.Details)
	if err != nil {
		return fmt.Errorf("marshaling audit details: %w", err)
	}
	_, err = s.pool.Exec(ctx,
		`INSERT INTO audit_log (user_id, action, resource, details) VALUES ($1, $2, $3, $4)`,
		nullIfEmpty(entry.UserID), entry.Action, entry.Resource, detailsJSON)
	return err
}

// --- Settings ---

func (s *Store) GetSetting(ctx context.Context, key string) (string, error) {
	var value string
	err := s.pool.QueryRow(ctx, `SELECT value FROM settings WHERE key = $1`, key).Scan(&value)
	if err == pgx.ErrNoRows {
		return "", nil
	}
	return value, err
}

func (s *Store) SetSetting(ctx context.Context, key, value string) error {
	_, err := s.pool.Exec(ctx,
		`INSERT INTO settings (key, value) VALUES ($1, $2)
		 ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = now()`,
		key, value)
	return err
}

func (s *Store) GetAllSettings(ctx context.Context) (map[string]string, error) {
	rows, err := s.pool.Query(ctx, `SELECT key, value FROM settings`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	settings := make(map[string]string)
	for rows.Next() {
		var k, v string
		if err := rows.Scan(&k, &v); err != nil {
			return nil, err
		}
		settings[k] = v
	}
	return settings, rows.Err()
}

// --- Standalone Environments ---

func (s *Store) SaveStandaloneEnv(ctx context.Context, env *workspace.StandaloneEnvironment) error {
	configJSON, err := json.Marshal(env)
	if err != nil {
		return fmt.Errorf("marshaling standalone environment: %w", err)
	}
	_, err = s.pool.Exec(ctx,
		`INSERT INTO standalone_environments (name, description, config, updated_at)
		 VALUES ($1, $2, $3, now())
		 ON CONFLICT (name) DO UPDATE SET description = $2, config = $3, updated_at = now()`,
		env.Name, env.Description, configJSON)
	return err
}

func (s *Store) GetStandaloneEnv(ctx context.Context, name string) (*workspace.StandaloneEnvironment, error) {
	var configJSON []byte
	err := s.pool.QueryRow(ctx,
		`SELECT config FROM standalone_environments WHERE name = $1`, name).Scan(&configJSON)
	if err == pgx.ErrNoRows {
		return nil, fmt.Errorf("standalone environment %q not found", name)
	}
	if err != nil {
		return nil, err
	}
	var env workspace.StandaloneEnvironment
	if err := json.Unmarshal(configJSON, &env); err != nil {
		return nil, fmt.Errorf("unmarshaling standalone environment: %w", err)
	}
	return &env, nil
}

func (s *Store) ListStandaloneEnvs(ctx context.Context) ([]*workspace.StandaloneEnvironment, error) {
	rows, err := s.pool.Query(ctx, `SELECT config FROM standalone_environments ORDER BY name`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var envs []*workspace.StandaloneEnvironment
	for rows.Next() {
		var configJSON []byte
		if err := rows.Scan(&configJSON); err != nil {
			return nil, err
		}
		var env workspace.StandaloneEnvironment
		if err := json.Unmarshal(configJSON, &env); err != nil {
			return nil, fmt.Errorf("unmarshaling standalone environment: %w", err)
		}
		envs = append(envs, &env)
	}
	return envs, rows.Err()
}

func (s *Store) DeleteStandaloneEnv(ctx context.Context, name string) error {
	_, err := s.pool.Exec(ctx, `DELETE FROM standalone_environments WHERE name = $1`, name)
	return err
}

// --- Standalone Services ---

func (s *Store) SaveStandaloneService(ctx context.Context, svc *workspace.StandaloneService) error {
	configJSON, err := json.Marshal(svc)
	if err != nil {
		return fmt.Errorf("marshaling standalone service: %w", err)
	}
	_, err = s.pool.Exec(ctx,
		`INSERT INTO standalone_services (name, description, provider, config, updated_at)
		 VALUES ($1, $2, $3, $4, now())
		 ON CONFLICT (name) DO UPDATE SET description = $2, provider = $3, config = $4, updated_at = now()`,
		svc.Name, svc.Description, svc.Provider, configJSON)
	return err
}

func (s *Store) GetStandaloneService(ctx context.Context, name string) (*workspace.StandaloneService, error) {
	var configJSON []byte
	err := s.pool.QueryRow(ctx,
		`SELECT config FROM standalone_services WHERE name = $1`, name).Scan(&configJSON)
	if err == pgx.ErrNoRows {
		return nil, fmt.Errorf("standalone service %q not found", name)
	}
	if err != nil {
		return nil, err
	}
	var svc workspace.StandaloneService
	if err := json.Unmarshal(configJSON, &svc); err != nil {
		return nil, fmt.Errorf("unmarshaling standalone service: %w", err)
	}
	return &svc, nil
}

func (s *Store) ListStandaloneServices(ctx context.Context) ([]*workspace.StandaloneService, error) {
	rows, err := s.pool.Query(ctx, `SELECT config FROM standalone_services ORDER BY name`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var svcs []*workspace.StandaloneService
	for rows.Next() {
		var configJSON []byte
		if err := rows.Scan(&configJSON); err != nil {
			return nil, err
		}
		var svc workspace.StandaloneService
		if err := json.Unmarshal(configJSON, &svc); err != nil {
			return nil, fmt.Errorf("unmarshaling standalone service: %w", err)
		}
		svcs = append(svcs, &svc)
	}
	return svcs, rows.Err()
}

func (s *Store) DeleteStandaloneService(ctx context.Context, name string) error {
	_, err := s.pool.Exec(ctx, `DELETE FROM standalone_services WHERE name = $1`, name)
	return err
}

// --- Helpers ---

func nullIfEmpty(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}

func nullTime(t time.Time) *time.Time {
	if t.IsZero() {
		return nil
	}
	return &t
}
