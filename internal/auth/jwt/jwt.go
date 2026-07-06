package jwt

import (
	"fmt"
	"net/http"
	"time"

	gojwt "github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"

	"github.com/avalokhq/avalok/internal/store"
)

type Config struct {
	Secret     string
	Expiration time.Duration
	Issuer     string
}

type Claims struct {
	gojwt.RegisteredClaims
	UserID   string   `json:"uid"`
	Username string   `json:"usr"`
	Role     string   `json:"role"`
	Scope    []string `json:"scope,omitempty"`
}

type Manager struct {
	config Config
	store  store.Store
}

func New(config Config, s store.Store) *Manager {
	if config.Expiration == 0 {
		config.Expiration = 24 * time.Hour
	}
	if config.Issuer == "" {
		config.Issuer = "avalok"
	}
	return &Manager{config: config, store: s}
}

func (m *Manager) Generate(user *store.User) (string, string, error) {
	jti := uuid.New().String()
	now := time.Now()
	claims := Claims{
		RegisteredClaims: gojwt.RegisteredClaims{
			ID:        jti,
			Issuer:    m.config.Issuer,
			Subject:   user.ID,
			IssuedAt:  gojwt.NewNumericDate(now),
			ExpiresAt: gojwt.NewNumericDate(now.Add(m.config.Expiration)),
		},
		UserID:   user.ID,
		Username: user.Username,
		Role:     user.Role,
		Scope:    user.Scope,
	}

	token := gojwt.NewWithClaims(gojwt.SigningMethodHS256, claims)
	signed, err := token.SignedString([]byte(m.config.Secret))
	if err != nil {
		return "", "", fmt.Errorf("signing token: %w", err)
	}
	return signed, jti, nil
}

func (m *Manager) Validate(tokenString string) (*Claims, error) {
	token, err := gojwt.ParseWithClaims(tokenString, &Claims{}, func(t *gojwt.Token) (any, error) {
		if _, ok := t.Method.(*gojwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", t.Header["alg"])
		}
		return []byte(m.config.Secret), nil
	})
	if err != nil {
		return nil, fmt.Errorf("parsing token: %w", err)
	}

	claims, ok := token.Claims.(*Claims)
	if !ok || !token.Valid {
		return nil, fmt.Errorf("invalid token claims")
	}
	return claims, nil
}

func (m *Manager) Authenticate(r *http.Request) (*store.User, error) {
	tokenString := extractToken(r)
	if tokenString == "" {
		return nil, fmt.Errorf("authentication required")
	}

	claims, err := m.Validate(tokenString)
	if err != nil {
		return nil, fmt.Errorf("invalid token")
	}

	sess, err := m.store.GetSession(r.Context(), claims.ID)
	if err != nil {
		return nil, fmt.Errorf("session revoked")
	}
	if time.Now().After(sess.ExpiresAt) {
		return nil, fmt.Errorf("session expired")
	}

	user, err := m.store.GetUser(r.Context(), claims.UserID)
	if err != nil {
		return nil, fmt.Errorf("user not found")
	}

	if !user.IsActive() {
		return nil, fmt.Errorf("account disabled")
	}

	if !user.ExpiresAt.IsZero() && time.Now().After(user.ExpiresAt) {
		return nil, fmt.Errorf("account expired")
	}

	return user, nil
}

func (m *Manager) Expiration() time.Duration {
	return m.config.Expiration
}

func extractToken(r *http.Request) string {
	if token := r.URL.Query().Get("token"); token != "" {
		return token
	}
	auth := r.Header.Get("Authorization")
	if len(auth) > 7 && auth[:7] == "Bearer " {
		return auth[7:]
	}
	return ""
}
