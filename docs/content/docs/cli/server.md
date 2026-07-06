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
| `avalok` | Built from `deploy/Dockerfile` | The avalok server |
| `postgres` | `postgres:17-alpine` | PostgreSQL database |

Key details:

- **Port mapping**: `9090:9090` for the avalok web UI and API
- **Volume**: `pgdata` for persistent PostgreSQL data
- **Health check**: PostgreSQL includes a health check (`pg_isready`) with 5-second intervals
- **Dependency**: The avalok service waits for PostgreSQL to be healthy before starting
- **Restart policy**: `unless-stopped` for the avalok service

### Example

```bash
# Generate the file
avalok server deploy

# Edit the generated file and set your secrets
# (at minimum, change AVALOK_JWT_SECRET)

# Start the services
docker compose up -d

# Initialize the admin account
docker compose exec avalok avalok server init
```

### Generated docker-compose.yml

```yaml
services:
  avalok:
    build:
      context: .
      dockerfile: deploy/Dockerfile
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
```

You can mount credential files into the avalok container by uncommenting the `volumes` section:

```yaml
volumes:
  - ~/.kube/config:/etc/avalok/kubeconfig:ro
  - ./ssh-keys:/etc/avalok/ssh-keys:ro
```

---

## Step-by-Step Setup Guide

### 1. Generate the Docker Compose file

```bash
avalok server deploy
```

### 2. Set your secrets

Edit `docker-compose.yml` and replace the placeholder values:

```bash
# Generate a secure JWT secret
openssl rand -hex 32
```

Set `AVALOK_JWT_SECRET` to the generated value. Optionally change `POSTGRES_PASSWORD` (update both the `postgres` service and the connection string in `AVALOK_DATABASE_URL`).

### 3. Start the services

```bash
docker compose up -d
```

### 4. Initialize the admin account

```bash
docker compose exec avalok avalok server init
```

### 5. Import workspaces

Copy your workspace YAML files into the container or mount them as volumes, then restart with:

```bash
docker compose exec avalok avalok server start production.yaml
```

Or manage workspaces through the web UI after logging in as admin.

### 6. Access the web UI

Open `http://your-server:9090` in your browser and log in with the admin credentials you created.
