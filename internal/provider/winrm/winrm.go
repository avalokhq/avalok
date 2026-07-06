package winrm

import (
	"bufio"
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/avalokhq/avalok/internal/provider"
	"github.com/avalokhq/avalok/internal/winrmclient"
)

func init() {
	provider.Register("winrm", func() provider.Provider {
		return &Provider{}
	})
}

type Provider struct {
	client  *winrmclient.Client
	host    string
	path    string
	command string
}

func (p *Provider) Connect(ctx context.Context, config map[string]any) error {
	host, ok := config["host"].(string)
	if !ok || host == "" {
		return fmt.Errorf("winrm provider: 'host' config is required")
	}
	p.host = host

	if v, ok := config["path"].(string); ok {
		p.path = v
	}
	if v, ok := config["command"].(string); ok {
		p.command = v
	}

	cfg := winrmclient.ConfigFromMap(config)
	p.client = winrmclient.New(cfg)
	return p.client.Connect(ctx)
}

func (p *Provider) ListInstances(_ context.Context) ([]provider.Instance, error) {
	instances := []provider.Instance{
		{
			ID:     p.host,
			Name:   p.host,
			Status: "available",
			Metadata: map[string]string{
				"type": "winrm",
			},
		},
	}

	if p.path != "" {
		instances[0].Metadata["path"] = p.path
	}
	if p.command != "" {
		instances[0].Metadata["command"] = p.command
	}

	return instances, nil
}

func (p *Provider) Stream(ctx context.Context, instance string, opts provider.StreamOpts) (<-chan provider.LogEntry, error) {
	remoteCmd := p.buildStreamCommand(opts)

	stdout, stderr, cleanup, err := p.client.Stream(ctx, remoteCmd)
	if err != nil {
		return nil, fmt.Errorf("winrm stream: %w", err)
	}

	ch := make(chan provider.LogEntry, 100)

	emit := func(scanner *bufio.Scanner) {
		for scanner.Scan() {
			line := scanner.Text()
			select {
			case ch <- provider.LogEntry{
				Timestamp: time.Now(),
				Source:    "winrm",
				Instance:  p.host,
				Line:      line,
				Raw:       []byte(line),
				Metadata: map[string]string{
					"host": p.host,
				},
			}:
			case <-ctx.Done():
				return
			}
		}
	}

	go func() {
		defer close(ch)
		defer cleanup()
		done := make(chan struct{})
		go func() {
			emit(bufio.NewScanner(stderr))
			close(done)
		}()
		emit(bufio.NewScanner(stdout))
		<-done
	}()

	return ch, nil
}

func (p *Provider) Fetch(ctx context.Context, instance string, opts provider.FetchOpts) ([]provider.LogEntry, error) {
	cmd := p.buildFetchCommand(opts)
	if cmd == "" {
		return nil, fmt.Errorf("winrm provider: neither 'path' nor 'command' configured")
	}

	out, err := p.client.Run(ctx, cmd)
	if err != nil {
		return nil, fmt.Errorf("winrm command: %w\n%s", err, string(out))
	}

	var entries []provider.LogEntry
	for _, line := range strings.Split(string(out), "\n") {
		line = strings.TrimRight(line, "\r")
		if line == "" {
			continue
		}
		entries = append(entries, provider.LogEntry{
			Timestamp: time.Now(),
			Source:    "winrm",
			Instance:  p.host,
			Line:      line,
			Raw:       []byte(line),
		})
	}

	return entries, nil
}

func (p *Provider) Close() error {
	if p.client != nil {
		return p.client.Close()
	}
	return nil
}

func escapePath(path string) string {
	return strings.ReplaceAll(path, "'", "''")
}

func (p *Provider) buildStreamCommand(opts provider.StreamOpts) string {
	if p.command != "" {
		return p.command
	}

	if p.path == "" {
		return "Write-Output 'no path or command configured'"
	}

	escaped := escapePath(p.path)

	if opts.Follow {
		if opts.Tail > 0 {
			return fmt.Sprintf("Get-Content -Path '%s' -Wait -Tail %d", escaped, opts.Tail)
		}
		return fmt.Sprintf("Get-Content -Path '%s' -Wait", escaped)
	}

	if opts.Tail > 0 {
		return fmt.Sprintf("Get-Content -Path '%s' -Tail %d", escaped, opts.Tail)
	}

	return fmt.Sprintf("Get-Content -Path '%s'", escaped)
}

func (p *Provider) buildFetchCommand(opts provider.FetchOpts) string {
	if p.command != "" {
		return p.command
	}

	if p.path == "" {
		return ""
	}

	escaped := escapePath(p.path)

	if opts.Lines > 0 {
		return fmt.Sprintf("Get-Content -Path '%s' -Tail %d", escaped, opts.Lines)
	}

	return fmt.Sprintf("Get-Content -Path '%s'", escaped)
}
