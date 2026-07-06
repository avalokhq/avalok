package token

import (
	"fmt"
	"net/http"
	"time"

	"github.com/avalokhq/avalok/internal/store"
)

type Strategy struct {
	store store.Store
}

func New(s store.Store) *Strategy {
	return &Strategy{store: s}
}

func (s *Strategy) Authenticate(r *http.Request) (*store.User, error) {
	token := r.URL.Query().Get("token")
	if token == "" {
		auth := r.Header.Get("Authorization")
		if len(auth) > 7 && auth[:7] == "Bearer " {
			token = auth[7:]
		}
	}
	if token == "" {
		return nil, fmt.Errorf("authentication required")
	}

	user, err := s.store.GetUserByToken(r.Context(), token)
	if err != nil {
		return nil, fmt.Errorf("invalid token")
	}

	if !user.IsActive() {
		return nil, fmt.Errorf("account disabled")
	}

	if !user.ExpiresAt.IsZero() && time.Now().After(user.ExpiresAt) {
		return nil, fmt.Errorf("token expired")
	}

	return user, nil
}
