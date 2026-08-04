package cli

import (
	"bufio"
	"context"
	"fmt"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"syscall"
	"time"

	"golang.org/x/term"

	"github.com/google/uuid"
	"github.com/joho/godotenv"
	"github.com/spf13/cobra"
	"golang.org/x/crypto/bcrypt"

	jwtauth "github.com/avalokhq/avalok/internal/auth/jwt"
	"github.com/avalokhq/avalok/internal/credential/managed"
	"github.com/avalokhq/avalok/internal/logbuffer"
	_ "github.com/avalokhq/avalok/internal/provider/azureblob"
	_ "github.com/avalokhq/avalok/internal/provider/azurefile"
	_ "github.com/avalokhq/avalok/internal/provider/containerd"
	_ "github.com/avalokhq/avalok/internal/provider/docker"
	_ "github.com/avalokhq/avalok/internal/provider/file"
	_ "github.com/avalokhq/avalok/internal/provider/gcs"
	_ "github.com/avalokhq/avalok/internal/provider/iis"
	_ "github.com/avalokhq/avalok/internal/provider/journalctl"
	_ "github.com/avalokhq/avalok/internal/provider/kubernetes"
	_ "github.com/avalokhq/avalok/internal/provider/s3"
	selfprovider "github.com/avalokhq/avalok/internal/provider/self"
	_ "github.com/avalokhq/avalok/internal/provider/ssh"
	_ "github.com/avalokhq/avalok/internal/provider/windowseventlog"
	_ "github.com/avalokhq/avalok/internal/provider/winrm"
	"github.com/avalokhq/avalok/internal/server"
	"github.com/avalokhq/avalok/internal/setup"
	"github.com/avalokhq/avalok/internal/store"
	pgstore "github.com/avalokhq/avalok/internal/store/postgres"
	"github.com/avalokhq/avalok/internal/workspace"
)

func serverCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "server",
		Short: "Run avalok in persistent server mode",
		Long:  "Multi-user deployment with PostgreSQL, JWT auth, RBAC, and managed credentials.",
		PersistentPreRun: func(cmd *cobra.Command, args []string) {
			godotenv.Load()
		},
	}

	cmd.AddCommand(serverStartCmd())
	cmd.AddCommand(serverMigrateCmd())
	cmd.AddCommand(serverInitCmd())
	cmd.AddCommand(serverDeployCmd())

	return cmd
}

func serverStartCmd() *cobra.Command {
	var configPath string

	cmd := &cobra.Command{
		Use:   "start [workspace.yaml...]",
		Short: "Start the server",
		Long:  "Start the avalok server. Optionally pass workspace YAML files to import at startup.",
		RunE: func(cmd *cobra.Command, args []string) error {
			return runServerStart(cmd.Context(), configPath, args)
		},
	}

	cmd.Flags().StringVarP(&configPath, "config", "c", "", "Config file path (or use AVALOK_* env vars)")

	return cmd
}

func runServerStart(ctx context.Context, configPath string, yamlPaths []string) error {
	ctx, cancel := signal.NotifyContext(ctx, os.Interrupt, syscall.SIGTERM)
	defer cancel()

	buf := logbuffer.New(2000)
	selfprovider.SetBuffer(buf)
	logHandler := server.SetupLogger(buf, "/var/log/avalok")
	defer logHandler.Close()

	cfg, err := setup.LoadConfig(configPath)
	if err != nil {
		return err
	}

	pgStore, err := pgstore.New(ctx, cfg.DatabaseURL)
	if err != nil {
		return fmt.Errorf("database connection: %w", err)
	}
	defer pgStore.Close()

	fmt.Println("Running database migrations...")
	if err := pgstore.Migrate(ctx, pgStore.Pool()); err != nil {
		return fmt.Errorf("migrations: %w", err)
	}
	fmt.Println("Migrations complete.")

	credResolver := managed.New(pgStore)

	jwtMgr := jwtauth.New(jwtauth.Config{
		Secret: cfg.JWTSecret,
		Issuer: "avalok",
	}, pgStore)

	fmt.Println()
	fmt.Println("Avalok Server — persistent log access broker")
	fmt.Println()

	if len(yamlPaths) > 0 {
		for _, path := range yamlPaths {
			absPath, err := filepath.Abs(path)
			if err != nil {
				return fmt.Errorf("resolving path %q: %w", path, err)
			}
			w, err := workspace.Load(absPath)
			if err != nil {
				return fmt.Errorf("loading workspace %q: %w", path, err)
			}
			if err := pgStore.SaveWorkspace(ctx, w); err != nil {
				return fmt.Errorf("saving workspace %q: %w", w.Name, err)
			}
			fmt.Printf("  Imported workspace: %s (%s)\n", w.Name, w.Description)
		}
		fmt.Println()
	}

	srv := server.New(pgStore, credResolver,
		server.WithAuth(jwtMgr),
		server.WithServerMode(),
	)

	addr := cfg.Addr()

	go func() {
		fmt.Printf("\nListening on %s\n", addr)
		fmt.Println("Press Ctrl+C to stop")
		if err := srv.Start(addr); err != nil && ctx.Err() == nil {
			fmt.Fprintf(os.Stderr, "server error: %v\n", err)
			cancel()
		}
	}()

	<-ctx.Done()
	fmt.Println("\nShutting down...")

	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer shutdownCancel()
	return srv.Shutdown(shutdownCtx)
}

func serverMigrateCmd() *cobra.Command {
	var dbURL string

	cmd := &cobra.Command{
		Use:   "migrate",
		Short: "Run database migrations",
		RunE: func(cmd *cobra.Command, args []string) error {
			if dbURL == "" {
				dbURL = os.Getenv("AVALOK_DATABASE_URL")
			}
			if dbURL == "" {
				return fmt.Errorf("database URL is required (--db-url or AVALOK_DATABASE_URL)")
			}

			ctx := cmd.Context()
			pool, err := pgstore.New(ctx, dbURL)
			if err != nil {
				return fmt.Errorf("database connection: %w", err)
			}
			defer pool.Close()

			fmt.Println("Running migrations...")
			if err := pgstore.Migrate(ctx, pool.Pool()); err != nil {
				return fmt.Errorf("migrations: %w", err)
			}
			fmt.Println("Migrations complete.")
			return nil
		},
	}

	cmd.Flags().StringVar(&dbURL, "db-url", "", "PostgreSQL connection string")

	return cmd
}

func serverInitCmd() *cobra.Command {
	var dbURL string
	var jwtSecret string

	cmd := &cobra.Command{
		Use:   "init",
		Short: "Initialize server (run migrations, create admin account)",
		RunE: func(cmd *cobra.Command, args []string) error {
			if dbURL == "" {
				dbURL = os.Getenv("AVALOK_DATABASE_URL")
			}
			if dbURL == "" {
				return fmt.Errorf("database URL is required (--db-url or AVALOK_DATABASE_URL)")
			}
			if jwtSecret == "" {
				jwtSecret = os.Getenv("AVALOK_JWT_SECRET")
			}

			ctx := cmd.Context()
			pool, err := pgstore.New(ctx, dbURL)
			if err != nil {
				return fmt.Errorf("database connection: %w", err)
			}
			defer pool.Close()

			fmt.Println("Running migrations...")
			if err := pgstore.Migrate(ctx, pool.Pool()); err != nil {
				return fmt.Errorf("migrations: %w", err)
			}
			fmt.Println("Migrations complete.")
			fmt.Println()

			scanner := bufio.NewScanner(os.Stdin)

			fmt.Print("Admin username: ")
			if !scanner.Scan() {
				return fmt.Errorf("unexpected end of input")
			}
			username := strings.TrimSpace(scanner.Text())
			if username == "" {
				return fmt.Errorf("username cannot be empty")
			}

			fmt.Print("Admin email (optional): ")
			scanner.Scan()
			email := strings.TrimSpace(scanner.Text())

			fmt.Print("Admin password: ")
			passwordBytes, err := term.ReadPassword(int(syscall.Stdin))
			fmt.Println()
			if err != nil {
				return fmt.Errorf("reading password: %w", err)
			}
			password := strings.TrimSpace(string(passwordBytes))
			if len(password) < 8 {
				return fmt.Errorf("password must be at least 8 characters")
			}

			hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
			if err != nil {
				return fmt.Errorf("hashing password: %w", err)
			}

			user := &store.User{
				ID:       uuid.New().String(),
				Username: username,
				Email:    email,
				Password: string(hash),
				Role:     "admin",
				Status:   "active",
				Scope:    []string{},
			}

			if err := pool.CreateUser(ctx, user); err != nil {
				return fmt.Errorf("creating admin user: %w", err)
			}

			fmt.Println()
			fmt.Printf("Admin account created: %s (role: admin)\n", username)

			if jwtSecret == "" {
				fmt.Println()
				fmt.Println("Note: Set AVALOK_JWT_SECRET (32+ chars) before running 'avalok server start'")
			}

			fmt.Println()
			fmt.Println("Server initialized. Start with:")
			fmt.Println("  avalok server start")
			return nil
		},
	}

	cmd.Flags().StringVar(&dbURL, "db-url", "", "PostgreSQL connection string")
	cmd.Flags().StringVar(&jwtSecret, "jwt-secret", "", "JWT signing secret (32+ chars)")

	return cmd
}

func serverDeployCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "deploy",
		Short: "Deploy avalok server using Docker Compose",
		Long:  "Generates or starts Docker Compose with PostgreSQL and avalok server.",
		RunE: func(cmd *cobra.Command, args []string) error {
			return runServerDeploy()
		},
	}

	return cmd
}

func runServerDeploy() error {
	composePath := "docker-compose.yml"

	if _, err := os.Stat(composePath); os.IsNotExist(err) {
		fmt.Println("Creating docker-compose.yml in current directory...")
		if err := os.WriteFile(composePath, []byte(dockerComposeTemplate), 0644); err != nil {
			return fmt.Errorf("writing docker-compose.yml: %w", err)
		}
		fmt.Println("Created docker-compose.yml")
		fmt.Println()
		fmt.Println("Before starting, edit docker-compose.yml and set:")
		fmt.Println("  - AVALOK_JWT_SECRET to a random 32+ character string")
		fmt.Println("  - Optionally change POSTGRES_PASSWORD")
		fmt.Println()
		fmt.Println("Then run:")
		fmt.Println("  docker compose up -d")
		fmt.Println()
		fmt.Println("After containers are running, initialize the admin account:")
		fmt.Println("  docker compose exec avalok avalok server init")
	} else {
		fmt.Println("docker-compose.yml already exists.")
		fmt.Println()
		fmt.Println("To start:    docker compose up -d")
		fmt.Println("To stop:     docker compose down")
		fmt.Println("To rebuild:  docker compose up -d --build")
	}

	return nil
}

const dockerComposeTemplate = `services:
  avalok:
    image: ghcr.io/avalokhq/avalok:latest
    ports:
      - "9090:9090"
    environment:
      AVALOK_DATABASE_URL: postgres://avalok:avalok@postgres:5432/avalok?sslmode=disable
      AVALOK_JWT_SECRET: change-me-to-a-random-secret-at-least-32-chars
      AVALOK_BIND_ADDR: "0.0.0.0"
      AVALOK_PORT: "9090"
    depends_on:
      postgres:
        condition: service_healthy
    restart: unless-stopped
    # Mount credentials if needed:
    # volumes:
    #   - ~/.kube/config:/etc/avalok/kubeconfig:ro
    #   - ./ssh-keys:/etc/avalok/ssh-keys:ro

  postgres:
    image: postgres:17-alpine
    environment:
      POSTGRES_USER: avalok
      POSTGRES_PASSWORD: avalok
      POSTGRES_DB: avalok
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U avalok"]
      interval: 5s
      timeout: 3s
      retries: 5

volumes:
  pgdata:
`
