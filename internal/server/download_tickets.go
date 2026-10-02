package server

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/avalokhq/avalok/internal/auth"
)

// downloadTicketTTL bounds how long a download link stays usable.
const downloadTicketTTL = time.Minute

// downloadTicket lets a plain browser download (an <a href>, which can't send headers) act as
// the caller for exactly one API path, once, without putting their session token in the URL.
type downloadTicket struct {
	token   string
	path    string
	expires time.Time
}

type ticketStore struct {
	mu      sync.Mutex
	tickets map[string]downloadTicket
}

func (t *ticketStore) issue(token, path string) (string, error) {
	buf := make([]byte, 32)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	id := hex.EncodeToString(buf)

	t.mu.Lock()
	defer t.mu.Unlock()
	if t.tickets == nil {
		t.tickets = make(map[string]downloadTicket)
	}
	now := time.Now()
	for k, v := range t.tickets {
		if now.After(v.expires) {
			delete(t.tickets, k)
		}
	}
	t.tickets[id] = downloadTicket{token: token, path: path, expires: now.Add(downloadTicketTTL)}
	return id, nil
}

// redeem consumes a ticket and returns the token it stands for if it is unexpired and was
// issued for this path.
func (t *ticketStore) redeem(id, path string) (string, bool) {
	t.mu.Lock()
	defer t.mu.Unlock()
	tk, ok := t.tickets[id]
	delete(t.tickets, id)
	if !ok || tk.path != path || time.Now().After(tk.expires) {
		return "", false
	}
	return tk.token, true
}

func (s *Server) handleCreateDownloadTicket(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Path string `json:"path"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	u, err := url.Parse(req.Path)
	if err != nil || u.IsAbs() || !strings.HasPrefix(u.Path, "/api/") {
		writeError(w, http.StatusBadRequest, "path must be an /api/ path")
		return
	}
	id, err := s.tickets.issue(auth.TokenFromRequest(r), u.Path)
	if err != nil {
		writeInternalError(w, "issuing download ticket", err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"ticket": id})
}
