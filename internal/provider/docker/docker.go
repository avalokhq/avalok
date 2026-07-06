package docker

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
	provider.Register("docker", func() provider.Provider {
		return &Provider{}
	})
}

type Provider struct {
	containerName string
	host          string
}

func (p *Provider) Connect(_ context.Context, config map[string]any) error {
	name, ok := config["container_name"].(string)
	if !ok || name == "" {
		return fmt.Errorf("docker provider: 'container_name' config is required")
	}
	p.containerName = name

	if host, ok := config["host"].(string); ok {
		p.host = host
	}

	return nil
}

func (p *Provider) ListInstances(ctx context.Context) ([]provider.Instance, error) {
	args := p.dockerArgs("ps", "--filter", fmt.Sprintf("name=%s", p.containerName), "--format", "{{.ID}}\t{{.Names}}\t{{.Status}}")

	out, err := exec.CommandContext(ctx, "docker", args...).CombinedOutput()
	if err != nil {
		return nil, fmt.Errorf("docker ps: %w\n%s", err, strings.TrimSpace(string(out)))
	}

	var instances []provider.Instance
	for _, line := range strings.Split(strings.TrimSpace(string(out)), "\n") {
		if line == "" {
			continue
		}
		parts := strings.SplitN(line, "\t", 3)
		if len(parts) < 2 {
			continue
		}
		status := "running"
		if len(parts) >= 3 {
			status = parts[2]
		}
		instances = append(instances, provider.Instance{
			ID:     parts[0],
			Name:   parts[1],
			Status: status,
		})
	}

	if len(instances) == 0 {
		return nil, fmt.Errorf("no containers matching %q", p.containerName)
	}

	return instances, nil
}

func (p *Provider) Stream(ctx context.Context, instance string, opts provider.StreamOpts) (<-chan provider.LogEntry, error) {
	args := p.dockerArgs("logs")

	if opts.Follow {
		args = append(args, "--follow")
	}
	if opts.Tail > 0 {
		args = append(args, "--tail", fmt.Sprintf("%d", opts.Tail))
	}
	if !opts.Since.IsZero() {
		args = append(args, "--since", opts.Since.Format(time.RFC3339))
	}
	if !opts.Until.IsZero() {
		args = append(args, "--until", opts.Until.Format(time.RFC3339))
	}
	args = append(args, "--timestamps")
	args = append(args, instance)

	cmd := exec.CommandContext(ctx, "docker", args...)
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return nil, fmt.Errorf("docker logs stdout: %w", err)
	}
	stderr, err := cmd.StderrPipe()
	if err != nil {
		return nil, fmt.Errorf("docker logs stderr: %w", err)
	}

	if err := cmd.Start(); err != nil {
		return nil, fmt.Errorf("docker logs start: %w", err)
	}

	ch := make(chan provider.LogEntry, 100)

	emit := func(scanner *bufio.Scanner) {
		for scanner.Scan() {
			line := scanner.Text()
			ts, logLine := parseDockerTimestamp(line)

			select {
			case ch <- provider.LogEntry{
				Timestamp: ts,
				Source:    "docker",
				Instance:  instance,
				Line:      logLine,
				Raw:       []byte(line),
			}:
			case <-ctx.Done():
				return
			}
		}
	}

	go func() {
		defer close(ch)
		defer cmd.Wait()

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
	args := p.dockerArgs("logs", "--timestamps")

	if opts.Lines > 0 {
		args = append(args, "--tail", fmt.Sprintf("%d", opts.Lines))
	}
	if !opts.Since.IsZero() {
		args = append(args, "--since", opts.Since.Format(time.RFC3339))
	}
	if !opts.Until.IsZero() {
		args = append(args, "--until", opts.Until.Format(time.RFC3339))
	}
	args = append(args, instance)

	out, err := exec.CommandContext(ctx, "docker", args...).CombinedOutput()
	if err != nil {
		return nil, fmt.Errorf("docker logs: %w\n%s", err, strings.TrimSpace(string(out)))
	}

	var entries []provider.LogEntry
	for _, line := range strings.Split(string(out), "\n") {
		if line == "" {
			continue
		}
		ts, logLine := parseDockerTimestamp(line)
		entries = append(entries, provider.LogEntry{
			Timestamp: ts,
			Source:    "docker",
			Instance:  instance,
			Line:      logLine,
			Raw:       []byte(line),
		})
	}

	return entries, nil
}

func (p *Provider) Close() error {
	return nil
}

func (p *Provider) dockerArgs(subcmd ...string) []string {
	var args []string
	if p.host != "" {
		args = append(args, "-H", p.host)
	}
	args = append(args, subcmd...)
	return args
}

func parseDockerTimestamp(line string) (time.Time, string) {
	if len(line) > 30 && (line[4] == '-' || line[10] == 'T') {
		spaceIdx := strings.Index(line, " ")
		if spaceIdx > 0 && spaceIdx < 40 {
			ts, err := time.Parse(time.RFC3339Nano, line[:spaceIdx])
			if err == nil {
				return ts, line[spaceIdx+1:]
			}
		}
	}
	return time.Now(), line
}
