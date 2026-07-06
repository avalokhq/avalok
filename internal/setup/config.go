package setup

import (
	"fmt"
	"os"
	"strconv"
	"strings"

	"gopkg.in/yaml.v3"
)

var blockedSecrets = []string{
	"change-me-to-a-random-secret-at-least-32-chars",
	"avalok-dev-secret-change-in-production-minimum-32-chars",
}

type ServerConfig struct {
	DatabaseURL string `yaml:"database_url"`
	JWTSecret   string `yaml:"jwt_secret"`
	BindAddr    string `yaml:"bind_addr"`
	Port        int    `yaml:"port"`
}

func LoadConfig(path string) (*ServerConfig, error) {
	cfg := &ServerConfig{
		BindAddr: "0.0.0.0",
		Port:     9090,
	}

	if path != "" {
		data, err := os.ReadFile(path)
		if err != nil {
			return nil, fmt.Errorf("reading config file: %w", err)
		}
		if err := yaml.Unmarshal(data, cfg); err != nil {
			return nil, fmt.Errorf("parsing config file: %w", err)
		}
	}

	if v := os.Getenv("AVALOK_DATABASE_URL"); v != "" {
		cfg.DatabaseURL = v
	}
	if v := os.Getenv("AVALOK_JWT_SECRET"); v != "" {
		cfg.JWTSecret = v
	}
	if v := os.Getenv("AVALOK_BIND_ADDR"); v != "" {
		cfg.BindAddr = v
	}
	if v := os.Getenv("AVALOK_PORT"); v != "" {
		if p, err := strconv.Atoi(v); err == nil {
			cfg.Port = p
		}
	}

	if cfg.DatabaseURL == "" {
		return nil, fmt.Errorf("database URL is required (set AVALOK_DATABASE_URL or database_url in config)")
	}
	if cfg.JWTSecret == "" {
		return nil, fmt.Errorf("JWT secret is required (set AVALOK_JWT_SECRET or jwt_secret in config)")
	}
	if len(cfg.JWTSecret) < 32 {
		return nil, fmt.Errorf("JWT secret must be at least 32 characters")
	}
	for _, blocked := range blockedSecrets {
		if strings.EqualFold(cfg.JWTSecret, blocked) {
			return nil, fmt.Errorf("JWT secret must not be a known placeholder value — generate a random secret")
		}
	}

	return cfg, nil
}

func (c *ServerConfig) Addr() string {
	return fmt.Sprintf("%s:%d", c.BindAddr, c.Port)
}
