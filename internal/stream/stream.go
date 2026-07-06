package stream

import (
	"context"
	"sync"

	"github.com/avalokhq/avalok/internal/provider"
)

// Merge combines multiple log streams into a single chronological stream.
// For now this does a simple round-robin merge; a proper timestamp-based
// merge with buffering will be added when we tackle the combined view.
func Merge(ctx context.Context, sources ...<-chan provider.LogEntry) <-chan provider.LogEntry {
	out := make(chan provider.LogEntry, 100)

	go func() {
		defer close(out)

		active := make([]<-chan provider.LogEntry, len(sources))
		copy(active, sources)

		for len(active) > 0 {
			for i := 0; i < len(active); {
				select {
				case <-ctx.Done():
					return
				case entry, ok := <-active[i]:
					if !ok {
						active = append(active[:i], active[i+1:]...)
						continue
					}
					select {
					case out <- entry:
					case <-ctx.Done():
						return
					}
					i++
				}
			}
		}
	}()

	return out
}

// MergeAll combines multiple log streams using a per-source goroutine fan-in.
// Unlike Merge (round-robin), this never blocks on a slow source.
func MergeAll(ctx context.Context, sources ...<-chan provider.LogEntry) <-chan provider.LogEntry {
	out := make(chan provider.LogEntry, 100)

	var wg sync.WaitGroup
	for _, src := range sources {
		wg.Add(1)
		go func(ch <-chan provider.LogEntry) {
			defer wg.Done()
			for {
				select {
				case entry, ok := <-ch:
					if !ok {
						return
					}
					select {
					case out <- entry:
					case <-ctx.Done():
						return
					}
				case <-ctx.Done():
					return
				}
			}
		}(src)
	}

	go func() {
		wg.Wait()
		close(out)
	}()

	return out
}
