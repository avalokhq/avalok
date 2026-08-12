<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="web/public/avalok-dark-mode.png" />
    <source media="(prefers-color-scheme: light)" srcset="web/public/avalok-light-mode.png" />
    <img alt="avalok" src="web/public/avalok-light-mode.png" width="320" />
  </picture>
</p>

<p align="center">
  Secure, read-only log access &mdash; without granting infrastructure access.
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT License" /></a>
  <img src="https://img.shields.io/badge/go-1.26+-00ADD8?logo=go&logoColor=white" alt="Go 1.26+" />
  <img src="https://img.shields.io/badge/node-22+-339933?logo=node.js&logoColor=white" alt="Node 22+" />
  <img src="https://img.shields.io/badge/platform-linux%20%7C%20macOS%20%7C%20windows-FCC624" alt="Linux | macOS | Windows" />
  <img src="https://img.shields.io/badge/react-19-61DAFB?logo=react&logoColor=black" alt="React 19" />
  <a href="https://avalokhq.github.io/avalok/"><img src="https://img.shields.io/badge/docs-avalokhq.github.io-blue" alt="Documentation" /></a>
  <a href="https://github.com/avalokhq/avalok/pulls"><img src="https://img.shields.io/badge/PRs-welcome-brightgreen.svg" alt="PRs Welcome" /></a>
</p>

---

## Why Avalok

Your logs are scattered across servers, containers, and clusters. To read them, you need SSH keys, kubeconfigs, or direct access to machines. That's fine when you're the only one looking &mdash; but the moment someone else needs to check a log, the options aren't great:

- **Hand over credentials** and hope nothing breaks
- **SSH in yourself**, copy the output, paste it in Slack
- **Set up a full logging stack** (Elasticsearch, Loki, Datadog) just so someone can read a few lines

Avalok is the missing middle ground. One binary, one YAML file, real-time log streaming in a browser. No agents to install, no storage to provision, no infrastructure to change.

## Who It's For

**Homelab users** &mdash; You're running Proxmox, Docker containers, a k3s cluster, maybe some services on a Raspberry Pi. You want a single dashboard to tail logs across all of them without opening six SSH sessions. Run `avalok serve`, point your browser at it, done.

**Small teams & startups** &mdash; You've got a handful of servers, a few developers, and no dedicated DevOps. Setting up ELK or Loki is a weekend project you'll never get to. Avalok gives your developers log access in minutes, with scoped permissions so the intern can't see production database logs.

**Larger organizations** &mdash; You already have observability tooling, but there's always a gap. A new environment that isn't instrumented yet. A contractor who needs temporary access. A team that just needs to see logs from one service without an all-access Grafana seat. Avalok fills those gaps without touching your existing stack.

## What It Does

Avalok connects to your infrastructure using credentials you already have &mdash; SSH keys, kubeconfigs, Docker sockets, WinRM &mdash; and streams logs to a clean web dashboard. It reads logs in real time. It doesn't store them. It doesn't require agents or sidecars on your servers. It doesn't modify your infrastructure in any way.

```
 You / Your team                 Avalok                     Infrastructure
+-----------+     HTTPS     +--------+     SSH/K8s     +---------------+
|  Browser  | ------------> |  Web   | -------------> |  Your servers |
|           | <------------ |  UI    | <------------- |  & clusters   |
+-----------+   Log stream  +--------+   Log stream   +---------------+
                                |
                          No log storage.
                          Read-only access.
                          Zero infrastructure changes.
```

## How Is It Different

| | Avalok | ELK / Loki / Datadog |
|---|---|---|
| **Setup time** | Minutes | Hours to days |
| **Storage** | None &mdash; real-time streaming only | Requires dedicated storage infra |
| **Infrastructure changes** | Zero &mdash; uses your existing credentials | Agents, sidecars, exporters |
| **Cost** | Free, self-hosted | Storage, compute, licensing |
| **Access control** | Scoped per workspace, environment, or service | Varies; often all-or-nothing |
| **Complexity** | Single binary, one YAML file | Multi-component distributed system |
| **Ideal for** | Quick access, shared teams, homelabs | Full observability at scale |

Avalok is not a replacement for a full observability platform. If you need log search, alerting, dashboards, and long-term retention &mdash; use those tools. If you just need people to be able to read logs without giving them the keys to the kingdom, that's what Avalok is for.

## Two Modes

### `avalok serve` &mdash; Ephemeral

For quick, on-demand access. Run it when someone needs logs, close it when they're done. Uses your local credentials (kubeconfig, SSH keys). Nothing is persisted.

```bash
avalok serve workspace.yaml --tokens 3
```

Prints 3 access URLs. Share them with whoever needs logs. Close the terminal when done.

### `avalok server` &mdash; Persistent

For always-on access. Runs as a service so people can log in and view logs on their own, without you being online. PostgreSQL-backed with JWT auth, role-based access control, and managed credentials.

```bash
# Quick setup (interactive, handles PostgreSQL + systemd)
sudo avalok server install

# Or manual setup
avalok server init --db-url "postgres://..." --jwt-secret "..."
avalok server start -c config.yaml workspace.yaml
```

Three roles: **admin**, **manager**, **reader**. Developers register, admins approve, scoped access is granted.

## Supported Log Sources

| Provider | Description | Use Case |
|----------|-------------|----------|
| **Kubernetes** | Pods, deployments, statefulsets, daemonsets | Container logs from any k8s cluster |
| **Docker** | Container logs via Docker API | Standalone Docker hosts |
| **SSH** | Remote files or commands over SSH | Any Linux/Unix server |
| **File** | Local log files (supports glob patterns) | Direct file access, co-located services |
| **journalctl** | systemd journal (local or remote via SSH) | systemd services |
| **Containerd** | Container logs via containerd socket | Non-Docker container runtimes |
| **WinRM** | Remote files or commands over WinRM | Windows servers |
| **Windows Event Log** | Windows Event Log channels | Windows Application/System/Security logs |
| **IIS** | IIS web server logs | Windows web servers |
| **S3** | AWS S3 or S3-compatible storage | Log files in S3 buckets |
| **Azure Blob** | Azure Blob Storage | Log files in Blob containers |
| **Azure File** | Azure File Share | Log files on Azure File Shares |
| **GCS** | Google Cloud Storage | Log files in GCS buckets |

## Quick Start

### 1. Define your workspace

Create a `workspace.yaml` that describes what logs to stream and from where:

```yaml
workspace:
  name: my-app

services:
  - name: api
    provider: kubernetes
    config:
      selector: app=api

  - name: nginx
    provider: ssh
    config:
      path: /var/log/nginx/access.log

environments:
  - name: production
    targets:
      - name: prod-cluster
        type: kubernetes
        namespace: production
        context: prod-context
        service_names: [api]

      - name: web-server
        type: ssh
        host: web-01.example.com
        user: deploy
        key_path: ~/.ssh/id_ed25519
        service_names: [nginx]
```

### 2. Run

```bash
# Ephemeral mode — uses your local credentials
avalok serve workspace.yaml

# Or with scoped access tokens
avalok serve workspace.yaml --tokens 3 --allow "my-app/production/api"
```

### 3. Open the dashboard

Navigate to `http://localhost:9090` with the token from the terminal output.

## Server Mode (Persistent Deployment)

For teams that want developers to self-serve log access without an admin being online.

### Prerequisites

- PostgreSQL 15+
- A 32+ character JWT secret

### Setup

```bash
# Option 1: Interactive installer (handles PostgreSQL + systemd)
sudo avalok server install

# Option 2: Docker Compose (JWT secret auto-generated)
avalok server deploy
docker compose up -d

# Option 3: Manual
avalok server start -c config.yaml workspace.yaml
```

On first start, an admin account is created automatically and credentials are printed in the server logs.

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `AVALOK_DATABASE_URL` | PostgreSQL connection string | *required* |
| `AVALOK_JWT_SECRET` | JWT signing secret (32+ chars) | *required* |
| `AVALOK_BIND_ADDR` | Network bind address | `0.0.0.0` |
| `AVALOK_PORT` | HTTP server port | `9090` |

### RBAC

| Role | Capabilities |
|------|-------------|
| **Admin** | Full access: manage users, credentials, workspaces, resources, settings |
| **Manager** | Approve/manage user access requests |
| **Reader** | View logs within granted scope |

Scopes follow a path format: `workspace/environment/service`. A reader with scope `my-app/production/api` can only view API logs in production.

In ephemeral mode (`avalok serve`), token-based users are assigned the **viewer** role with access scoped to the `--allow` paths.

## Workspace YAML Reference

```yaml
workspace:
  name: my-app                    # required
  description: My Application

services:                          # at least one required
  - name: api-server               # unique name
    provider: kubernetes            # one of the supported providers
    friendly_name: API Server       # display name in the UI
    config:                         # provider-specific configuration
      selector: app=api
      container: app

  - name: app-logs
    provider: file
    config:
      path: /var/log/app/*.log      # glob patterns supported

environments:
  - name: production
    profile: prod-credentials       # credential profile name (server mode)
    targets:
      - name: prod-cluster
        type: kubernetes            # kubernetes, ssh, winrm, local, windows
        context: prod-context
        namespace: production
        kubeconfig: /path/to/kubeconfig
        kubeconfig_content: ""      # inline kubeconfig (alternative to file)
        api_server_url: ""          # direct API server URL
        bearer_token: ""            # k8s bearer token auth
        ca_cert: ""                 # custom CA certificate
        insecure_skip_tls: false    # skip TLS verification
        service_names: [api-server]

      - name: prod-server
        type: ssh
        host: server-01.example.com
        port: 22                    # SSH/WinRM port
        user: deploy
        password: ""                # password auth (SSH or WinRM)
        key_path: ~/.ssh/id_ed25519
        passphrase: ""              # key passphrase
        sudo: false                 # use sudo for commands
        proxy_url: ""               # SOCKS5 proxy for SSH
        credential_profile: ""     # managed credential profile (server mode)
        service_names: [app-logs]
        services:                   # per-target config overrides
          - name: app-logs
            config:
              path: /opt/myapp/logs/*.log

      - name: windows-host
        type: winrm
        host: win-01.example.com
        port: 5985
        user: admin
        password: ""
        use_https: false            # use HTTPS for WinRM
        insecure: false             # skip cert verification
        service_names: [event-logs]

settings:
  ssh_timeout: 10                  # seconds
  hierarchy: default               # default, service-first, product-first, company
```

## CLI Reference

```
avalok serve [workspace.yaml...]    Start in ephemeral mode
  --host          Bind address (default: 0.0.0.0)
  -p, --port      Port (default: 9090)
  --tokens N      Number of access tokens to generate (default: 1)
  --scope         Interactively select which environments and services to share
  --allow         Comma-separated scope paths

avalok server init                  Initialize database and create admin
  --db-url        PostgreSQL connection string
  --jwt-secret    JWT signing secret

avalok server start [workspace.yaml...]  Start persistent server
  -c, --config    Server config YAML file

avalok server migrate               Run database migrations
  --db-url        PostgreSQL connection string

avalok server deploy                Generate Docker Compose deployment files
avalok server install               Install as a systemd service (interactive)

avalok tail <workspace/env/service>  Stream logs in terminal (no web UI)
  -f, --follow    Follow log output
  -n, --tail      Number of lines (default: 50)
  -w, --workspace Workspace YAML file (required)

avalok create config                Open workspace config builder UI
  --host          Bind address (default: 127.0.0.1)
  -p, --port      Port (default: 9091)
  -o, --output    Output file path for generated YAML

avalok providers                    List available log providers
avalok version                      Print version
```

## Development Setup

### Prerequisites

- **Go 1.26+** &mdash; [go.dev/dl](https://go.dev/dl/)
- **Node.js 22+** &mdash; [nodejs.org](https://nodejs.org/) or via [nvm](https://github.com/nvm-sh/nvm) / [nvm-windows](https://github.com/coreybutler/nvm-windows)
- **PostgreSQL 15+** &mdash; only needed for server mode development

### Build

The build script checks prerequisites, installs frontend dependencies, builds the React frontend, and cross-compiles Go binaries for Linux and Windows.

```bash
# Linux / macOS
./build.sh

# Windows
build.bat
```

Binaries are output to `bin/`.

### Manual Steps

```bash
# Frontend
cd web && npm ci && npm run build && cd ..

# Copy frontend assets into Go embed directory
cp -r web/dist/* internal/server/frontend/

# Build
go mod tidy
GOOS=linux GOARCH=amd64 go build -o bin/avalok ./cmd/avalok
```

### Project Structure

```
cmd/avalok/              Entry point
internal/
  cli/                   Cobra CLI commands
  provider/              Log provider implementations
    kubernetes/          Kubernetes pod logs
    docker/              Docker container logs
    ssh/                 SSH remote logs
    file/                Local file logs
    journalctl/          systemd journal
    containerd/          Containerd container logs
    winrm/               WinRM remote logs
    windowseventlog/     Windows Event Log
    iis/                 IIS web server logs
  workspace/             Workspace YAML parsing and validation
  credential/            Credential resolution (operator / managed)
  store/                 Storage layer (memory / postgres)
  stream/                Log streaming pipeline
  server/                HTTP/WebSocket server, API routes
  auth/                  Authentication (token / JWT)
  setup/                 Server initialization and config
  logbuffer/             In-memory log ring buffer
  filebrowser/           Remote file browsing and download
  sshclient/             SSH connection management
  winrmclient/           WinRM connection management
  shellutil/             Shell command quoting utilities
  audit/                 Audit logging
web/                     React frontend (Vite + Tailwind + Monaco)
docs/                    Hugo documentation site (Lotus Docs theme)
```

### Tech Stack

**Backend:** Go, Cobra, WebSocket, PostgreSQL, JWT, bcrypt

**Frontend:** React 19, TypeScript, Vite, Tailwind CSS, Monaco Editor

## Verifying Releases

Every release binary includes SLSA Level 3 provenance, generated by the [SLSA GitHub Generator](https://github.com/slsa-framework/slsa-github-generator). You can verify that a binary was built from this repository's CI without tampering:

```bash
# Install the SLSA verifier
go install github.com/slsa-framework/slsa-verifier/v2/cli/slsa-verifier@latest

# Verify a downloaded binary
slsa-verifier verify-artifact avalok-0.1.0-linux-amd64.tar.gz \
  --provenance-path multiple.intoto.jsonl \
  --source-uri github.com/avalokhq/avalok
```

SHA256 checksums for all binaries are published in `checksums.txt` on each release.

## Documentation

Full documentation is available at [avalokhq.github.io/avalok](https://avalokhq.github.io/avalok/), covering all CLI commands, providers, server setup, workspace configuration, and guides.

## License

[MIT](LICENSE)
