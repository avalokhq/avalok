---
weight: 330
title: "File"
description: "Read local log files using glob patterns"
icon: "description"
---

# File Provider

The File provider reads log files from the local filesystem. It supports glob patterns to match multiple files and can tail files for real-time streaming.

## How It Works

1. Expands the `path` glob pattern to find matching files
2. Each matched file becomes a separate instance you can stream
3. In follow mode, polls the file for new content every 100ms
4. When tailing, seeks to the last N lines before streaming

## Configuration

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `path` | string | yes | | File path or glob pattern (e.g. `/var/log/app/*.log`) |
| `read_all` | bool | no | `false` | When `true`, reads the entire file from the beginning. When `false`, tails from the end based on the tail option. |

## Follow Mode

In follow mode, the provider continuously polls the file for new content at 100ms intervals, similar to `tail -f`. When the file is empty, an informational message is emitted while waiting for new log lines.

## Remote Files

When used with an SSH or WinRM target in your workspace, the file provider runs on the remote host. This lets you tail log files on remote servers without setting up the SSH provider manually.

## Examples

### Single log file

```yaml
services:
  - name: app-logs
    provider: file
    config:
      path: /var/log/myapp/app.log
```

### Glob pattern for multiple files

```yaml
services:
  - name: all-app-logs
    provider: file
    config:
      path: /var/log/myapp/*.log
```

### Read entire file

```yaml
services:
  - name: boot-log
    provider: file
    config:
      path: /var/log/boot.log
      read_all: true
```

### Remote file over SSH target

```yaml
services:
  - name: nginx-access
    provider: file
    config:
      path: /var/log/nginx/access.log

environments:
  - name: production
    targets:
      - name: web-server
        type: ssh
        host: 10.0.1.10
        user: deploy
        key_path: ~/.ssh/id_ed25519
        service_names:
          - nginx-access
```
