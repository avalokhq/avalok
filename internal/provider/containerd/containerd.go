package containerd

import (
	"bufio"
	"context"
	"fmt"
	"os/exec"
	"strings"
	"time"

	"github.com/avalokhq/avalok/internal/provider"
)

func init() {
	provider.Register("containerd", func() provider.Provider {
		return &Provider{}
	})
}

type Provider struct {
	containerName string
	namespace     string
	socket        string
}

func (p *Provider) Connect(_ context.Context, config map[string]any) error {
	name, ok := config["container_name"].(string)
	if !ok || name == "" {
		return fmt.Errorf("containerd provider: 'container_name' config is required")
	}
	p.containerName = name

	if v, ok := config["namespace"].(string); ok {
		p.namespace = v
	} else {
		p.namespace = "k8s.io"
	}
	if v, ok := config["socket"].(string); ok {
		p.socket = v
	}

	return nil
}

func (p *Provider) ListInstances(ctx context.Context) ([]provider.Instance, error) {
	args := p.crictlArgs("ps", "--name", p.containerName, "-o", "json")
	out, err := exec.CommandContext(ctx, "crictl", args...).CombinedOutput()
	if err != nil {
		// Fall back to simple listing
		return []provider.Instance{
			{
				ID:     p.containerName,
				Name:   p.containerName,
				Status: "available",
			},
		}, nil
	}

	_ = out
	return []provider.Instance{
		{
			ID:     p.containerName,
			Name:   p.containerName,
			Status: "available",
		},
	}, nil
}

func (p *Provider) Stream(ctx context.Context, instance string, opts provider.StreamOpts) (<-chan provider.LogEntry, error) {
	args := p.crictlArgs("logs")
	if opts.Follow {
		args = append(args, "-f")
	}
	if opts.Tail > 0 {
		args = append(args, "--tail", fmt.Sprintf("%d", opts.Tail))
	}
	if !opts.Since.IsZero() {
		args = append(args, "--since", opts.Since.Format(time.RFC3339))
	}
	args = append(args, "--timestamps")
	args = append(args, instance)

	cmd := exec.CommandContext(ctx, "crictl", args...)
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return nil, fmt.Errorf("crictl logs stdout: %w", err)
	}

	if err := cmd.Start(); err != nil {
		return nil, fmt.Errorf("crictl logs start: %w", err)
	}

	ch := make(chan provider.LogEntry, 100)

	go func() {
		defer close(ch)
		defer cmd.Wait()

		scanner := bufio.NewScanner(stdout)
		for scanner.Scan() {
			line := scanner.Text()
			select {
			case ch <- provider.LogEntry{
				Timestamp: time.Now(),
				Source:    "containerd",
				Instance:  instance,
				Line:      line,
				Raw:       []byte(line),
			}:
			case <-ctx.Done():
				return
			}
		}
	}()

	return ch, nil
}

func (p *Provider) Fetch(ctx context.Context, instance string, opts provider.FetchOpts) ([]provider.LogEntry, error) {
	args := p.crictlArgs("logs", "--timestamps")
	if opts.Lines > 0 {
		args = append(args, "--tail", fmt.Sprintf("%d", opts.Lines))
	}
	args = append(args, instance)

	out, err := exec.CommandContext(ctx, "crictl", args...).CombinedOutput()
	if err != nil {
		return nil, fmt.Errorf("crictl logs: %w\n%s", err, string(out))
	}

	var entries []provider.LogEntry
	for _, line := range strings.Split(string(out), "\n") {
		if line == "" {
			continue
		}
		entries = append(entries, provider.LogEntry{
			Timestamp: time.Now(),
			Source:    "containerd",
			Instance:  instance,
			Line:      line,
			Raw:       []byte(line),
		})
	}

	return entries, nil
}

func (p *Provider) Close() error {
	return nil
}

func (p *Provider) crictlArgs(args ...string) []string {
	var result []string
	if p.socket != "" {
		result = append(result, "--runtime-endpoint", p.socket)
	}
	result = append(result, args...)
	return result
}
