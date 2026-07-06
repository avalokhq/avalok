package provider

import (
	"context"
	"time"
)

type LogEntry struct {
	Timestamp time.Time
	Source    string
	Instance string
	Line     string
	Raw      []byte
	Metadata map[string]string
}

type Instance struct {
	ID       string
	Name     string
	Status   string
	Metadata map[string]string
}

type StreamOpts struct {
	Follow bool
	Tail   int
	Since  time.Time
	Until  time.Time
}

type FetchOpts struct {
	Lines int
	Since time.Time
	Until time.Time
}

type Provider interface {
	Connect(ctx context.Context, config map[string]any) error
	ListInstances(ctx context.Context) ([]Instance, error)
	Stream(ctx context.Context, instance string, opts StreamOpts) (<-chan LogEntry, error)
	Fetch(ctx context.Context, instance string, opts FetchOpts) ([]LogEntry, error)
	Close() error
}

type Factory func() Provider

var registry = map[string]Factory{}

func Register(name string, factory Factory) {
	registry[name] = factory
}

func Get(name string) (Provider, bool) {
	f, ok := registry[name]
	if !ok {
		return nil, false
	}
	return f(), true
}

func Available() []string {
	names := make([]string, 0, len(registry))
	for name := range registry {
		names = append(names, name)
	}
	return names
}
