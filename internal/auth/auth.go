package auth

import (
	"net/http"

	"github.com/avalokhq/avalok/internal/store"
)

type Strategy interface {
	Authenticate(r *http.Request) (*store.User, error)
}
