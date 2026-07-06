package iis

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strings"

	"github.com/avalokhq/avalok/internal/provider"
)

func init() {
	provider.Register("iis", func() provider.Provider {
		return &Provider{}
	})
}

type Provider struct {
	site   string
	logDir string
	inner  provider.Provider
}

func (p *Provider) Connect(ctx context.Context, config map[string]any) error {
	if v, ok := config["site"].(string); ok {
		p.site = v
	}
	if v, ok := config["log_dir"].(string); ok {
		p.logDir = v
	}

	if p.logDir == "" {
		p.logDir = defaultIISLogDir()
	}

	pattern := filepath.Join(p.logDir, "*.log")
	if p.site != "" {
		siteDir := findSiteLogDir(p.logDir, p.site)
		if siteDir != "" {
			pattern = filepath.Join(siteDir, "*.log")
		}
	}

	fileProvider, _ := provider.Get("file")
	p.inner = fileProvider
	return p.inner.Connect(ctx, map[string]any{"path": pattern})
}

func (p *Provider) ListInstances(ctx context.Context) ([]provider.Instance, error) {
	instances, err := p.inner.ListInstances(ctx)
	if err != nil {
		return nil, err
	}
	for i := range instances {
		if instances[i].Metadata == nil {
			instances[i].Metadata = map[string]string{}
		}
		instances[i].Metadata["type"] = "iis"
		if p.site != "" {
			instances[i].Metadata["site"] = p.site
		}
	}
	return instances, nil
}

func (p *Provider) Stream(ctx context.Context, instance string, opts provider.StreamOpts) (<-chan provider.LogEntry, error) {
	ch, err := p.inner.Stream(ctx, instance, opts)
	if err != nil {
		return nil, err
	}

	out := make(chan provider.LogEntry, 100)
	go func() {
		defer close(out)
		for entry := range ch {
			entry.Source = "iis"
			select {
			case out <- entry:
			case <-ctx.Done():
				return
			}
		}
	}()

	return out, nil
}

func (p *Provider) Fetch(ctx context.Context, instance string, opts provider.FetchOpts) ([]provider.LogEntry, error) {
	entries, err := p.inner.Fetch(ctx, instance, opts)
	if err != nil {
		return nil, err
	}
	for i := range entries {
		entries[i].Source = "iis"
	}
	return entries, nil
}

func (p *Provider) Close() error {
	if p.inner != nil {
		return p.inner.Close()
	}
	return nil
}

func defaultIISLogDir() string {
	if runtime.GOOS == "windows" {
		systemDrive := os.Getenv("SystemDrive")
		if systemDrive == "" {
			systemDrive = "C:"
		}
		return filepath.Join(systemDrive, "inetpub", "logs", "LogFiles")
	}
	return "/var/log/iis"
}

func findSiteLogDir(baseDir, site string) string {
	entries, err := os.ReadDir(baseDir)
	if err != nil {
		return ""
	}
	siteLower := strings.ToLower(site)
	for _, e := range entries {
		if e.IsDir() && strings.Contains(strings.ToLower(e.Name()), siteLower) {
			return filepath.Join(baseDir, e.Name())
		}
	}

	pattern := fmt.Sprintf("W3SVC*")
	for _, e := range entries {
		if e.IsDir() {
			matched, _ := filepath.Match(pattern, e.Name())
			if matched {
				return filepath.Join(baseDir, e.Name())
			}
		}
	}

	return ""
}
