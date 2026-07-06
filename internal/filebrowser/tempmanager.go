package filebrowser

import (
	"os"
	"sync"
	"time"
)

type tempEntry struct {
	path      string
	createdAt time.Time
}

type TempManager struct {
	mu      sync.Mutex
	entries map[string]*tempEntry // keyed by source path
	ttl     time.Duration
	done    chan struct{}
}

func NewTempManager(ttl time.Duration) *TempManager {
	if ttl == 0 {
		ttl = 10 * time.Minute
	}
	tm := &TempManager{
		entries: make(map[string]*tempEntry),
		ttl:     ttl,
		done:    make(chan struct{}),
	}
	go tm.cleanupLoop()
	return tm
}

func (tm *TempManager) GetOrCreate(sourceKey string, create func() (string, error)) (string, error) {
	tm.mu.Lock()
	if e, ok := tm.entries[sourceKey]; ok {
		if _, err := os.Stat(e.path); err == nil {
			e.createdAt = time.Now()
			tm.mu.Unlock()
			return e.path, nil
		}
		delete(tm.entries, sourceKey)
	}
	tm.mu.Unlock()

	path, err := create()
	if err != nil {
		return "", err
	}

	tm.mu.Lock()
	tm.entries[sourceKey] = &tempEntry{
		path:      path,
		createdAt: time.Now(),
	}
	tm.mu.Unlock()

	return path, nil
}

func (tm *TempManager) cleanupLoop() {
	ticker := time.NewTicker(1 * time.Minute)
	defer ticker.Stop()
	for {
		select {
		case <-tm.done:
			return
		case <-ticker.C:
			tm.cleanup()
		}
	}
}

func (tm *TempManager) cleanup() {
	tm.mu.Lock()
	defer tm.mu.Unlock()

	now := time.Now()
	for key, e := range tm.entries {
		if now.Sub(e.createdAt) > tm.ttl {
			os.Remove(e.path)
			delete(tm.entries, key)
		}
	}
}

func (tm *TempManager) CleanupAll() {
	close(tm.done)

	tm.mu.Lock()
	defer tm.mu.Unlock()

	for key, e := range tm.entries {
		os.Remove(e.path)
		delete(tm.entries, key)
	}
}
