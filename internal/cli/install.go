package cli

import (
	"bufio"
	"context"
	"fmt"
	"os"
	"os/exec"
	"strings"
	"time"

	"github.com/spf13/cobra"
)

func serverInstallCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "install",
		Short: "Install avalok as a systemd service with PostgreSQL",
		Long:  "Interactive wizard to set up avalok as a systemd service. Handles PostgreSQL setup, config generation, and systemd unit creation.",
		RunE: func(cmd *cobra.Command, args []string) error {
			return runServerInstall()
		},
	}
	return cmd
}

func runServerInstall() error {
	fmt.Println()
	fmt.Println("  Avalok Server Install")
	fmt.Println("  =====================")
	fmt.Println()

	// Root check
	if os.Getuid() != 0 {
		fmt.Println("  ✗ This command must be run as root. Use:")
		fmt.Println("    sudo avalok server install")
		return fmt.Errorf("root privileges required")
	}

	// Step 1: Prerequisites
	fmt.Println("  [1/4] Checking prerequisites...")

	avalokPath, err := exec.LookPath("avalok")
	if err != nil {
		avalokPath = "/usr/local/bin/avalok"
		if _, err := os.Stat(avalokPath); err != nil {
			fmt.Println("    ✗ avalok binary not found in PATH or /usr/local/bin/")
			fmt.Println()
			fmt.Println("  Copy the avalok binary to /usr/local/bin/ first:")
			fmt.Println("    sudo cp avalok /usr/local/bin/avalok")
			fmt.Println("    sudo chmod +x /usr/local/bin/avalok")
			return fmt.Errorf("avalok binary not found")
		}
	}
	fmt.Printf("    ✓ avalok binary found at %s\n", avalokPath)

	if !hasSystemd() {
		fmt.Println("    ✗ systemd not detected")
		fmt.Println()
		fmt.Println("  This command requires systemd. For Docker-based deployment, use:")
		fmt.Println("    avalok server deploy")
		return fmt.Errorf("systemd not detected")
	}
	fmt.Println("    ✓ systemd detected")
	fmt.Println()

	// Step 2: PostgreSQL setup
	fmt.Println("  [2/4] PostgreSQL setup")
	fmt.Println("    How would you like to run PostgreSQL?")
	fmt.Println()
	fmt.Println("      1. Docker container (recommended)")
	fmt.Println("      2. Use existing PostgreSQL")
	fmt.Println("      3. Install PostgreSQL on this machine")
	fmt.Println()

	choice := prompt("    Select [1/2/3]: ")

	var dbURL string

	switch choice {
	case "1":
		dbURL, err = setupPostgresDocker()
	case "2":
		dbURL, err = setupPostgresExisting()
	case "3":
		dbURL, err = setupPostgresSystem()
	default:
		return fmt.Errorf("invalid choice: %s", choice)
	}
	if err != nil {
		return err
	}
	fmt.Println()

	// Step 3: Configure avalok
	fmt.Println("  [3/4] Configuring Avalok...")

	jwtSecret, err := generateHexSecret(32)
	if err != nil {
		return fmt.Errorf("generating JWT secret: %w", err)
	}
	fmt.Println("    ✓ Generated JWT secret")

	configDir := "/etc/avalok"
	configPath := configDir + "/server.yaml"

	if _, err := os.Stat(configPath); err == nil {
		fmt.Println()
		fmt.Printf("    %s already exists.\n", configPath)
		overwrite := prompt("    Overwrite? [y/N]: ")
		if strings.ToLower(overwrite) != "y" {
			fmt.Println("    ✓ Keeping existing config")
		} else {
			if err := writeConfig(configDir, configPath, dbURL, jwtSecret); err != nil {
				return err
			}
		}
	} else {
		if err := writeConfig(configDir, configPath, dbURL, jwtSecret); err != nil {
			return err
		}
	}

	ensureSystemUser()
	ensureLogDir()
	fmt.Println()

	// Step 4: systemd
	fmt.Println("  [4/4] Installing systemd service...")

	servicePath := "/etc/systemd/system/avalok.service"
	if _, err := os.Stat(servicePath); err == nil {
		fmt.Println()
		fmt.Printf("    %s already exists.\n", servicePath)
		overwrite := prompt("    Overwrite? [y/N]: ")
		if strings.ToLower(overwrite) != "y" {
			fmt.Println("    ✓ Keeping existing service file")
		} else {
			if err := writeServiceFile(servicePath, avalokPath); err != nil {
				return err
			}
		}
	} else {
		if err := writeServiceFile(servicePath, avalokPath); err != nil {
			return err
		}
	}

	// Done
	fmt.Println()
	fmt.Println("  ══════════════════════════════════════════")
	fmt.Println()
	fmt.Println("  Installation complete! Run these commands to start:")
	fmt.Println()
	fmt.Println("    sudo systemctl daemon-reload")
	fmt.Println("    sudo systemctl enable avalok")
	fmt.Println("    sudo systemctl start avalok")
	fmt.Println()
	fmt.Println("  Then open http://<your-ip>:9090 in your browser.")
	fmt.Println()
	fmt.Println("  Admin credentials will be printed in the service logs:")
	fmt.Println("    sudo journalctl -u avalok -n 20")
	fmt.Println()
	fmt.Println("  Useful commands:")
	fmt.Println("    sudo systemctl status avalok       # check status")
	fmt.Println("    sudo systemctl restart avalok       # restart")
	fmt.Println("    sudo journalctl -fu avalok          # follow logs")
	fmt.Println()
	fmt.Println("  Config: /etc/avalok/server.yaml")
	fmt.Println("  Logs:   /var/log/avalok/")
	fmt.Println()

	return nil
}

// --- PostgreSQL: Docker container ---

func setupPostgresDocker() (string, error) {
	fmt.Println()
	fmt.Println("    Selected: Docker container")
	fmt.Println()

	if _, err := exec.LookPath("docker"); err != nil {
		fmt.Println("    ✗ Docker is not installed.")
		fmt.Println()
		fmt.Println("    Install Docker first:")
		fmt.Println("      curl -fsSL https://get.docker.com | sh")
		fmt.Println("      sudo systemctl enable --now docker")
		fmt.Println()
		fmt.Println("    Then re-run: sudo avalok server install")
		return "", fmt.Errorf("docker not installed")
	}
	fmt.Println("    ✓ Docker detected")

	pgPassword, err := generateHexSecret(16)
	if err != nil {
		return "", fmt.Errorf("generating password: %w", err)
	}

	composeDir := "/etc/avalok"
	composePath := composeDir + "/docker-compose.postgres.yml"
	os.MkdirAll(composeDir, 0755)

	compose := fmt.Sprintf(`services:
  postgres:
    image: postgres:17-alpine
    container_name: avalok-postgres
    environment:
      POSTGRES_USER: avalok
      POSTGRES_PASSWORD: %s
      POSTGRES_DB: avalok
    ports:
      - "127.0.0.1:5432:5432"
    volumes:
      - avalok-pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U avalok"]
      interval: 5s
      timeout: 3s
      retries: 5
    restart: unless-stopped

volumes:
  avalok-pgdata:
`, pgPassword)

	if err := os.WriteFile(composePath, []byte(compose), 0600); err != nil {
		return "", fmt.Errorf("writing compose file: %w", err)
	}
	fmt.Printf("    ✓ Generated %s\n", composePath)
	fmt.Println()

	fmt.Println("    Starting PostgreSQL container...")
	cmd := exec.Command("docker", "compose", "-f", composePath, "up", "-d")
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	if err := cmd.Run(); err != nil {
		fmt.Println("    ✗ Failed to start PostgreSQL container")
		fmt.Println()
		fmt.Println("    Start it manually:")
		fmt.Printf("      docker compose -f %s up -d\n", composePath)
		fmt.Println()
		fmt.Println("    Then re-run: sudo avalok server install")
		return "", fmt.Errorf("starting postgres container: %w", err)
	}

	if err := waitForPostgres(fmt.Sprintf("postgres://avalok:%s@127.0.0.1:5432/avalok?sslmode=disable", pgPassword)); err != nil {
		fmt.Println("    ✗ PostgreSQL did not become ready in time")
		return "", err
	}
	fmt.Println("    ✓ PostgreSQL is ready on localhost:5432")

	return fmt.Sprintf("postgres://avalok:%s@127.0.0.1:5432/avalok?sslmode=disable", pgPassword), nil
}

// --- PostgreSQL: Use existing ---

func setupPostgresExisting() (string, error) {
	fmt.Println()
	fmt.Println("    Selected: Use existing PostgreSQL")
	fmt.Println()
	fmt.Println("    Enter the full connection string.")
	fmt.Println("    Example: postgres://avalok:password@localhost:5432/avalok?sslmode=disable")
	fmt.Println()

	dbURL := prompt("    Connection string: ")
	if dbURL == "" {
		return "", fmt.Errorf("connection string cannot be empty")
	}

	fmt.Println()
	fmt.Println("    Testing connection...")

	if err := testPostgresConnection(dbURL); err != nil {
		fmt.Printf("    ✗ Could not connect to PostgreSQL: %v\n", err)
		fmt.Println()
		fmt.Println("    Make sure PostgreSQL is running and the connection string is correct.")
		fmt.Println("    Then re-run: sudo avalok server install")
		return "", fmt.Errorf("postgres connection failed")
	}
	fmt.Println("    ✓ Connected to PostgreSQL")

	return dbURL, nil
}

// --- PostgreSQL: Install on system ---

func setupPostgresSystem() (string, error) {
	fmt.Println()
	fmt.Println("    Selected: Install PostgreSQL on this machine")
	fmt.Println()

	pkgMgr := detectPackageManager()
	if pkgMgr == "" {
		fmt.Println("    ✗ Could not detect package manager (apt, dnf, or yum).")
		fmt.Println()
		fmt.Println("    Install PostgreSQL manually, then re-run with option 2:")
		fmt.Println("      sudo avalok server install")
		return "", fmt.Errorf("package manager not found")
	}
	fmt.Printf("    ✓ Detected package manager: %s\n", pkgMgr)
	fmt.Println()

	var installCmd *exec.Cmd
	switch pkgMgr {
	case "apt":
		installCmd = exec.Command("apt", "install", "-y", "postgresql")
	case "dnf":
		installCmd = exec.Command("dnf", "install", "-y", "postgresql-server", "postgresql")
	case "yum":
		installCmd = exec.Command("yum", "install", "-y", "postgresql-server", "postgresql")
	}

	fmt.Printf("    Running: %s\n", strings.Join(installCmd.Args, " "))
	installCmd.Stdout = os.Stdout
	installCmd.Stderr = os.Stderr
	if err := installCmd.Run(); err != nil {
		fmt.Println("    ✗ Failed to install PostgreSQL")
		return "", fmt.Errorf("installing postgresql: %w", err)
	}
	fmt.Println("    ✓ PostgreSQL installed")
	fmt.Println()

	// dnf/yum requires initdb
	if pkgMgr == "dnf" || pkgMgr == "yum" {
		initCmd := exec.Command("postgresql-setup", "--initdb")
		initCmd.Stdout = os.Stdout
		initCmd.Stderr = os.Stderr
		initCmd.Run() // ignore error if already initialized
	}

	enableCmd := exec.Command("systemctl", "enable", "--now", "postgresql")
	fmt.Printf("    Running: %s\n", strings.Join(enableCmd.Args, " "))
	enableCmd.Stdout = os.Stdout
	enableCmd.Stderr = os.Stderr
	if err := enableCmd.Run(); err != nil {
		fmt.Println("    ✗ Failed to start PostgreSQL service")
		return "", fmt.Errorf("starting postgresql: %w", err)
	}
	fmt.Println("    ✓ PostgreSQL service started")
	fmt.Println()

	fmt.Println("    Creating database and user...")

	pgPassword, err := generateHexSecret(16)
	if err != nil {
		return "", fmt.Errorf("generating password: %w", err)
	}

	runPgCmd("createuser", "avalok")
	fmt.Println("    Running: sudo -u postgres createuser avalok")

	runPgCmd("createdb", "-O", "avalok", "avalok")
	fmt.Println("    Running: sudo -u postgres createdb -O avalok avalok")

	alterSQL := fmt.Sprintf("ALTER USER avalok PASSWORD '%s'", pgPassword)
	runPgCmd("psql", "-c", alterSQL)
	fmt.Println("    ✓ Database 'avalok' created with user 'avalok'")

	dbURL := fmt.Sprintf("postgres://avalok:%s@127.0.0.1:5432/avalok?sslmode=disable", pgPassword)

	fmt.Println()
	fmt.Println("    Testing connection...")
	if err := testPostgresConnection(dbURL); err != nil {
		fmt.Printf("    ✗ Could not connect to PostgreSQL: %v\n", err)
		fmt.Println()
		fmt.Println("    You may need to update pg_hba.conf to allow password authentication.")
		fmt.Println("    Edit /etc/postgresql/*/main/pg_hba.conf (or /var/lib/pgsql/data/pg_hba.conf)")
		fmt.Println("    and change 'peer' to 'md5' for local connections, then restart postgresql.")
		return "", fmt.Errorf("postgres connection failed after install")
	}
	fmt.Println("    ✓ Connected to PostgreSQL")

	return dbURL, nil
}

// --- Helpers ---

func hasSystemd() bool {
	_, err := os.Stat("/run/systemd/system")
	return err == nil
}

func detectPackageManager() string {
	for _, pm := range []string{"apt", "dnf", "yum"} {
		if _, err := exec.LookPath(pm); err == nil {
			return pm
		}
	}
	return ""
}

func prompt(label string) string {
	fmt.Print(label)
	scanner := bufio.NewScanner(os.Stdin)
	if scanner.Scan() {
		return strings.TrimSpace(scanner.Text())
	}
	return ""
}

func runPgCmd(pgCmd string, args ...string) {
	allArgs := append([]string{"-u", "postgres", pgCmd}, args...)
	cmd := exec.Command("sudo", allArgs...)
	cmd.Run()
}

func testPostgresConnection(dbURL string) error {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	cmd := exec.CommandContext(ctx, "psql", dbURL, "-c", "SELECT 1")
	cmd.Env = append(os.Environ(), "PGCONNECT_TIMEOUT=5")
	output, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("%s", strings.TrimSpace(string(output)))
	}
	return nil
}

func waitForPostgres(dbURL string) error {
	for i := 0; i < 30; i++ {
		if err := testPostgresConnection(dbURL); err == nil {
			return nil
		}
		time.Sleep(1 * time.Second)
	}
	return fmt.Errorf("timeout waiting for postgres")
}

func writeConfig(dir, path, dbURL, jwtSecret string) error {
	os.MkdirAll(dir, 0755)

	config := fmt.Sprintf(`database_url: %s
jwt_secret: %s
bind_addr: 0.0.0.0
port: 9090
`, dbURL, jwtSecret)

	if err := os.WriteFile(path, []byte(config), 0600); err != nil {
		return fmt.Errorf("writing config: %w", err)
	}
	fmt.Printf("    ✓ Created %s\n", path)
	return nil
}

func ensureSystemUser() {
	cmd := exec.Command("id", "avalok")
	if err := cmd.Run(); err != nil {
		create := exec.Command("useradd", "--system", "--no-create-home", "--shell", "/usr/sbin/nologin", "avalok")
		if err := create.Run(); err == nil {
			fmt.Println("    ✓ Created avalok system user")
		}
	} else {
		fmt.Println("    ✓ avalok system user exists")
	}
}

func ensureLogDir() {
	logDir := "/var/log/avalok"
	os.MkdirAll(logDir, 0755)
	exec.Command("chown", "avalok:avalok", logDir).Run()
	fmt.Println("    ✓ Created /var/log/avalok directory")
}

func writeServiceFile(path, avalokPath string) error {
	unit := fmt.Sprintf(`[Unit]
Description=Avalok Log Access Broker
After=network.target
Wants=network.target

[Service]
Type=simple
User=avalok
Group=avalok
ExecStart=%s server start --config /etc/avalok/server.yaml
Restart=on-failure
RestartSec=5
LimitNOFILE=65536

WorkingDirectory=/etc/avalok
StandardOutput=journal
StandardError=journal
SyslogIdentifier=avalok

[Install]
WantedBy=multi-user.target
`, avalokPath)

	if err := os.WriteFile(path, []byte(unit), 0644); err != nil {
		return fmt.Errorf("writing service file: %w", err)
	}
	fmt.Printf("    ✓ Created %s\n", path)
	return nil
}
