package winrmclient

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"strconv"
	"sync"
	"time"

	"github.com/masterzen/winrm"
)

type Config struct {
	Host     string
	User     string
	Password string
	Port     string
	UseHTTPS bool
	Insecure bool
}

func ConfigFromMap(m map[string]any) Config {
	cfg := Config{}
	if v, ok := m["host"].(string); ok {
		cfg.Host = v
	}
	if v, ok := m["user"].(string); ok {
		cfg.User = v
	}
	if v, ok := m["password"].(string); ok {
		cfg.Password = v
	}
	switch v := m["port"].(type) {
	case string:
		cfg.Port = v
	case int:
		cfg.Port = fmt.Sprintf("%d", v)
	}
	if v, ok := m["use_https"].(bool); ok {
		cfg.UseHTTPS = v
	}
	if v, ok := m["insecure"].(bool); ok {
		cfg.Insecure = v
	}
	return cfg
}

type Client struct {
	config    Config
	mu        sync.Mutex
	client    *winrm.Client
	done      chan struct{}
	closeOnce sync.Once
}

func New(config Config) *Client {
	if config.Port == "" {
		if config.UseHTTPS {
			config.Port = "5986"
		} else {
			config.Port = "5985"
		}
	}
	return &Client{
		config: config,
		done:   make(chan struct{}),
	}
}

func (c *Client) Connect(_ context.Context) error {
	port, err := strconv.Atoi(c.config.Port)
	if err != nil {
		return fmt.Errorf("winrm: invalid port %q: %w", c.config.Port, err)
	}

	endpoint := winrm.NewEndpoint(
		c.config.Host,
		port,
		c.config.UseHTTPS,
		c.config.Insecure,
		nil, nil, nil,
		10*time.Second,
	)

	client, err := winrm.NewClient(endpoint, c.config.User, c.config.Password)
	if err != nil {
		return fmt.Errorf("winrm client %s:%d: %w", c.config.Host, port, err)
	}

	c.mu.Lock()
	c.client = client
	c.mu.Unlock()

	return nil
}

func (c *Client) Run(ctx context.Context, command string) ([]byte, error) {
	c.mu.Lock()
	client := c.client
	c.mu.Unlock()
	if client == nil {
		return nil, fmt.Errorf("winrm: not connected")
	}

	var stdout, stderr bytes.Buffer
	_, err := client.RunWithContext(ctx, winrm.Powershell(command), &stdout, &stderr)
	if err != nil {
		combined := stdout.String() + stderr.String()
		return []byte(combined), fmt.Errorf("winrm run: %w", err)
	}

	out := stdout.Bytes()
	if stderr.Len() > 0 {
		out = append(out, stderr.Bytes()...)
	}
	return out, nil
}

func (c *Client) Stream(ctx context.Context, command string) (stdout io.Reader, stderr io.Reader, cleanup func(), err error) {
	c.mu.Lock()
	client := c.client
	c.mu.Unlock()
	if client == nil {
		return nil, nil, nil, fmt.Errorf("winrm: not connected")
	}

	shell, err := client.CreateShell()
	if err != nil {
		return nil, nil, nil, fmt.Errorf("winrm create shell: %w", err)
	}

	cmd, err := shell.ExecuteWithContext(ctx, winrm.Powershell(command))
	if err != nil {
		shell.Close()
		return nil, nil, nil, fmt.Errorf("winrm execute: %w", err)
	}

	var once sync.Once
	closeFn := func() {
		once.Do(func() {
			cmd.Close()
			shell.Close()
		})
	}

	go func() {
		<-ctx.Done()
		closeFn()
	}()

	return cmd.Stdout, cmd.Stderr, closeFn, nil
}

func (c *Client) Close() error {
	c.mu.Lock()
	c.client = nil
	c.mu.Unlock()

	c.closeOnce.Do(func() { close(c.done) })
	return nil
}
