package auth

import (
	"encoding/base64"
	"net/http"
	"strings"

	"github.com/avalokhq/avalok/internal/store"
)

type Strategy interface {
	Authenticate(r *http.Request) (*store.User, error)
}

// Browsers can't set headers on a WebSocket, so the web UI offers two subprotocols instead of
// putting the token in the URL (where proxies and access logs would record it):
// "avalok" and "avalok.token.<base64url token>". The server selects "avalok".
const (
	WebSocketSubprotocol      = "avalok"
	webSocketTokenProtoPrefix = "avalok.token."
)

// TokenFromRequest returns the caller's token from the Authorization header, the WebSocket
// subprotocol header, or (for non-browser clients and older links) the "token" query parameter.
func TokenFromRequest(r *http.Request) string {
	if h := r.Header.Get("Authorization"); len(h) > 7 && h[:7] == "Bearer " {
		return h[7:]
	}
	for _, proto := range strings.Split(r.Header.Get("Sec-WebSocket-Protocol"), ",") {
		if enc, ok := strings.CutPrefix(strings.TrimSpace(proto), webSocketTokenProtoPrefix); ok {
			if token, err := base64.RawURLEncoding.DecodeString(enc); err == nil {
				return string(token)
			}
		}
	}
	return r.URL.Query().Get("token")
}
