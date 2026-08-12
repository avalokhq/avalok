---
weight: 520
title: "Server Mode"
description: "Deploy Avalok as a persistent multi-user server with PostgreSQL, JWT auth, and RBAC."
icon: "dns"
---

# Server Mode

Server mode (`avalok server`) is Avalok's persistent, multi-user deployment. It stores workspaces, users, and credentials in PostgreSQL, authenticates users with JWT tokens, and enforces role-based access control (RBAC).

Use server mode when you need a shared log access platform for your team -- with user accounts, credential management, and persistent configuration.

## When to Use Server Mode

- **Team deployments** -- multiple users need ongoing log access
- **Platform engineering** -- embed Avalok as part of your internal developer platform
- **Production access** -- controlled, auditable access to production logs
- **Credential management** -- store SSH keys, kubeconfigs, and passwords centrally instead of relying on individual operators

## Prerequisites

- **Avalok binary** -- download from [GitHub Releases](https://github.com/avalokhq/avalok/releases) or [build from source]({{< ref "installation" >}})
- **PostgreSQL 15+** -- either standalone or via the included Docker Compose setup
- **JWT secret** -- a random string of at least 32 characters

## Architecture Overview

```
                     +-------------------+
  Users (browser) -->|   Reverse Proxy   |
                     |  (nginx / Caddy)  |
                     +--------+----------+
                              |
                              v
                     +-------------------+
                     |   Avalok Server   |
                     |  (single binary)  |
                     +--------+----------+
                              |
                     +--------+----------+
                     |    PostgreSQL     |
                     +-------------------+
```

Avalok connects to your infrastructure from the server using managed credentials (SSH keys, kubeconfigs) stored in PostgreSQL.

## Step-by-Step Setup

### 1. Deploy

Choose between Docker Compose (recommended for most teams) or bare metal.

### 2. Initialize

Create the database schema and the first admin account.

### 3. Configure

Set up credential profiles and import workspace configurations.

### 4. Invite users

Create user accounts with appropriate roles and scopes.

---

## Docker Compose Deployment

The fastest way to get a server running.

### Generate the Compose file

```bash
avalok server deploy
```

This creates a `docker-compose.yml` in the current directory with two services:

- **avalok** -- the Avalok server on port 9090
- **postgres** -- PostgreSQL 17 for persistent storage

The `deploy` command auto-generates a random JWT secret. Optionally change the database password in the generated file.

### Mount credentials (optional)

If you need Avalok to access Kubernetes clusters or SSH hosts, mount credential files into the container:

```yaml
services:
  avalok:
    volumes:
      - ~/.kube/config:/etc/avalok/kubeconfig:ro
      - ./ssh-keys:/etc/avalok/ssh-keys:ro
```

### Start the stack

```bash
docker compose up -d
```

### Get the admin credentials

On first start, the server runs database migrations and creates an admin account automatically. The credentials are printed in the container logs:

```bash
docker compose logs avalok | grep -A 3 "ADMIN ACCOUNT CREATED"
```

The credentials are also saved to `/var/log/avalok/admin-credentials.txt` inside the container (auto-deleted after 24 hours).

### Verify

```bash
curl http://localhost:9090/api/health
```

```json
{"status":"ok","mode":"server"}
```

Open `http://localhost:9090` in your browser and log in with the admin credentials.

---

## Bare Metal Deployment

For environments where Docker is not available or not preferred.

### Install PostgreSQL

Install PostgreSQL 15+ using your distribution's package manager:

```bash
# Debian/Ubuntu
sudo apt install postgresql-17

# RHEL/CentOS/Fedora
sudo dnf install postgresql17-server
```

Create the database and user:

```bash
sudo -u postgres psql
```

```sql
CREATE USER avalok WITH PASSWORD 'your_db_password';
CREATE DATABASE avalok OWNER avalok;
\q
```

### Download the binary

```bash
curl -LO https://github.com/avalokhq/avalok/releases/latest/download/avalok
chmod +x avalok
sudo mv avalok /usr/local/bin/
```

### Set environment variables

```bash
export AVALOK_DATABASE_URL="postgres://avalok:your_db_password@localhost:5432/avalok?sslmode=disable"
export AVALOK_JWT_SECRET="$(openssl rand -hex 32)"
export AVALOK_BIND_ADDR="0.0.0.0"
export AVALOK_PORT="9090"
```

Or use a config file (`server.yaml`):

```yaml
database_url: "postgres://avalok:your_db_password@localhost:5432/avalok?sslmode=disable"
jwt_secret: "your-random-secret-at-least-32-characters"
bind_addr: "0.0.0.0"
port: 9090
```

### Start the server

```bash
# With environment variables
avalok server start

# With config file
avalok server start --config server.yaml

# With workspace YAML files imported at startup
avalok server start --config server.yaml workspace1.yaml workspace2.yaml
```

On first start, an admin account is created automatically and the credentials are printed to stdout and saved to `/var/log/avalok/admin-credentials.txt` (auto-deleted after 24 hours).

### Run as a systemd service

The easiest way to set up avalok as a systemd service is the interactive installer:

```bash
sudo avalok server install
```

This handles PostgreSQL setup, config generation, system user creation, and systemd unit installation. See [`server install`]({{< relref "../cli/server#server-install" >}}) for details.

#### Manual setup

If you prefer to configure things manually, create `/etc/systemd/system/avalok.service`:

```ini
[Unit]
Description=Avalok Log Access Broker
After=network.target
Wants=network.target

[Service]
Type=simple
User=avalok
Group=avalok
ExecStart=/usr/local/bin/avalok server start --config /etc/avalok/server.yaml
Restart=on-failure
RestartSec=5
LimitNOFILE=65536
WorkingDirectory=/etc/avalok
StandardOutput=journal
StandardError=journal
SyslogIdentifier=avalok

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now avalok
```

---

## Reverse Proxy Setup

In production, place a reverse proxy in front of Avalok to handle TLS termination and provide HTTPS.

### nginx Example

```nginx
server {
    listen 443 ssl http2;
    server_name logs.example.com;

    ssl_certificate     /etc/letsencrypt/live/logs.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/logs.example.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:9090;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # WebSocket support (required for live log streaming)
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";

        # Disable buffering for streaming
        proxy_buffering off;
        proxy_cache off;

        # Long timeouts for WebSocket connections
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }
}

server {
    listen 80;
    server_name logs.example.com;
    return 301 https://$host$request_uri;
}
```

Key points:

- **WebSocket support** is required. Avalok streams logs over WebSocket connections.
- **Disable buffering** so log lines appear in real time.
- **Long timeouts** prevent the proxy from closing long-lived streaming connections.

---

## Post-Setup Configuration

### Create Users

Log in as admin and navigate to the Admin panel to create user accounts. Avalok supports two roles:

| Role | Permissions |
|---|---|
| `admin` | Full access: manage users, workspaces, credentials, settings |
| `reader` | View logs in assigned workspaces only |

Users can self-register (status: `pending`) and an admin approves them, or an admin can create accounts directly with an active status.

### Set Up Credential Profiles

Credential profiles store connection details centrally. Workspaces and resources reference profiles by name instead of embedding credentials.

Navigate to **Admin > Credentials** to create profiles:

- **SSH profile** -- hostname, username, private key, passphrase
- **Kubernetes profile** -- kubeconfig content, context, namespace
- **WinRM profile** -- hostname, username, password, HTTPS settings
- **S3 profile** -- access key, secret key, region, optional custom endpoint
- **Azure Storage profile** -- account key, connection string, SAS token, or managed identity
- **GCS profile** -- service account credentials JSON or file path

### Import Workspaces

There are three ways to add workspaces:

1. **Config Builder UI** -- navigate to **Workspaces** in the sidebar and click **Create** to open the visual config builder
2. **YAML import** -- use the Admin API to POST workspace YAML
3. **Startup import** -- pass YAML files when starting the server:

```bash
avalok server start --config server.yaml workspace1.yaml workspace2.yaml
```

### Scope User Access

When creating or editing a user, set their **scope** to limit access to specific workspaces, environments, or services. An empty scope grants access to everything (for admin users).

Scope paths use the same format as serve mode:

- `my-platform` -- access to all environments and services in the workspace
- `my-platform/production` -- access to all services in the production environment
- `my-platform/production/api` -- access to only the API service in production

### Set Up Cloud Storage Resources

In addition to Kubernetes resources, Avalok supports cloud storage resources for browsing and streaming log files from object storage. Navigate to **Resources** in the sidebar and click **Create**, then select the resource type:

- **S3 / S3-Compatible** -- bucket, prefix, region, optional custom endpoint
- **Azure Blob Storage** -- container, prefix
- **Azure File Share** -- share name, directory
- **Google Cloud Storage** -- bucket, prefix, project ID

Each cloud storage resource can reference a credential profile for authentication. See [Resources]({{< relref "../server/resources" >}}) and [Credential Management]({{< relref "../server/credentials" >}}) for details.

---

## Web UI Features

### Navigation

The admin panel uses sidebar navigation with dedicated manage pages for each entity type:

- **Dashboard** -- unified table of all workspaces, environments, services, and resources with stats
- **Workspaces** -- create, edit, and delete workspace configurations
- **Resources** -- manage Kubernetes clusters and cloud storage connections
- **Services** -- manage standalone service definitions
- **Admin** -- user management, credentials, and server settings

### Command Palette

Press **Ctrl+K** (or **Cmd+K** on Mac) to open the command palette. It provides fuzzy search across:

- All entities (workspaces, environments, services, resources, users)
- Admin pages and sections
- Individual settings (selecting a setting navigates directly to it and highlights it)

Use arrow keys to navigate results and Enter to select.

### Log Viewer

The log viewer supports three viewing modes, selectable from the toolbar:

| Mode | Description |
|------|-------------|
| **Stream** | Real-time WebSocket streaming with tail history (default) |
| **Load File** | HTTP-based fetch for large static log files -- faster than WebSocket for complete files |
| **Live** | WebSocket streaming that skips all history and shows only new lines |

The toolbar also includes a **Wrap** toggle to switch between word-wrapped and horizontally-scrolling log lines.

### Storage Browser

Cloud storage resources include a built-in storage browser. Navigate to a cloud storage resource to see a hierarchical folder tree. Click folders to navigate into them, click files to stream their contents in the log viewer. The back button returns you to the last folder you were in.

### Merge View

When viewing logs from multiple sessions, use the merge view layout to combine streams into a single interleaved view. Individual sessions can be removed from the merged view by clicking the close button on their tab.

---

## Monitoring

### Health Endpoint

```bash
curl http://localhost:9090/api/health
```

Returns `{"status":"ok","mode":"server"}`. This endpoint does not require authentication and can be used for load balancer health checks.

### Service Health

Avalok runs a background health check loop every 60 seconds, testing connectivity to all configured services. The results are cached and served via the `/api/stats` endpoint (requires authentication).

### Self-Logs Provider

Avalok includes a built-in `self` provider that exposes its own server logs. This lets you monitor Avalok itself through its own UI. The self-logs provider captures the last 2,000 log lines in a ring buffer and, in server mode, also writes logs to `/var/log/avalok`.

---

## Configuration Reference

### Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `AVALOK_DATABASE_URL` | yes | | PostgreSQL connection string |
| `AVALOK_JWT_SECRET` | yes | | JWT signing secret (32+ characters) |
| `AVALOK_BIND_ADDR` | no | `0.0.0.0` | Bind address |
| `AVALOK_PORT` | no | `9090` | HTTP server port |

### Config File (`server.yaml`)

```yaml
database_url: "postgres://user:pass@host:5432/avalok?sslmode=disable"
jwt_secret: "your-random-secret-at-least-32-characters"
bind_addr: "0.0.0.0"
port: 9090
```

Environment variables override config file values.

### Server Subcommands

| Command | Description |
|---|---|
| `avalok server start` | Start the server (auto-creates admin on first run) |
| `avalok server init` | Run migrations and create admin account interactively |
| `avalok server migrate` | Run database migrations only |
| `avalok server deploy` | Generate `docker-compose.yml` with auto-generated JWT secret |
| `avalok server install` | Interactive wizard to set up systemd service and PostgreSQL |
