package ssh

import (
	"bufio"
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/avalokhq/avalok/internal/provider"
	"github.com/avalokhq/avalok/internal/shellutil"
	"github.com/avalokhq/avalok/internal/sshclient"
)

func init() {
	provider.Register("ssh", func() provider.Provider {
		return &Provider{}
	})
}

type Provider struct {
	client  *sshclient.Client
	host    string
	path    string
	command string
	sudo    bool
}

func (p *Provider) Connect(ctx context.Context, config map[string]any) error {
	host, ok := config["host"].(string)
	if !ok || host == "" {
		return fmt.Errorf("ssh provider: 'host' config is required")
	}
	p.host = host

	if v, ok := config["path"].(string); ok {
		p.path = v
	}
	if v, ok := config["command"].(string); ok {
		p.command = v
	}
	if v, ok := config["sudo"].(bool); ok {
		p.sudo = v
	}

	cfg := sshclient.ConfigFromMap(config)
	p.client = sshclient.New(cfg)
	return p.client.Connect(ctx)
}

func (p *Provider) ListInstances(_ context.Context) ([]provider.Instance, error) {
	instances := []provider.Instance{
		{
			ID:     p.host,
			Name:   p.host,
			Status: "available",
			Metadata: map[string]string{
				"type": "ssh",
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
	remoteCmd := p.buildRemoteCommand(opts)

	stdout, stderr, cleanup, err := p.client.Stream(ctx, remoteCmd)
	if err != nil {
		return nil, fmt.Errorf("ssh stream: %w", err)
	}

	ch := make(chan provider.LogEntry, 100)

	emit := func(scanner *bufio.Scanner) {
		for scanner.Scan() {
			line := scanner.Text()
			select {
			case ch <- provider.LogEntry{
				Timestamp: time.Now(),
				Source:    "ssh",
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
	var remoteCmd string
	if p.command != "" {
		remoteCmd = p.maybeSudo(p.command)
	} else if p.path != "" {
		quoted := shellutil.Quote(p.path)
		if opts.Lines > 0 {
			remoteCmd = p.maybeSudo(fmt.Sprintf("tail -n %d %s", opts.Lines, quoted))
		} else {
			remoteCmd = p.maybeSudo(fmt.Sprintf("cat %s", quoted))
		}
	} else {
		return nil, fmt.Errorf("ssh provider: neither 'path' nor 'command' configured")
	}

	out, err := p.client.Run(ctx, remoteCmd)
	if err != nil {
		return nil, fmt.Errorf("ssh command: %w\n%s", err, string(out))
	}

	var entries []provider.LogEntry
	for _, line := range strings.Split(string(out), "\n") {
		if line == "" {
			continue
		}
		entries = append(entries, provider.LogEntry{
			Timestamp: time.Now(),
			Source:    "ssh",
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

func (p *Provider) maybeSudo(cmd string) string {
	if p.sudo {
		return "sudo " + cmd
	}
	return cmd
}

func (p *Provider) buildRemoteCommand(opts provider.StreamOpts) string {
	var cmd string

	if p.command != "" {
		cmd = p.maybeSudo(p.command)
	} else if p.path != "" {
		quoted := shellutil.Quote(p.path)
		if opts.Follow {
			if opts.Tail > 0 {
				cmd = fmt.Sprintf("tail -n %d -f %s", opts.Tail, quoted)
			} else {
				cmd = fmt.Sprintf("tail -f %s", quoted)
			}
		} else if opts.Tail > 0 {
			cmd = fmt.Sprintf("tail -n %d %s", opts.Tail, quoted)
		} else {
			cmd = fmt.Sprintf("cat %s", quoted)
		}
		cmd = p.maybeSudo(cmd)
	} else {
		return "echo 'no path or command configured'"
	}

	if !strings.HasSuffix(cmd, "2>&1") {
		cmd += " 2>&1"
	}
	return cmd
}
