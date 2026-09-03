---
weight: 130
title: "Quick Start"
description: "Stream your first logs in under five minutes."
icon: "bolt"
---

# Quick Start

This guide walks you through streaming logs with Avalok in the fastest way possible. By the end, you'll have a running instance showing live logs in your browser.

## Fastest Path: Kubernetes Auto-Discovery

If you already have `kubectl` configured and can reach your clusters, just run:

```bash
avalok serve
```

Avalok reads your kubeconfig, discovers all reachable clusters, namespaces, and workloads, and starts streaming. No YAML file needed. Works with AKS, EKS, GKE, or any Kubernetes cluster.

Filter to specific clusters or namespaces:

```bash
# Only one cluster context
avalok serve --context my-aks-cluster

# Only specific namespaces
avalok serve --namespace default,staging
```

Open the URL printed in the terminal to see your logs. That's it.

---

## Custom Sources: Workspace YAML

For non-Kubernetes sources (Docker, SSH, files, journalctl) or fine-tuned control, create a workspace YAML file.

### Step 1: Create a Workspace Config

A workspace YAML file tells Avalok what log sources exist and how to connect to them. Create a file called `workspace.yaml`:

```yaml
workspace:
  name: my-app
  description: "My application logs"

services:
  - name: api
    provider: docker
    config:
      container: api-server

environments:
  - name: local
    targets:
      - name: localhost
        type: local
        service_names:
          - api
```

This minimal config defines one service (`api`) that reads logs from a Docker container named `api-server` on the local machine.

## Step 2: Start Avalok

```bash
avalok serve workspace.yaml
```

Avalok loads your workspace, checks connectivity to each service, and prints an access URL with a token:

```
Avalok -- secure log access broker

  Loaded workspace: my-app (My application logs)
    local: 1 targets, 1 services
      * api [docker on local target]

Access tokens:
  http://192.168.1.50:9090?token=a1b2c3d4e5f6...

Checking service connectivity...

  + my-app/local/api [docker]

  1 up, 0 down, 1 total

Listening on 0.0.0.0:9090
Press Ctrl+C to stop
```

## Step 3: Open the Web UI

Open the URL shown in the terminal. The token is embedded in the URL -- just click or paste it into your browser. You'll see the Avalok web interface with your workspace, environments, and services in the sidebar.

Click on a service to start streaming its logs in real time.

## Step 4: View Logs

The web UI provides:

- **Live streaming** -- logs appear as they're generated, like `tail -f`.
- **Search and filter** -- find specific log entries.
- **Multi-instance view** -- if a service has multiple containers or instances, logs are merged with source labels.

---

## Alternative: CLI Tailing

If you prefer the terminal, use `avalok tail` to stream logs directly:

```bash
avalok tail -w workspace.yaml -f my-app/local/api
```

The path format is `<workspace>/<environment>/<service>`. The `-f` flag enables follow mode for continuous streaming.

Options:

| Flag | Description |
|---|---|
| `-w`, `--workspace` | Path to workspace YAML file (required) |
| `-f`, `--follow` | Follow log output (live streaming) |
| `-n`, `--tail` | Number of lines to show from the end (default: 50) |

---

## Alternative: Visual Config Builder

Not sure how to write YAML? Use the built-in config builder:

```bash
avalok create config
```

This opens a browser-based UI at `http://127.0.0.1:9091/?mode=config` where you can visually configure workspaces, services, environments, and targets. When you're done, download the generated YAML file.

---

## More Examples

### Kubernetes Cluster

Stream logs from pods in a Kubernetes namespace:

```yaml
workspace:
  name: k8s-apps
  description: "Kubernetes application logs"

services:
  - name: backend
    provider: kubernetes
    config:
      label_selector: "app=backend"
      namespace: production

environments:
  - name: prod-cluster
    targets:
      - name: eks-us-east
        type: kubernetes
        kubeconfig: ~/.kube/config
        context: prod-us-east-1
        namespace: production
        service_names:
          - backend
```

```bash
avalok serve workspace.yaml
```

### SSH Remote with File Provider

Read log files from a remote server over SSH:

```yaml
workspace:
  name: infra-logs
  description: "Infrastructure server logs"

services:
  - name: nginx-access
    provider: file
    friendly_name: "Nginx Access Log"
    config:
      path: /var/log/nginx/access.log

  - name: app-logs
    provider: file
    friendly_name: "Application Logs"
    config:
      path: /var/log/myapp/app.log

environments:
  - name: production
    targets:
      - name: web-server-1
        type: ssh
        host: 10.0.1.10
        user: deploy
        key_path: ~/.ssh/id_ed25519
        service_names:
          - nginx-access
          - app-logs
```

```bash
avalok serve workspace.yaml
```

### Systemd Journal Logs

Stream journalctl output from a remote host:

```yaml
workspace:
  name: system-logs
  description: "Systemd service logs"

services:
  - name: caddy
    provider: journalctl
    friendly_name: "Caddy Web Server"
    config:
      unit: caddy

environments:
  - name: production
    targets:
      - name: proxy-server
        type: ssh
        host: proxy.example.com
        user: ops
        key_path: ~/.ssh/id_ed25519
        service_names:
          - caddy
```

---

## Next Steps

- [Configuration Reference]({{< ref "configuration" >}}) -- full workspace YAML reference with all provider options and target types.
