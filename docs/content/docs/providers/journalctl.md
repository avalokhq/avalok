---
weight: 340
title: "Journalctl"
description: "Read systemd journal logs"
icon: "terminal"
---

# Journalctl Provider

The Journalctl provider reads logs from the systemd journal using the `journalctl` command. It can run locally or over SSH for remote servers. Output uses `--no-pager -o short-iso` format for consistent timestamp parsing.

## How It Works

1. Builds a `journalctl` command with the configured unit, priority, and stream options
2. Runs the command locally or over an SSH connection if `host` is set
3. Parses output in `short-iso` format

## Configuration

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `unit` | string | no | | Systemd unit name (passed as `-u <unit>`). If omitted, reads the full system journal. |
| `priority` | string | no | | Filter by priority (passed as `-p <priority>`). Values: `emerg`, `alert`, `crit`, `err`, `warning`, `notice`, `info`, `debug`. |
| `sudo` | bool | no | `false` | Run `journalctl` with `sudo`. Required for reading some system journals. |
| `host` | string | no | | SSH host to run `journalctl` on remotely. When set, the provider connects via SSH. |

### SSH Fields (when `host` is set)

When `host` is configured, the provider establishes an SSH connection and accepts all standard SSH config fields:

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `user` | string | no | current user | SSH username |
| `port` | int/string | no | `22` | SSH port |
| `key_path` | string | no | | Path to SSH private key |
| `private_key` | string | no | | Inline SSH private key content |
| `password` | string | no | | SSH password |
| `passphrase` | string | no | | Passphrase for encrypted SSH key |

## Examples

### Local systemd service

```yaml
services:
  - name: nginx-journal
    provider: journalctl
    config:
      unit: nginx
```

### With priority filter and sudo

```yaml
services:
  - name: system-errors
    provider: journalctl
    config:
      priority: err
      sudo: true
```

### Remote server via SSH

```yaml
services:
  - name: remote-app
    provider: journalctl
    config:
      unit: myapp
      host: 10.0.1.20
      user: deploy
      key_path: ~/.ssh/id_ed25519
```

### Full system journal (no unit filter)

```yaml
services:
  - name: system-journal
    provider: journalctl
    config:
      sudo: true
```

### Remote with password auth

```yaml
services:
  - name: remote-service
    provider: journalctl
    config:
      unit: api-server
      host: 10.0.1.30
      user: admin
      password: "${SSH_PASSWORD}"
      sudo: true
```
