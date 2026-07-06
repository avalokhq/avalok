package self

import (
	"context"
	"time"

	"github.com/avalokhq/avalok/internal/logbuffer"
	"github.com/avalokhq/avalok/internal/provider"
)

var globalBuffer *logbuffer.Buffer

func SetBuffer(buf *logbuffer.Buffer) {
	globalBuffer = buf
}

func init() {
	provider.Register("self", func() provider.Provider {
		return &Provider{}
	})
}

type Provider struct {
	buf   *logbuffer.Buffer
	subID int
}

func (p *Provider) Connect(_ context.Context, config map[string]any) error {
	p.buf = globalBuffer
	if p.buf == nil {
		return nil
	}
	return nil
}

func (p *Provider) ListInstances(_ context.Context) ([]provider.Instance, error) {
	return []provider.Instance{
		{ID: "avalok", Name: "avalok", Status: "running"},
	}, nil
}

func (p *Provider) Stream(ctx context.Context, instance string, opts provider.StreamOpts) (<-chan provider.LogEntry, error) {
	ch := make(chan provider.LogEntry, 100)

	go func() {
		defer close(ch)

		if p.buf == nil {
			return
		}

		if opts.Tail > 0 {
			for _, e := range p.buf.Snapshot(opts.Tail) {
				select {
				case ch <- toLogEntry(e):
				case <-ctx.Done():
					return
				}
			}
		}

		if !opts.Follow {
			return
		}

		subID, sub := p.buf.Subscribe()
		defer p.buf.Unsubscribe(subID)

		for {
			select {
			case e, ok := <-sub:
				if !ok {
					return
				}
				select {
				case ch <- toLogEntry(e):
				case <-ctx.Done():
					return
				}
			case <-ctx.Done():
				return
			}
		}
	}()

	return ch, nil
}

func (p *Provider) Fetch(_ context.Context, instance string, opts provider.FetchOpts) ([]provider.LogEntry, error) {
	if p.buf == nil {
		return nil, nil
	}

	n := opts.Lines
	if n <= 0 {
		n = 100
	}

	entries := p.buf.Snapshot(n)
	result := make([]provider.LogEntry, len(entries))
	for i, e := range entries {
		result[i] = toLogEntry(e)
	}
	return result, nil
}

func (p *Provider) Close() error {
	return nil
}

func toLogEntry(e logbuffer.Entry) provider.LogEntry {
	ts := e.Time
	if ts.IsZero() {
		ts = time.Now()
	}
	return provider.LogEntry{
		Timestamp: ts,
		Source:    "avalok",
		Instance:  "avalok",
		Line:      e.Line,
		Raw:       []byte(e.Line),
	}
}
