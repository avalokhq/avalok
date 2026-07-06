package journalctl

import (
	"bufio"
	"context"
	"fmt"
	"os/exec"
	"strings"
	"time"

	"github.com/avalokhq/avalok/internal/provider"
	"github.com/avalokhq/avalok/internal/shellutil"
	"github.com/avalokhq/avalok/internal/sshclient"
)

func init() {
	provider.Register("journalctl", func() provider.Provider {
		return &Provider{}
	})
}

type Provider struct {
	unit     string
	host     string
	priority string
	sudo     bool
	client   *sshclient.Client
}

func (p *Provider) Connect(ctx context.Context, config map[string]any) error {
	if v, ok := config["unit"].(string); ok {
		p.unit = v
	}
	if v, ok := config["priority"].(string); ok {
		p.priority = v
	}
	if v, ok := config["sudo"].(bool); ok {
		p.sudo = v
	}
	if v, ok := config["host"].(string); ok {
		p.host = v
	}

	if p.host != "" {
		cfg := sshclient.ConfigFromMap(config)
		p.client = sshclient.New(cfg)
		return p.client.Connect(ctx)
	}

	return nil
}

func (p *Provider) ListInstances(_ context.Context) ([]provider.Instance, error) {
	name := p.unit
	if name == "" {
		name = "system"
	}
	location := "local"
	if p.host != "" {
		location = p.host
	}

	return []provider.Instance{
		{
			ID:     fmt.Sprintf("%s@%s", name, location),
			Name:   name,
			Status: "available",
			Metadata: map[string]string{
				"unit":     p.unit,
				"location": location,
			},
		},
	}, nil
}

func (p *Provider) Stream(ctx context.Context, instance string, opts provider.StreamOpts) (<-chan provider.LogEntry, error) {
	journalArgs := p.buildJournalctlArgs(opts)

	instanceName := p.unit
	if instanceName == "" {
		instanceName = "system"
	}

	ch := make(chan provider.LogEntry, 100)

	if p.client != nil {
		remoteCmd := p.journalctlCommand(journalArgs)
		stdout, _, cleanup, err := p.client.Stream(ctx, remoteCmd)
		if err != nil {
			return nil, fmt.Errorf("journalctl stream: %w", err)
		}

		go func() {
			defer close(ch)
			defer cleanup()

			scanner := bufio.NewScanner(stdout)
			for scanner.Scan() {
				line := scanner.Text()
				select {
				case ch <- provider.LogEntry{
					Timestamp: time.Now(),
					Source:    "journalctl",
					Instance:  instanceName,
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

	cmd := p.localCommand(ctx, journalArgs)
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return nil, fmt.Errorf("journalctl stdout: %w", err)
	}

	if err := cmd.Start(); err != nil {
		return nil, fmt.Errorf("journalctl start: %w", err)
	}

	go func() {
		defer close(ch)
		defer cmd.Wait()

		scanner := bufio.NewScanner(stdout)
		for scanner.Scan() {
			line := scanner.Text()
			select {
			case ch <- provider.LogEntry{
				Timestamp: time.Now(),
				Source:    "journalctl",
				Instance:  instanceName,
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
	journalArgs := []string{"--no-pager", "-o", "short-iso"}
	if p.unit != "" {
		journalArgs = append(journalArgs, "-u", p.unit)
	}
	if p.priority != "" {
		journalArgs = append(journalArgs, "-p", p.priority)
	}
	if opts.Lines > 0 {
		journalArgs = append(journalArgs, "-n", fmt.Sprintf("%d", opts.Lines))
	}
	if !opts.Since.IsZero() {
		journalArgs = append(journalArgs, "--since", opts.Since.Format("2006-01-02 15:04:05"))
	}
	if !opts.Until.IsZero() {
		journalArgs = append(journalArgs, "--until", opts.Until.Format("2006-01-02 15:04:05"))
	}

	var out []byte
	var err error

	if p.client != nil {
		remoteCmd := p.journalctlCommand(journalArgs)
		out, err = p.client.Run(ctx, remoteCmd)
	} else {
		cmd := p.localCommand(ctx, journalArgs)
		out, err = cmd.CombinedOutput()
	}

	if err != nil {
		return nil, fmt.Errorf("journalctl: %w\n%s", err, string(out))
	}

	instanceName := p.unit
	if instanceName == "" {
		instanceName = "system"
	}

	var entries []provider.LogEntry
	for _, line := range strings.Split(string(out), "\n") {
		if line == "" {
			continue
		}
		entries = append(entries, provider.LogEntry{
			Timestamp: time.Now(),
			Source:    "journalctl",
			Instance:  instanceName,
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

func (p *Provider) buildJournalctlArgs(opts provider.StreamOpts) []string {
	args := []string{"--no-pager", "-o", "short-iso"}
	if p.unit != "" {
		args = append(args, "-u", p.unit)
	}
	if p.priority != "" {
		args = append(args, "-p", p.priority)
	}
	if opts.Follow {
		args = append(args, "-f")
	}
	if opts.Tail > 0 {
		args = append(args, "-n", fmt.Sprintf("%d", opts.Tail))
	}
	if !opts.Since.IsZero() {
		args = append(args, "--since", opts.Since.Format("2006-01-02 15:04:05"))
	}
	return args
}

func (p *Provider) journalctlCommand(args []string) string {
	bin := "journalctl"
	if p.sudo {
		bin = "sudo journalctl"
	}
	quoted := make([]string, len(args))
	for i, a := range args {
		quoted[i] = shellutil.Quote(a)
	}
	return bin + " " + strings.Join(quoted, " ")
}

func (p *Provider) localCommand(ctx context.Context, args []string) *exec.Cmd {
	if p.sudo {
		sudoArgs := append([]string{"journalctl"}, args...)
		return exec.CommandContext(ctx, "sudo", sudoArgs...)
	}
	return exec.CommandContext(ctx, "journalctl", args...)
}
