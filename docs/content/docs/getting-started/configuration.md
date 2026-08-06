---
weight: 140
title: "Configuration Reference"
description: "Complete workspace YAML configuration reference for Avalok."
icon: "settings"
---

# Configuration Reference

Avalok uses YAML workspace files to define what logs to stream and how to connect to them. This page is the full reference for the workspace format.

## File Structure Overview

A workspace file has four top-level sections:

```yaml
workspace:
  name: my-workspace
  description: "Human-readable description"

services:
  - name: ...
    provider: ...
    config: ...

environments:
  - name: ...
    targets:
      - name: ...
        type: ...
        service_names: [...]

settings:
  ssh_timeout: 30
  hierarchy: default
```

---

## `workspace`

Metadata about the workspace.

| Field | Type | Required | Description |
|---|---|---|---|
| `name` | string | Yes | Unique workspace identifier. Used in log paths (`workspace/environment/service`). |
| `description` | string | No | Human-readable description shown in the UI. |

```yaml
workspace:
  name: acme-platform
  description: "ACME Corp production and staging services"
```

---

## `services`

A list of log source definitions. Each service maps to a log provider (Docker, Kubernetes, file, etc.) and its configuration.

| Field | Type | Required | Description |
|---|---|---|---|
| `name` | string | Yes | Unique identifier for the service. Use lowercase kebab-case (e.g., `api-server`). |
| `provider` | string | Yes | Log provider type. See [available providers](#available-providers). |
| `friendly_name` | string | No | Display name shown in the UI instead of `name`. |
| `config` | map | No | Provider-specific configuration. Keys and values depend on the provider. |

```yaml
services:
  - name: api
    provider: docker
    friendly_name: "API Server"
    config:
      container: api-server

  - name: nginx-access
    provider: file
    friendly_name: "Nginx Access Log"
    config:
      path: /var/log/nginx/access.log
```

### Available Providers

| Provider | Description |
|---|---|
| `docker` | Docker container logs via the Docker API. |
| `kubernetes` | Kubernetes pod logs via the Kubernetes API. |
| `journalctl` | Systemd journal logs (via `journalctl` command). |
| `file` | Plain log files (local or remote via SSH). |
| `ssh` | Generic command execution over SSH for log retrieval. |
| `containerd` | containerd container logs. |
| `winrm` | Windows Remote Management command execution. |
| `windowseventlog` | Windows Event Log entries. |
| `iis` | IIS web server logs. |
| `self` | Avalok's own internal logs. |

---

## `environments`

A list of deployment environments. Each environment contains one or more targets -- the machines or clusters where services run.

| Field | Type | Required | Description |
|---|---|---|---|
| `name` | string | Yes | Environment identifier (e.g., `production`, `staging`, `dev`). |
| `profile` | string | No | Credential profile name. Used in server mode for managed credentials. |
| `targets` | list | Yes | List of target definitions. |

```yaml
environments:
  - name: production
    targets:
      - name: web-1
        type: ssh
        host: 10.0.1.10
        user: deploy
        key_path: ~/.ssh/id_ed25519
        service_names:
          - api
          - nginx-access
```

---

## `targets`

A target is a machine, cluster, or local system where services run. The fields available depend on the target `type`.

### Common Fields

| Field | Type | Required | Description |
|---|---|---|---|
| `name` | string | Yes | Target identifier (e.g., `web-1`, `k8s-prod`). |
| `type` | string | Yes | Target type. One of: `ssh`, `kubernetes`, `winrm`, `local`, `windows`. |
| `credential_profile` | string | No | Reference to a managed credential profile (server mode). Overrides environment-level `profile`. |

### Service Binding

Each target must declare which services it provides. There are two ways to bind services:

**Simple binding** -- list service names:

```yaml
targets:
  - name: web-1
    type: ssh
    host: 10.0.1.10
    user: deploy
    service_names:
      - api
      - nginx-access
```

**Binding with config overrides** -- override service-level config per target:

```yaml
targets:
  - name: web-1
    type: ssh
    host: 10.0.1.10
    user: deploy
    services:
      - name: api
        config:
          container: api-server-web1
      - name: nginx-access
        config:
          path: /var/log/nginx/web1-access.log
```

You can mix both `service_names` and `services` on the same target if some services need overrides and others don't.

---

### Target Type: `ssh`

Connect to a remote host over SSH. Used with providers like `file`, `journalctl`, `docker`, and `containerd` to stream logs from remote machines.

| Field | Type | Default | Description |
|---|---|---|---|
| `host` | string | -- | Hostname or IP address. |
| `user` | string | -- | SSH username. |
| `port` | string | `22` | SSH port. |
| `key_path` | string | -- | Path to SSH private key file. |
| `password` | string | -- | SSH password (not recommended; use keys). |
| `passphrase` | string | -- | Passphrase for encrypted private keys. |
| `sudo` | bool | `false` | Run commands with `sudo`. |

```yaml
- name: app-server
  type: ssh
  host: 10.0.1.50
  user: deploy
  key_path: ~/.ssh/id_ed25519
  service_names:
    - api
```

### Target Type: `kubernetes`

Connect to a Kubernetes cluster. Used with the `kubernetes` provider to stream pod logs.

| Field | Type | Default | Description |
|---|---|---|---|
| `kubeconfig` | string | -- | Path to kubeconfig file. |
| `kubeconfig_content` | string | -- | Inline kubeconfig YAML content (for server mode / managed credentials). |
| `context` | string | -- | Kubeconfig context to use. |
| `namespace` | string | -- | Default namespace. Can be overridden in service config. |
| `proxy_url` | string | -- | HTTP proxy for API requests. |
| `api_server_url` | string | -- | Direct API server URL (bypass kubeconfig). |
| `bearer_token` | string | -- | Bearer token for API authentication. |
| `ca_cert` | string | -- | CA certificate for TLS verification. |
| `insecure_skip_tls` | bool | `false` | Skip TLS certificate verification. |

```yaml
- name: eks-prod
  type: kubernetes
  kubeconfig: ~/.kube/config
  context: prod-us-east-1
  namespace: default
  service_names:
    - backend
    - worker
```

### Target Type: `winrm`

Connect to a Windows host via WinRM. Used with providers like `windowseventlog`, `iis`, and `file`.

| Field | Type | Default | Description |
|---|---|---|---|
| `host` | string | -- | Hostname or IP address. |
| `user` | string | -- | WinRM username. |
| `password` | string | -- | WinRM password. |
| `port` | string | `5985` | WinRM port. |
| `use_https` | bool | `false` | Use HTTPS (port 5986 by convention). |
| `insecure` | bool | `false` | Skip TLS certificate verification. |

```yaml
- name: iis-server
  type: winrm
  host: 10.0.2.20
  user: Administrator
  password: "{{ .Env.WINRM_PASSWORD }}"
  service_names:
    - iis-logs
    - event-log
```

### Target Type: `local`

The local machine where Avalok is running. No connection fields needed.

```yaml
- name: localhost
  type: local
  service_names:
    - api
```

### Target Type: `windows`

The local Windows machine. No connection fields needed. Used with Windows-specific providers like `windowseventlog` and `iis`.

```yaml
- name: this-machine
  type: windows
  service_names:
    - event-log
```

---

## `settings`

Optional workspace-level settings.

| Field | Type | Default | Description |
|---|---|---|---|
| `ssh_timeout` | int | -- | SSH connection timeout in seconds. |
| `hierarchy` | string | `default` | UI hierarchy template for organizing the sidebar tree. |

### Hierarchy Templates

The `hierarchy` setting controls how the sidebar tree is organized:

| Template | Structure | Description |
|---|---|---|
| `default` | Workspace > Environment > Service | Standard grouping. |
| `service-first` | Workspace > Service > Environment | Group by service across environments. |
| `product-first` | Product > Service > Environment | Product-oriented grouping. |
| `company` | Company > Product > Service > Environment | Multi-product enterprise grouping. |

```yaml
settings:
  ssh_timeout: 30
  hierarchy: service-first
```

---

## Complete Example

A real-world workspace with multiple providers, environments, and targets:

```yaml
workspace:
  name: acme-platform
  description: "ACME Corp platform services"

services:
  - name: api
    provider: docker
    friendly_name: "API Gateway"
    config:
      container: api-gateway

  - name: backend
    provider: kubernetes
    friendly_name: "Backend Service"
    config:
      label_selector: "app=backend"

  - name: nginx
    provider: file
    friendly_name: "Nginx Access Log"
    config:
      path: /var/log/nginx/access.log

  - name: auth-service
    provider: journalctl
    friendly_name: "Auth Service"
    config:
      unit: auth-service

  - name: event-log
    provider: windowseventlog
    friendly_name: "Windows Event Log"
    config:
      log_name: Application

environments:
  - name: production
    targets:
      - name: k8s-prod
        type: kubernetes
        kubeconfig: ~/.kube/config
        context: prod-cluster
        namespace: production
        service_names:
          - backend

      - name: web-1
        type: ssh
        host: 10.0.1.10
        user: deploy
        key_path: ~/.ssh/id_ed25519
        service_names:
          - api
          - nginx
          - auth-service

      - name: web-2
        type: ssh
        host: 10.0.1.11
        user: deploy
        key_path: ~/.ssh/id_ed25519
        services:
          - name: api
          - name: nginx
            config:
              path: /var/log/nginx/web2-access.log

  - name: staging
    targets:
      - name: staging-server
        type: ssh
        host: staging.example.com
        user: deploy
        key_path: ~/.ssh/id_ed25519
        sudo: true
        service_names:
          - api
          - nginx
          - auth-service

  - name: windows-infra
    targets:
      - name: win-server-1
        type: winrm
        host: 10.0.2.20
        user: Administrator
        password: "supersecret"
        service_names:
          - event-log

settings:
  ssh_timeout: 30
  hierarchy: default
```

Run it:

```bash
avalok serve workspace.yaml
```

---

## Validation Rules

Avalok validates your workspace file on load and will reject configs with errors. The rules are:

- `workspace.name` is **required** and must not be empty.
- At least **one service** must be defined.
- Every service must have a `name` and a `provider`.
- Service names must be **unique** within the workspace.
- Every environment must have a `name`.
- Every target must have a `name` and a `type`.
- All service names referenced in `service_names` or `services` overrides must match a defined service.
- Duplicate service names are rejected.

{{< alert context="info" >}}
Use `avalok create config` to build workspace files visually. The config builder enforces these rules as you go, so you don't have to remember them.
{{< /alert >}}
