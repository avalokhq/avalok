---
weight: 210
title: "serve"
description: "Start avalok in local/operator mode with token-based auth and embedded web UI."
icon: "play_arrow"
---

# avalok serve

Start avalok in local (operator) mode. When run without arguments, auto-discovers Kubernetes clusters from your kubeconfig. When given workspace YAML files, loads those instead. Generates access tokens and starts an HTTP server with the embedded web UI.

All state is kept in memory -- nothing is persisted to disk or a database. When avalok stops, all tokens and session data are gone.

## Usage

```bash
# Auto-discover Kubernetes clusters
avalok serve [flags]

# Load explicit workspace YAML files
avalok serve [workspace.yaml...] [flags]
```

When no YAML files are provided, avalok reads your kubeconfig (`~/.kube/config` or `$KUBECONFIG`), connects to each cluster context, and discovers all namespaces and workloads (deployments, statefulsets, daemonsets). Works with any Kubernetes cluster -- AKS, EKS, GKE, or self-managed.

## Flags

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--host` | string | `0.0.0.0` | Bind address (`0.0.0.0` for all interfaces, `127.0.0.1` for localhost only) |
| `-p`, `--port` | int | `9090` | HTTP server port |
| `--tokens` | int | `1` | Number of access tokens to generate |
| `--scope` | bool | `false` | Interactively select which environments and services to share |
| `--allow` | string | | Comma-separated scope paths (e.g. `workspace/env/service`) |
| `--kubeconfig` | string | `~/.kube/config` | Path to kubeconfig file (auto-discovery only) |
| `--context` | string | all | Comma-separated Kubernetes contexts to discover (auto-discovery only) |
| `-n`, `--namespace` | string | all non-system | Comma-separated namespaces to include (auto-discovery only) |
| `--all-namespaces` | bool | `false` | Include system namespaces like kube-system (auto-discovery only) |

## How It Works

### With YAML files

1. **Loads workspace configs** -- Parses each YAML file and registers all environments, targets, and services.
2. **Discovers credentials** -- Uses the operator's local environment to find credentials. For Kubernetes targets, it reads your kubeconfig. For SSH targets, it uses your SSH config and keys.
3. **Checks connectivity** -- Connects to every configured service and reports which are reachable (`up`) and which are not (`down`).
4. **Generates access tokens** -- Creates the requested number of viewer tokens. Each token grants read-only access to the web UI.
5. **Starts HTTP server** -- Serves the web UI and log streaming API on the configured address and port.

### Without arguments (auto-discovery)

1. **Reads kubeconfig** -- Loads all contexts from your kubeconfig file.
2. **Discovers clusters** -- Connects to each Kubernetes context (with a 10s timeout) and skips unreachable ones.
3. **Discovers workloads** -- For each reachable cluster, lists non-system namespaces and finds all deployments, statefulsets, and daemonsets.
4. **Generates workspaces** -- Creates one workspace per cluster context, with namespaces as environments and workloads as services.
5. **Checks connectivity and starts** -- Same as YAML mode from step 3 onward.

## Examples

### Auto-discover all clusters

```bash
avalok serve
```

Output:

```
Avalok -- secure log access broker

Discovering Kubernetes clusters...

  Discovering cluster: aks-prod-westus ...
    found 3 namespaces, 12 workloads
  Discovering cluster: eks-staging ...
    found 2 namespaces, 5 workloads
  Discovering cluster: minikube ...
    ! skipping: cluster unreachable: ...

  Loaded workspace: aks-prod-westus (AKS cluster (auto-discovered))
    default: 1 target, 4 services
      * api [kubernetes on kubernetes target]
      * web [kubernetes on kubernetes target]
    monitoring: 1 target, 3 services
      * prometheus [kubernetes on kubernetes target]

Access tokens:
  http://192.168.1.50:9090?token=a1b2c3d4e5f6...
```

### Filter to specific contexts or namespaces

```bash
# Only discover a specific cluster
avalok serve --context aks-prod-westus

# Only include specific namespaces
avalok serve --namespace default,staging

# Include system namespaces too
avalok serve --all-namespaces

# Use a custom kubeconfig
avalok serve --kubeconfig /path/to/kubeconfig
```

### Basic usage with a workspace YAML

```bash
avalok serve workspace.yaml
```

Output:

```
Avalok -- secure log access broker

  Loaded workspace: my-infra (Production infrastructure)
    production: 3 targets, 8 services
      * nginx [docker on ssh target]
      * api [kubernetes on kubernetes target]
      * postgres [journalctl on ssh target]

Access tokens:
  http://192.168.1.50:9090?token=a1b2c3d4e5f6...

Checking service connectivity...

  + my-infra/production/nginx [docker]
  + my-infra/production/api [kubernetes]
  + my-infra/production/postgres [journalctl]

  3 up, 0 down, 3 total

Listening on 0.0.0.0:9090
Press Ctrl+C to stop
```

### Multiple workspaces

```bash
avalok serve production.yaml staging.yaml dev.yaml
```

### Custom port with multiple tokens

```bash
avalok serve workspace.yaml --port 8080 --tokens 5
```

Generates 5 separate access tokens, each with its own URL. Useful for distributing access to multiple team members.

### Scoped sharing with interactive selection

```bash
avalok serve workspace.yaml --scope
```

Prompts you to select which environments and services to expose:

```
-- my-infra (Production infrastructure) --

  Environments:
    [1] production (8 services)
    [2] staging (4 services)

  Select environments (comma-separated numbers, or 'all', or 'skip'): 1

  Services in my-infra/production:
    [1] nginx (nginx) -- docker
    [2] api (api) -- kubernetes
    [3] postgres (postgres) -- journalctl

  Select services (comma-separated numbers, or 'all'): 1,2
```

Token holders will only see the selected services.

### Scoped sharing with explicit paths

```bash
avalok serve workspace.yaml --allow "my-infra/production/nginx,my-infra/production/api"
```

Restricts token access to only the `nginx` and `api` services in the `production` environment.

### Short scope names

Scope paths support short names that auto-resolve against loaded workspaces. If a bare name uniquely matches a workspace, environment, or service, it is expanded to the full path:

```bash
# These are equivalent if "production" is unambiguous
avalok serve workspace.yaml --allow "production"
avalok serve workspace.yaml --allow "my-infra/production"
```

### Localhost-only binding

```bash
avalok serve workspace.yaml --host 127.0.0.1
```

Binds only to localhost -- the web UI is not accessible from other machines on the network. Useful when you only need local access or are forwarding through SSH.
