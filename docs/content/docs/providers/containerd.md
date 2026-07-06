---
weight: 360
title: "Containerd"
description: "Read container logs via the crictl CLI"
icon: "view_in_ar"
---

# Containerd Provider

The Containerd provider reads container logs using the `crictl` CLI, which communicates with containerd and other CRI-compatible container runtimes. This is useful on Kubernetes nodes that use containerd as their runtime, or on standalone containerd hosts.

## How It Works

1. Uses `crictl ps --name <container_name>` to discover matching containers
2. Streams logs using `crictl logs --timestamps` with follow and tail support
3. If a custom runtime endpoint is needed, passes `--runtime-endpoint` to `crictl`

## Configuration

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `container_name` | string | yes | | Container name to filter for |
| `namespace` | string | no | `k8s.io` | Containerd namespace |
| `socket` | string | no | | Custom CRI runtime endpoint socket path (passed as `--runtime-endpoint`) |

## Prerequisites

The `crictl` CLI must be installed and available in the system PATH. On most Kubernetes nodes, it is pre-installed. The user running Avalok must have permission to communicate with the container runtime socket.

## Example

```yaml
services:
  - name: kube-proxy
    provider: containerd
    config:
      container_name: kube-proxy
```

### Custom runtime endpoint

```yaml
services:
  - name: app-container
    provider: containerd
    config:
      container_name: my-app
      socket: unix:///run/containerd/containerd.sock
```

### Non-default namespace

```yaml
services:
  - name: system-container
    provider: containerd
    config:
      container_name: coredns
      namespace: kube-system
```
