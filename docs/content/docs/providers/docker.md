---
weight: 310
title: "Docker"
description: "Stream logs from Docker containers"
icon: "deployed_code"
---

# Docker Provider

The Docker provider reads container logs using the `docker logs` CLI command. It supports streaming, tailing, time-based filtering, and works with both local and remote Docker daemons.

## How It Works

1. Runs `docker ps --filter name=<container_name>` to discover matching containers
2. Streams logs from each matched container using `docker logs --follow --timestamps`
3. Parses RFC3339 timestamps from Docker's output

## Configuration

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `container_name` | string | yes | | Container name or filter pattern passed to `docker ps --filter name=` |
| `host` | string | no | | Docker daemon host (passed as `docker -H <host>`). Use for remote Docker daemons over TCP. |

## Streaming Options

The Docker provider supports all standard stream options:

- **follow** -- continuously stream new log lines
- **tail** -- number of recent lines to start with
- **since** -- only show logs after this timestamp (RFC3339)
- **until** -- only show logs before this timestamp (RFC3339)
- **timestamps** -- always enabled; Docker timestamps are parsed automatically

## Examples

### Basic container logs

```yaml
services:
  - name: web-app
    provider: docker
    config:
      container_name: nginx
```

### Filter by container name pattern

The `container_name` value is passed as a filter to `docker ps`, so partial matches work:

```yaml
services:
  - name: api-services
    provider: docker
    config:
      container_name: api-
```

### Remote Docker daemon

Connect to a Docker daemon on another host via TCP:

```yaml
services:
  - name: remote-app
    provider: docker
    config:
      container_name: my-app
      host: tcp://10.0.1.50:2375
```

### Over an SSH target

When used with an SSH target in your workspace, the `docker` command runs on the remote host:

```yaml
services:
  - name: web-app
    provider: docker
    config:
      container_name: nginx

environments:
  - name: production
    targets:
      - name: docker-host
        type: ssh
        host: 10.0.1.50
        user: deploy
        key_path: ~/.ssh/id_ed25519
        service_names:
          - web-app
```
