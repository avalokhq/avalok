package windowseventlog

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
	provider.Register("windows-eventlog", func() provider.Provider {
		return &Provider{}
	})
}

type Provider struct {
	channel string
	source  string
	level   string
	count   int
}

func (p *Provider) Connect(_ context.Context, config map[string]any) error {
	if v, ok := config["channel"].(string); ok {
		p.channel = v
	} else {
		p.channel = "Application"
	}
	if v, ok := config["source"].(string); ok {
		p.source = v
	}
	if v, ok := config["level"].(string); ok {
		p.level = v
	}
	if v, ok := config["count"].(int); ok {
		p.count = v
	} else {
		p.count = 100
	}

	return nil
}

func (p *Provider) ListInstances(_ context.Context) ([]provider.Instance, error) {
	return []provider.Instance{
		{
			ID:     p.channel,
			Name:   p.channel,
			Status: "available",
			Metadata: map[string]string{
				"type":    "windows-eventlog",
				"channel": p.channel,
			},
		},
	}, nil
}

func (p *Provider) Stream(ctx context.Context, instance string, opts provider.StreamOpts) (<-chan provider.LogEntry, error) {
	ch := make(chan provider.LogEntry, 100)

	go func() {
		defer close(ch)

		entries, _ := p.Fetch(ctx, instance, provider.FetchOpts{
			Lines: opts.Tail,
		})
		for _, entry := range entries {
			select {
			case ch <- entry:
			case <-ctx.Done():
				return
			}
		}

		if !opts.Follow {
			return
		}

		// Poll for new events
		lastCheck := time.Now()
		for {
			select {
			case <-ctx.Done():
				return
			case <-time.After(2 * time.Second):
				newEntries, _ := p.fetchSince(ctx, instance, lastCheck)
				lastCheck = time.Now()
				for _, entry := range newEntries {
					select {
					case ch <- entry:
					case <-ctx.Done():
						return
					}
				}
			}
		}
	}()

	return ch, nil
}

func (p *Provider) Fetch(ctx context.Context, instance string, opts provider.FetchOpts) ([]provider.LogEntry, error) {
	count := opts.Lines
	if count <= 0 {
		count = p.count
	}

	query := p.buildQuery(count, opts.Since, opts.Until)
	args := []string{"qe", p.channel, "/q:" + query, "/f:text", fmt.Sprintf("/c:%d", count)}

	out, err := exec.CommandContext(ctx, "wevtutil", args...).CombinedOutput()
	if err != nil {
		return nil, fmt.Errorf("wevtutil: %w\n%s", err, string(out))
	}

	return p.parseOutput(string(out)), nil
}

func (p *Provider) Close() error {
	return nil
}

func (p *Provider) fetchSince(ctx context.Context, instance string, since time.Time) ([]provider.LogEntry, error) {
	return p.Fetch(ctx, instance, provider.FetchOpts{
		Lines: 50,
		Since: since,
	})
}

func (p *Provider) buildQuery(count int, since, until time.Time) string {
	query := "*"
	var filters []string

	if p.source != "" {
		filters = append(filters, fmt.Sprintf("@ProviderName='%s'", p.source))
	}
	if p.level != "" {
		levelNum := parseLevelToNumber(p.level)
		if levelNum > 0 {
			filters = append(filters, fmt.Sprintf("@Level<=%d", levelNum))
		}
	}
	if !since.IsZero() {
		filters = append(filters, fmt.Sprintf("TimeCreated[@SystemTime>='%s']", since.Format(time.RFC3339)))
	}
	if !until.IsZero() {
		filters = append(filters, fmt.Sprintf("TimeCreated[@SystemTime<='%s']", until.Format(time.RFC3339)))
	}

	if len(filters) > 0 {
		query = fmt.Sprintf("*[System[%s]]", strings.Join(filters, " and "))
	}

	return query
}

func (p *Provider) parseOutput(output string) []provider.LogEntry {
	var entries []provider.LogEntry
	scanner := bufio.NewScanner(strings.NewReader(output))

	var current strings.Builder
	for scanner.Scan() {
		line := scanner.Text()
		if line == "" && current.Len() > 0 {
			entries = append(entries, provider.LogEntry{
				Timestamp: time.Now(),
				Source:    "windows-eventlog",
				Instance:  p.channel,
				Line:      strings.TrimSpace(current.String()),
				Raw:       []byte(current.String()),
			})
			current.Reset()
			continue
		}
		if current.Len() > 0 {
			current.WriteString(" | ")
		}
		current.WriteString(line)
	}

	if current.Len() > 0 {
		entries = append(entries, provider.LogEntry{
			Timestamp: time.Now(),
			Source:    "windows-eventlog",
			Instance:  p.channel,
			Line:      strings.TrimSpace(current.String()),
			Raw:       []byte(current.String()),
		})
	}

	return entries
}

func parseLevelToNumber(level string) int {
	switch strings.ToLower(level) {
	case "critical":
		return 1
	case "error":
		return 2
	case "warning":
		return 3
	case "information", "info":
		return 4
	case "verbose":
		return 5
	default:
		return 0
	}
}
