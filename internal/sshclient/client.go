package sshclient

import (
	"context"
	"fmt"
	"io"
	"net"
	"os"
	"os/user"
	"path/filepath"
	"sync"
	"time"

	"golang.org/x/crypto/ssh"
)

type Config struct {
	Host       string
	User       string
	Port       string
	KeyPath    string
	PrivateKey string
	Password   string
	Passphrase string
}

// ConfigFromMap extracts an SSH Config from a provider config map.
// Handles port as both string and int (YAML may unmarshal bare numbers as int).
func ConfigFromMap(m map[string]any) Config {
	cfg := Config{}
	if v, ok := m["host"].(string); ok {
		cfg.Host = v
	}
	if v, ok := m["user"].(string); ok {
		cfg.User = v
	}
	if v, ok := m["key_path"].(string); ok {
		cfg.KeyPath = v
	}
	if v, ok := m["private_key"].(string); ok {
		cfg.PrivateKey = v
	}
	if v, ok := m["password"].(string); ok {
		cfg.Password = v
	}
	if v, ok := m["passphrase"].(string); ok {
		cfg.Passphrase = v
	}
	switch v := m["port"].(type) {
	case string:
		cfg.Port = v
	case int:
		cfg.Port = fmt.Sprintf("%d", v)
	}
	return cfg
}

type Client struct {
	config    Config
	mu        sync.Mutex
	conn      *ssh.Client
	done      chan struct{}
	closeOnce sync.Once
}

func New(config Config) *Client {
	if config.Port == "" {
		config.Port = "22"
	}
	if config.User == "" {
		if u, err := user.Current(); err == nil {
			config.User = u.Username
		}
	}
	return &Client{
		config: config,
		done:   make(chan struct{}),
	}
}

func (c *Client) Connect(ctx context.Context) error {
	auth, err := c.authMethods()
	if err != nil {
		return err
	}

	cfg := &ssh.ClientConfig{
		User:            c.config.User,
		Auth:            auth,
		HostKeyCallback: ssh.InsecureIgnoreHostKey(),
		Timeout:         10 * time.Second,
	}

	addr := net.JoinHostPort(c.config.Host, c.config.Port)

	var d net.Dialer
	netConn, err := d.DialContext(ctx, "tcp", addr)
	if err != nil {
		return fmt.Errorf("ssh dial %s: %w", addr, err)
	}

	sshConn, chans, reqs, err := ssh.NewClientConn(netConn, addr, cfg)
	if err != nil {
		netConn.Close()
		return fmt.Errorf("ssh handshake %s: %w", addr, err)
	}

	c.mu.Lock()
	c.conn = ssh.NewClient(sshConn, chans, reqs)
	c.mu.Unlock()

	go c.keepAlive()
	return nil
}

// Run executes a command and returns its combined stdout+stderr output.
func (c *Client) Run(ctx context.Context, command string) ([]byte, error) {
	sess, err := c.session()
	if err != nil {
		return nil, err
	}

	done := make(chan struct{})
	go func() {
		select {
		case <-ctx.Done():
			sess.Close()
		case <-done:
		}
	}()

	out, err := sess.CombinedOutput(command)
	close(done)
	sess.Close()

	if ctx.Err() != nil {
		return nil, ctx.Err()
	}
	return out, err
}

// Stream starts a command and returns readers for stdout and stderr.
// The caller must call cleanup when done to release the session.
// The session is also closed automatically when ctx is cancelled.
func (c *Client) Stream(ctx context.Context, command string) (stdout io.Reader, stderr io.Reader, cleanup func(), err error) {
	sess, err := c.session()
	if err != nil {
		return nil, nil, nil, err
	}

	stdoutPipe, err := sess.StdoutPipe()
	if err != nil {
		sess.Close()
		return nil, nil, nil, fmt.Errorf("ssh stdout: %w", err)
	}

	stderrPipe, err := sess.StderrPipe()
	if err != nil {
		sess.Close()
		return nil, nil, nil, fmt.Errorf("ssh stderr: %w", err)
	}

	if err := sess.Start(command); err != nil {
		sess.Close()
		return nil, nil, nil, fmt.Errorf("ssh exec: %w", err)
	}

	var once sync.Once
	closeFn := func() {
		once.Do(func() { sess.Close() })
	}

	go func() {
		<-ctx.Done()
		closeFn()
	}()

	return stdoutPipe, stderrPipe, closeFn, nil
}

func (c *Client) Close() error {
	c.mu.Lock()
	conn := c.conn
	c.conn = nil
	c.mu.Unlock()

	c.closeOnce.Do(func() { close(c.done) })

	if conn != nil {
		return conn.Close()
	}
	return nil
}

func (c *Client) session() (*ssh.Session, error) {
	c.mu.Lock()
	conn := c.conn
	c.mu.Unlock()
	if conn == nil {
		return nil, fmt.Errorf("ssh: not connected")
	}
	return conn.NewSession()
}

func (c *Client) keepAlive() {
	t := time.NewTicker(30 * time.Second)
	defer t.Stop()
	for {
		select {
		case <-t.C:
			c.mu.Lock()
			conn := c.conn
			c.mu.Unlock()
			if conn == nil {
				return
			}
			if _, _, err := conn.SendRequest("keepalive@openssh.com", true, nil); err != nil {
				return
			}
		case <-c.done:
			return
		}
	}
}

func (c *Client) authMethods() ([]ssh.AuthMethod, error) {
	var methods []ssh.AuthMethod

	if c.config.PrivateKey != "" {
		var signer ssh.Signer
		var err error
		if c.config.Passphrase != "" {
			signer, err = ssh.ParsePrivateKeyWithPassphrase([]byte(c.config.PrivateKey), []byte(c.config.Passphrase))
		} else {
			signer, err = ssh.ParsePrivateKey([]byte(c.config.PrivateKey))
		}
		if err != nil {
			return nil, fmt.Errorf("parse inline private key: %w", err)
		}
		methods = append(methods, ssh.PublicKeys(signer))
	}

	if c.config.KeyPath != "" {
		key, err := os.ReadFile(c.config.KeyPath)
		if err != nil {
			return nil, fmt.Errorf("read key %s: %w", c.config.KeyPath, err)
		}
		var signer ssh.Signer
		if c.config.Passphrase != "" {
			signer, err = ssh.ParsePrivateKeyWithPassphrase(key, []byte(c.config.Passphrase))
		} else {
			signer, err = ssh.ParsePrivateKey(key)
		}
		if err != nil {
			return nil, fmt.Errorf("parse key %s: %w", c.config.KeyPath, err)
		}
		methods = append(methods, ssh.PublicKeys(signer))
	}

	if c.config.Password != "" {
		methods = append(methods, ssh.Password(c.config.Password))
	}

	if len(methods) == 0 {
		home, err := os.UserHomeDir()
		if err == nil {
			for _, name := range []string{"id_ed25519", "id_rsa", "id_ecdsa"} {
				path := filepath.Join(home, ".ssh", name)
				keyBytes, err := os.ReadFile(path)
				if err != nil {
					continue
				}
				var signer ssh.Signer
				if c.config.Passphrase != "" {
					signer, err = ssh.ParsePrivateKeyWithPassphrase(keyBytes, []byte(c.config.Passphrase))
				} else {
					signer, err = ssh.ParsePrivateKey(keyBytes)
				}
				if err != nil {
					continue
				}
				methods = append(methods, ssh.PublicKeys(signer))
			}
		}
	}

	if len(methods) == 0 {
		return nil, fmt.Errorf("no ssh auth available (set private_key, key_path, or password)")
	}

	return methods, nil
}
