---
weight: 510
title: "Serve Mode"
description: "Run Avalok in local/operator mode for quick log sharing with token-based auth."
icon: "play_arrow"
---

# Serve Mode

Serve mode (`avalok serve`) is Avalok's lightweight, single-operator mode. It starts a local web server backed by in-memory storage, generates token-based access URLs, and uses the operator's local credentials (SSH keys, kubeconfig, Docker socket) to stream logs.

No database, no user accounts, no persistent state. Start it when you need it, stop it when you're done.

## When to Use Serve Mode

- **Ad-hoc debugging** -- quickly share a live log view during an incident
- **Pair debugging** -- give a colleague temporary access to specific service logs
- **Personal use** -- browse your infrastructure logs from a web UI instead of juggling terminal sessions
- **Demo and testing** -- spin up log access before committing to a full server deployment

## How It Works

1. You write one or more workspace YAML files describing your services and environments
2. `avalok serve` loads the workspaces, discovers credentials from your local environment, and starts an HTTP server
3. Access tokens are generated and printed to the console as clickable URLs
4. Anyone with a token URL can view the scoped logs through the web UI
5. When you stop the process, everything is gone -- no data persists

## Credential Discovery

In serve mode, Avalok automatically discovers credentials from the operator's environment:

| Credential Type | Discovery Location |
|---|---|
| Kubeconfig | `~/.kube/config` or the `KUBECONFIG` environment variable |
| SSH config | `~/.ssh/config` |
| SSH keys | As referenced in your workspace YAML (`key_path`) or SSH config |
| Docker socket | Local Docker daemon (default socket or `DOCKER_HOST`) |

You can override any of these by specifying explicit values in your workspace YAML targets.

## Basic Usage

Start serving a single workspace:

```bash
avalok serve workspace.yaml
```

Avalok prints the loaded workspace structure, generates an access token, checks service connectivity, and begins listening:

```
Avalok -- secure log access broker

  Loaded workspace: my-platform (Production infrastructure)
    production: 2 targets, 3 services
      * nginx [docker on ssh target]
      * api [docker on ssh target]
      * system-logs [journalctl on ssh target]

Access tokens:
  http://192.168.1.50:9090?token=a1b2c3d4e5f6...

Checking service connectivity...

  + my-platform/production/nginx [docker]
  + my-platform/production/api [docker]
  + my-platform/production/system-logs [journalctl]

  3 up, 0 down, 3 total

Listening on 0.0.0.0:9090
Press Ctrl+C to stop
```

## Multiple Workspace Files

You can load several workspace files at once. Each file is parsed independently and all workspaces are available through the same server:

```bash
avalok serve platform.yaml monitoring.yaml legacy.yaml
```

This is useful when different teams maintain separate workspace configs, or when you want to provide access to logs across multiple projects in a single session.

## Token Generation

By default, Avalok generates one access token. Use `--tokens` to generate more:

```bash
avalok serve workspace.yaml --tokens 3
```

```
Access tokens:
  http://192.168.1.50:9090?token=a1b2c3d4...
  http://192.168.1.50:9090?token=e5f6a7b8...
  http://192.168.1.50:9090?token=c9d0e1f2...
```

Each token creates a separate user session. All tokens share the same scope (if any).

## Scoping Access

By default, every token can see all workspaces, environments, and services. Scoping lets you restrict what a token holder can access.

### Interactive Scoping

Use `--scope` for an interactive prompt that walks you through selecting environments and services:

```bash
avalok serve workspace.yaml --scope
```

```
== my-platform (Production infrastructure) ==

  Environments:
    [1] staging (4 services)
    [2] production (4 services)

  Select environments (comma-separated numbers, or 'all', or 'skip'): 2

  Services in my-platform/production:
    [1] nginx (nginx) -- docker
    [2] api (api) -- docker
    [3] system-logs (system-logs) -- journalctl
    [4] app-logs (app-logs) -- file

  Select services (comma-separated numbers, or 'all'): 1,2

Scope (shared access limited to):
  * my-platform/production/nginx
  * my-platform/production/api
```

### CLI-Based Scoping

Use `--allow` for non-interactive scoping with comma-separated paths:

```bash
# Share only the production environment
avalok serve workspace.yaml --allow "my-platform/production"

# Share specific services
avalok serve workspace.yaml --allow "my-platform/production/nginx,my-platform/staging/api"

# Short names work too -- Avalok resolves them against loaded workspaces
avalok serve workspace.yaml --allow "production"
```

Scope paths follow the format `workspace/environment/service`. You can scope at any level:

| Path | Access Granted |
|---|---|
| `my-platform` | All environments and services in the workspace |
| `my-platform/production` | All services in the production environment |
| `my-platform/production/nginx` | Only the nginx service in production |
| `production` | Resolved to `my-platform/production` if unambiguous |

## Bind Address and Port

By default, Avalok binds to `0.0.0.0:9090` (all interfaces, port 9090).

```bash
# Bind to localhost only (no network access)
avalok serve workspace.yaml --host 127.0.0.1

# Use a different port
avalok serve workspace.yaml -p 8080

# Both
avalok serve workspace.yaml --host 127.0.0.1 -p 8080
```

## Security Considerations

- **Tokens are secrets.** Anyone with a token URL has full access to the scoped logs. Share tokens over secure channels (direct message, not public Slack channels).
- **Bind to 127.0.0.1** if you only need local access. Binding to `0.0.0.0` exposes the server to your entire network.
- **Use scoping** to limit what token holders can see. Don't share production database logs when someone only needs the API service.
- **Serve mode has no TLS.** If you need HTTPS, place a reverse proxy (nginx, Caddy) in front of Avalok, or use an SSH tunnel.
- **No audit trail.** Serve mode does not log who accessed what. Use [server mode]({{< ref "server-mode" >}}) if you need access logging and user management.

## Full Worked Example

This walkthrough starts from scratch: write a workspace YAML, run `avalok serve`, and access logs.

### 1. Write the workspace YAML

Create a file called `myapp.yaml`:

```yaml
name: myapp
description: "My application stack"

services:
  - name: web
    provider: docker
    config:
      container_name: myapp-web

  - name: api
    provider: docker
    config:
      container_name: myapp-api

  - name: syslog
    provider: journalctl
    config:
      unit: myapp

  - name: app-logs
    provider: file
    config:
      log_dir: /var/log/myapp
      pattern: "*.log"

environments:
  - name: staging
    targets:
      - name: staging-server
        type: ssh
        host: 10.0.1.10
        user: deploy
        key_path: ~/.ssh/id_ed25519
        service_names:
          - web
          - api
          - syslog
          - app-logs

  - name: production
    targets:
      - name: prod-server-1
        type: ssh
        host: 10.0.2.10
        user: deploy
        key_path: ~/.ssh/id_ed25519
        service_names:
          - web
          - api
          - syslog
      - name: prod-server-2
        type: ssh
        host: 10.0.2.11
        user: deploy
        key_path: ~/.ssh/id_ed25519
        service_names:
          - web
          - api
```

### 2. Start Avalok

```bash
avalok serve myapp.yaml --tokens 2
```

### 3. Share access

Copy one of the printed token URLs and send it to your colleague. They open it in a browser and see the log viewer with all configured services.

### 4. Scope it down (optional)

If your colleague only needs staging access:

```bash
avalok serve myapp.yaml --tokens 2 --allow staging
```

### 5. Stop

Press `Ctrl+C`. All tokens are invalidated, the server shuts down, and no data remains.

## CLI Reference

```
avalok serve [workspace.yaml...] [flags]
```

| Flag | Default | Description |
|---|---|---|
| `--host` | `0.0.0.0` | Bind address |
| `-p`, `--port` | `9090` | HTTP server port |
| `--tokens` | `1` | Number of access tokens to generate |
| `--scope` | `false` | Interactively select environments and services to share |
| `--allow` | | Comma-separated scope paths (e.g. `workspace/env/service`) |
