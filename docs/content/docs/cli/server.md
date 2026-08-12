---
weight: 220
title: "server"
description: "Persistent multi-user server with PostgreSQL, JWT auth, and RBAC."
icon: "dns"
---

# avalok server

Parent command for running avalok in persistent multi-user mode. Unlike `avalok serve` (which is ephemeral and in-memory), the server commands use PostgreSQL for storage, JWT for authentication, and role-based access control (RBAC) for authorization.

## Subcommands

| Subcommand | Description |
|------------|-------------|
| [`server start`](#server-start) | Start the persistent server |
| [`server migrate`](#server-migrate) | Run database migrations |
| [`server init`](#server-init) | Initialize server (migrations + admin account) |
| [`server deploy`](#server-deploy) | Generate docker-compose.yml for deployment |
| [`server install`](#server-install) | Install avalok as a systemd service |

## Environment Variables

All `server` subcommands automatically load `.env` files from the current directory.

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `AVALOK_DATABASE_URL` | PostgreSQL connection string | -- | Yes (for `start`, `migrate`, `init`) |
| `AVALOK_JWT_SECRET` | JWT signing secret (minimum 32 characters) | -- | Yes (for `start`) |
| `AVALOK_BIND_ADDR` | Bind address | `0.0.0.0` | No |
| `AVALOK_PORT` | HTTP server port | `9090` | No |

---

## server start

Start the avalok server in persistent mode. Connects to PostgreSQL, runs migrations, and starts the HTTP server with JWT authentication and RBAC enabled.

### Usage

```bash
avalok server start [workspace.yaml...] [flags]
```

Workspace YAML files are optional. If provided, they are imported into the database at startup.

### Flags

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `-c`, `--config` | string | | Config file path (alternative to environment variables) |

### Config File Format

Instead of (or in addition to) environment variables, you can use a YAML config file:

```yaml
database_url: postgres://avalok:secret@localhost:5432/avalok?sslmode=disable
jwt_secret: your-random-secret-at-least-32-characters-long
bind_addr: 0.0.0.0
port: 9090
```

Environment variables take precedence over config file values.

### Examples

Start with environment variables:

```bash
export AVALOK_DATABASE_URL="postgres://avalok:secret@localhost:5432/avalok?sslmode=disable"
export AVALOK_JWT_SECRET="$(openssl rand -hex 32)"

avalok server start
```

Start with a config file and import workspaces:

```bash
avalok server start -c /etc/avalok/config.yaml production.yaml staging.yaml
```

---

## server migrate

Run database migrations without starting the server. Useful for CI/CD pipelines or when you need to update the schema independently.

### Usage

```bash
avalok server migrate [flags]
```

### Flags

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--db-url` | string | | PostgreSQL connection string (fallback: `AVALOK_DATABASE_URL`) |

### Examples

```bash
# Using a flag
avalok server migrate --db-url "postgres://avalok:secret@localhost:5432/avalok?sslmode=disable"

# Using an environment variable
export AVALOK_DATABASE_URL="postgres://avalok:secret@localhost:5432/avalok?sslmode=disable"
avalok server migrate
```

---

## server init

Initialize the server by running database migrations and creating the first admin account interactively.

The command prompts for:

- **Username** -- required, cannot be empty
- **Email** -- optional, press Enter to skip
- **Password** -- required, minimum 8 characters, input is masked (not echoed)

### Usage

```bash
avalok server init [flags]
```

### Flags

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--db-url` | string | | PostgreSQL connection string (fallback: `AVALOK_DATABASE_URL`) |
| `--jwt-secret` | string | | JWT signing secret, 32+ characters (fallback: `AVALOK_JWT_SECRET`) |

### Example

```bash
avalok server init --db-url "postgres://avalok:secret@localhost:5432/avalok?sslmode=disable"
```

Output:

```
Running migrations...
Migrations complete.

Admin username: admin
Admin email (optional): admin@example.com
Admin password:

Admin account created: admin (role: admin)

Server initialized. Start with:
  avalok server start
```

If `AVALOK_JWT_SECRET` is not set, the command reminds you to set it before starting the server.

---

## server deploy

Generate a `docker-compose.yml` file for deploying avalok with PostgreSQL. If the file already exists, it prints instructions for managing the existing deployment.

### Usage

```bash
avalok server deploy
```

### Generated Docker Compose

The generated `docker-compose.yml` includes two services:

| Service | Image | Description |
|---------|-------|-------------|
| `avalok` | `ghcr.io/avalokhq/avalok:latest` | The avalok server |
| `postgres` | `postgres:17-alpine` | PostgreSQL database |

Key details:

- **Host networking**: the avalok container uses `network_mode: host` so it can reach SSH targets, VPN-connected networks, and internal subnets directly
- **Auto-generated JWT secret**: `avalok server deploy` generates a random secret automatically
- **Auto-admin**: on first start, an admin account is created and credentials are printed in the container logs
- **Volume**: `pgdata` for persistent PostgreSQL data
- **Health check**: PostgreSQL includes a health check (`pg_isready`) with 5-second intervals

### Example

```bash
# Generate the file (JWT secret is auto-generated)
avalok server deploy

# Start the services
docker compose up -d

# Get the auto-generated admin credentials
docker compose logs avalok | grep -A 3 "ADMIN ACCOUNT CREATED"
```

You can mount credential files into the avalok container by adding a `volumes` section:

```yaml
volumes:
  - ~/.kube/config:/etc/avalok/kubeconfig:ro
  - ./ssh-keys:/etc/avalok/ssh-keys:ro
```

---

## server install

Interactive wizard to install avalok as a systemd service on a Linux machine. Handles PostgreSQL setup, configuration, system user creation, and systemd unit generation.

Requires root privileges.

### Usage

```bash
sudo avalok server install
```

### What it does

1. **Checks prerequisites** -- verifies the avalok binary and systemd are available
2. **Sets up PostgreSQL** -- offers three options:
   - **Docker container** (recommended) -- creates a Compose file at `/etc/avalok/docker-compose.postgres.yml` and starts the container
   - **Use existing PostgreSQL** -- prompts for a connection string and tests it
   - **Install on this machine** -- detects the package manager (apt/dnf/yum), installs PostgreSQL, creates the database and user
3. **Generates config** -- creates `/etc/avalok/server.yaml` with database URL and a random JWT secret
4. **Installs systemd service** -- creates `/etc/systemd/system/avalok.service`

### Files created

| File | Purpose |
|------|---------|
| `/etc/avalok/server.yaml` | Server configuration (database URL, JWT secret, bind address, port) |
| `/etc/systemd/system/avalok.service` | systemd service unit |
| `/etc/avalok/docker-compose.postgres.yml` | PostgreSQL container (Docker option only) |
| `/var/log/avalok/` | Log directory |

### After installation

```bash
sudo systemctl daemon-reload
sudo systemctl enable avalok
sudo systemctl start avalok
```

Admin credentials are printed in the service logs on first start:

```bash
sudo journalctl -u avalok -n 20
```

### Example output

```
  Avalok Server Install
  =====================

  [1/4] Checking prerequisites...
    ✓ avalok binary found at /usr/local/bin/avalok
    ✓ systemd detected

  [2/4] PostgreSQL setup
    How would you like to run PostgreSQL?

      1. Docker container (recommended)
      2. Use existing PostgreSQL
      3. Install PostgreSQL on this machine

    Selected: Docker container

    ✓ Docker detected
    ✓ Generated /etc/avalok/docker-compose.postgres.yml

    Starting PostgreSQL container...
    ✓ PostgreSQL is ready on localhost:5432

  [3/4] Configuring Avalok...
    ✓ Generated JWT secret
    ✓ Created /etc/avalok/server.yaml
    ✓ Created avalok system user
    ✓ Created /var/log/avalok directory

  [4/4] Installing systemd service...
    ✓ Created /etc/systemd/system/avalok.service

  ══════════════════════════════════════════

  Installation complete! Run these commands to start:

    sudo systemctl daemon-reload
    sudo systemctl enable avalok
    sudo systemctl start avalok

  Then open http://<your-ip>:9090 in your browser.

  Admin credentials will be printed in the service logs:
    sudo journalctl -u avalok -n 20

  Useful commands:
    sudo systemctl status avalok       # check status
    sudo systemctl restart avalok       # restart
    sudo journalctl -fu avalok          # follow logs

  Config: /etc/avalok/server.yaml
  Logs:   /var/log/avalok/
```

---

## Step-by-Step Setup Guide

### 1. Generate the Docker Compose file

```bash
avalok server deploy
```

The JWT secret is generated automatically.

### 2. Start the services

```bash
docker compose up -d
```

### 3. Get the admin credentials

On first start, an admin account is created automatically. Retrieve the credentials from the logs:

```bash
docker compose logs avalok | grep -A 3 "ADMIN ACCOUNT CREATED"
```

### 4. Access the web UI

Open `http://your-server:9090` in your browser and log in with the generated admin credentials. Change the admin password after your first login.

### 5. Import workspaces

Manage workspaces through the web UI, or mount YAML files as volumes and restart the container.
