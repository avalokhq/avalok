package file

import (
	"bufio"
	"context"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/avalokhq/avalok/internal/provider"
)

func init() {
	provider.Register("file", func() provider.Provider {
		return &Provider{}
	})
}

type Provider struct {
	paths   []string
	readAll bool
}

func (p *Provider) Connect(_ context.Context, config map[string]any) error {
	pattern, ok := config["path"].(string)
	if !ok || pattern == "" {
		return fmt.Errorf("file provider: 'path' config is required")
	}

	matches, err := filepath.Glob(pattern)
	if err != nil {
		return fmt.Errorf("file provider: invalid glob pattern %q: %w", pattern, err)
	}
	if len(matches) == 0 {
		return fmt.Errorf("file provider: no files match pattern %q", pattern)
	}

	p.paths = matches

	if v, ok := config["read_all"].(bool); ok {
		p.readAll = v
	}

	return nil
}

func (p *Provider) ListInstances(_ context.Context) ([]provider.Instance, error) {
	instances := make([]provider.Instance, len(p.paths))
	for i, path := range p.paths {
		instances[i] = provider.Instance{
			ID:   path,
			Name: filepath.Base(path),
			Status: "available",
		}
	}
	return instances, nil
}

func (p *Provider) Stream(ctx context.Context, instance string, opts provider.StreamOpts) (<-chan provider.LogEntry, error) {
	path := p.resolvePath(instance)
	if path == "" {
		return nil, fmt.Errorf("file provider: instance %q not found", instance)
	}

	ch := make(chan provider.LogEntry, 100)

	go func() {
		defer close(ch)
		p.streamFile(ctx, path, opts, ch)
	}()

	return ch, nil
}

func (p *Provider) Fetch(_ context.Context, instance string, opts provider.FetchOpts) ([]provider.LogEntry, error) {
	path := p.resolvePath(instance)
	if path == "" {
		return nil, fmt.Errorf("file provider: instance %q not found", instance)
	}

	f, err := os.Open(path)
	if err != nil {
		return nil, fmt.Errorf("file provider: opening %q: %w", path, err)
	}
	defer f.Close()

	var entries []provider.LogEntry
	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		line := scanner.Text()
		entries = append(entries, provider.LogEntry{
			Timestamp: time.Now(),
			Source:    "file",
			Instance:  filepath.Base(path),
			Line:      line,
			Raw:       []byte(line),
		})
		if opts.Lines > 0 && len(entries) >= opts.Lines {
			break
		}
	}

	return entries, scanner.Err()
}

func (p *Provider) Close() error {
	return nil
}

func (p *Provider) resolvePath(instance string) string {
	for _, path := range p.paths {
		if path == instance || filepath.Base(path) == instance {
			return path
		}
	}
	return ""
}

func (p *Provider) streamFile(ctx context.Context, path string, opts provider.StreamOpts, ch chan<- provider.LogEntry) {
	f, err := os.Open(path)
	if err != nil {
		return
	}
	defer f.Close()

	if !p.readAll && opts.Tail > 0 {
		seekToLastNLines(f, opts.Tail)
	}

	baseName := filepath.Base(path)

	if stat, _ := f.Stat(); stat != nil && stat.Size() == 0 {
		select {
		case ch <- provider.LogEntry{
			Timestamp: time.Now(),
			Source:    "file",
			Instance:  baseName,
			Line:      "[info] log file is empty, waiting for new logs",
			Metadata:  map[string]string{"info": "true"},
		}:
		case <-ctx.Done():
			return
		}
	}

	reader := bufio.NewReader(f)

	for {
		select {
		case <-ctx.Done():
			return
		default:
		}

		line, err := reader.ReadString('\n')
		if err != nil {
			if err == io.EOF {
				if !opts.Follow {
					return
				}
				time.Sleep(100 * time.Millisecond)
				continue
			}
			return
		}

		line = strings.TrimRight(line, "\r\n")

		ch <- provider.LogEntry{
			Timestamp: time.Now(),
			Source:    "file",
			Instance:  baseName,
			Line:      line,
			Raw:       []byte(line),
		}
	}
}

func seekToLastNLines(f *os.File, n int) {
	stat, err := f.Stat()
	if err != nil || stat.Size() == 0 {
		return
	}

	buf := make([]byte, 1)
	count := 0
	offset := stat.Size() - 1

	for offset > 0 {
		offset--
		if _, err := f.Seek(offset, io.SeekStart); err != nil {
			break
		}
		if _, err := f.Read(buf); err != nil {
			break
		}
		if buf[0] == '\n' {
			count++
			if count > n {
				f.Seek(offset+1, io.SeekStart)
				return
			}
		}
	}

	f.Seek(0, io.SeekStart)
}
