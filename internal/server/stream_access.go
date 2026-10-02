package server

import (
	"context"
	"net/http"
	"time"

	"github.com/coder/websocket"

	"github.com/avalokhq/avalok/internal/auth"
	"github.com/avalokhq/avalok/internal/store"
)

// accessRecheckInterval is how often a long-lived log stream re-verifies its caller.
const accessRecheckInterval = 30 * time.Second

type accessCheckKey struct{}

// accessCheck re-evaluates whether a freshly loaded user may still read a stream.
type accessCheck func(ctx context.Context, u *store.User) bool

// withAccessCheck records a stream's authorization rule so watchAccess can re-apply it.
func withAccessCheck(r *http.Request, check accessCheck) *http.Request {
	return r.WithContext(context.WithValue(r.Context(), accessCheckKey{}, check))
}

// acceptStreamSocket upgrades a log stream to a WebSocket, selecting the subprotocol the web UI
// uses to send its token (see auth.TokenFromRequest).
func (s *Server) acceptStreamSocket(w http.ResponseWriter, r *http.Request) (*websocket.Conn, error) {
	return websocket.Accept(w, r, &websocket.AcceptOptions{
		OriginPatterns: s.originPatterns(),
		Subprotocols:   []string{auth.WebSocketSubprotocol},
	})
}

// revokeSocket closes a stream socket with a policy-violation status so the client can tell
// "access revoked" apart from a dropped connection, then stops the stream.
func revokeSocket(conn *websocket.Conn, cancel context.CancelFunc) func() {
	return func() {
		conn.Close(websocket.StatusPolicyViolation, "access revoked")
		cancel()
	}
}

// watchAccess re-authenticates a long-lived stream every accessRecheckInterval and calls revoke
// once the session is gone, the account is disabled or expired, or the rule recorded with
// withAccessCheck no longer passes (scope narrowed, section switched off). Without it, access
// would only be checked when the stream opens.
func (s *Server) watchAccess(ctx context.Context, r *http.Request, revoke func()) {
	check, _ := r.Context().Value(accessCheckKey{}).(accessCheck)
	go func() {
		ticker := time.NewTicker(accessRecheckInterval)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				user, err := s.auth.Authenticate(r)
				if err == nil && (check == nil || check(ctx, user)) {
					continue
				}
				logger.Info("closing stream: access revoked", "path", r.URL.Path)
				revoke()
				return
			}
		}
	}()
}
