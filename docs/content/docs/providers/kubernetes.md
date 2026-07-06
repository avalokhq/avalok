---
weight: 320
title: "Kubernetes"
description: "Stream logs from Kubernetes pods and workloads"
icon: "cloud"
---

# Kubernetes Provider

The Kubernetes provider reads pod logs using the Kubernetes API via the Go `client-go` library. It supports multiple authentication methods, workload-level targeting (deployments, statefulsets, daemonsets), and multi-container pods.

## How It Works

1. Connects to the Kubernetes API using the configured auth method
2. If a workload name is given (deployment, statefulset, daemonset), resolves its label selector automatically
3. Lists pods matching the selector or pod name
4. Streams logs from the Kubernetes API with timestamp parsing

## Configuration

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `kubeconfig` | string | no | | Path to a kubeconfig file |
| `kubeconfig_content` | string | no | | Inline kubeconfig YAML content |
| `context` | string | no | | Kubernetes context to use from the kubeconfig |
| `namespace` | string | no | `default` | Kubernetes namespace |
| `selector` | string | no | | Label selector (e.g. `app=nginx`). Overrides workload-based selectors. |
| `container` | string | no | | Specific container name within the pod |
| `all_containers` | bool | no | `false` | Stream logs from all containers in the pod, including init containers |
| `previous` | bool | no | `false` | Stream logs from the previous container instance (useful for crash loops) |
| `deployment` | string | no | | Deployment name. Auto-resolves to the deployment's label selector. |
| `statefulset` | string | no | | StatefulSet name. Auto-resolves to the statefulset's label selector. |
| `daemonset` | string | no | | DaemonSet name. Auto-resolves to the daemonset's label selector. |
| `pod` | string | no | | Specific pod name (bypasses selector-based discovery) |
| `tail_lines` | int | no | | Number of recent log lines to fetch on start |
| `proxy_url` | string | no | | HTTP proxy URL for the Kubernetes API connection |
| `bearer_token` | string | no | | Bearer token for API authentication |
| `api_server_url` | string | no | | Kubernetes API server URL (required when using `bearer_token`) |
| `insecure_skip_tls` | bool | no | `false` | Skip TLS certificate verification |
| `ca_cert` | string | no | | CA certificate for TLS verification. Accepts raw PEM or base64-encoded PEM. |

## Authentication Methods

The provider tries authentication in this order:

1. **Inline kubeconfig** (`kubeconfig_content`) -- full kubeconfig YAML embedded in the workspace config
2. **Kubeconfig file** (`kubeconfig`) -- path to a kubeconfig file on disk
3. **Bearer token** (`bearer_token` + `api_server_url`) -- direct API authentication
4. **In-cluster config** -- automatic when Avalok runs inside a Kubernetes pod

## Workload Resolution

When you specify `deployment`, `statefulset`, or `daemonset`, the provider fetches the workload object and extracts its `.spec.selector.matchLabels` to build a label selector. This means you can target a deployment by name and automatically stream logs from all its pods, including during rollouts.

## Examples

### Using default kubeconfig

Stream logs from a deployment using your default `~/.kube/config`:

```yaml
services:
  - name: api
    provider: kubernetes
    config:
      deployment: api-server
      namespace: production
      tail_lines: 100
```

### Specific kubeconfig and context

```yaml
services:
  - name: worker
    provider: kubernetes
    config:
      kubeconfig: /home/deploy/.kube/staging-config
      context: staging-cluster
      deployment: background-worker
      namespace: jobs
```

### Inline kubeconfig

Useful for managed credentials in Avalok Server:

```yaml
services:
  - name: api
    provider: kubernetes
    config:
      kubeconfig_content: |
        apiVersion: v1
        kind: Config
        clusters:
          - cluster:
              server: https://k8s.example.com:6443
              certificate-authority-data: LS0t...
            name: prod
        contexts:
          - context:
              cluster: prod
              user: deploy
              namespace: production
            name: prod
        current-context: prod
        users:
          - name: deploy
            user:
              token: eyJhbG...
      deployment: api-server
      namespace: production
```

### Bearer token authentication

```yaml
services:
  - name: monitoring
    provider: kubernetes
    config:
      api_server_url: https://k8s.example.com:6443
      bearer_token: eyJhbGciOiJSUzI1NiIs...
      ca_cert: |
        -----BEGIN CERTIFICATE-----
        MIIDQTCCAimgAwIBAgI...
        -----END CERTIFICATE-----
      namespace: monitoring
      selector: app=prometheus
```

### Label selector

```yaml
services:
  - name: frontend
    provider: kubernetes
    config:
      selector: app=frontend,tier=web
      namespace: production
      all_containers: true
```

### All containers with previous logs

Useful for debugging crash loops:

```yaml
services:
  - name: crashing-pod
    provider: kubernetes
    config:
      pod: my-pod-abc123
      namespace: default
      all_containers: true
      previous: true
```

### Through a proxy

```yaml
services:
  - name: internal-api
    provider: kubernetes
    config:
      kubeconfig: ~/.kube/config
      proxy_url: http://corporate-proxy:8080
      deployment: internal-api
      namespace: production
```
