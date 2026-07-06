---
weight: 350
title: "SSH"
description: "Read logs from remote servers over SSH"
icon: "key"
---

# SSH Provider

The SSH provider connects to remote Linux/Unix servers via SSH and streams logs by either tailing a file or running a custom command. It handles authentication, keepalive, and real-time streaming over the SSH connection.

## How It Works

1. Connects to the remote host via SSH
2. Runs either `tail -f <path>` (for file-based streaming) or a custom command
3. Streams stdout and stderr back as log entries
4. Sends keepalive packets every 30 seconds to prevent connection drops

## Configuration

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `host` | string | yes | | SSH hostname or IP address |
| `user` | string | no | current user | SSH username |
| `port` | int/string | no | `22` | SSH port |
| `path` | string | no | | Remote file path to tail (uses `tail -f` in follow mode) |
| `command` | string | no | | Custom command to run on the remote host |
| `key_path` | string | no | | Path to SSH private key file |
| `private_key` | string | no | | Inline SSH private key content |
| `password` | string | no | | SSH password |
| `passphrase` | string | no | | Passphrase for encrypted SSH keys |
| `sudo` | bool | no | `false` | Prepend `sudo` to the remote command |

Either `path` or `command` must be provided. If both are set, `command` takes precedence.

## Authentication

The provider tries authentication methods in this order:

1. **Inline private key** (`private_key`) -- key content embedded in config
2. **Key file** (`key_path`) -- path to a private key on disk
3. **Password** (`password`) -- password-based auth
4. **Default keys** -- tries `~/.ssh/id_ed25519`, `~/.ssh/id_rsa`, and `~/.ssh/id_ecdsa` in order

If a `passphrase` is set, it is used to decrypt any encrypted private key.

## Examples

### Tail a remote log file

```yaml
services:
  - name: app-logs
    provider: ssh
    config:
      host: 10.0.1.10
      user: deploy
      path: /var/log/myapp/app.log
      key_path: ~/.ssh/id_ed25519
```

### Custom command

```yaml
services:
  - name: docker-logs
    provider: ssh
    config:
      host: 10.0.1.10
      user: deploy
      command: docker logs -f --tail 100 my-container
```

### With sudo

```yaml
services:
  - name: syslog
    provider: ssh
    config:
      host: 10.0.1.10
      user: deploy
      path: /var/log/syslog
      sudo: true
```

### Inline private key

Useful for managed credentials in Avalok Server:

```yaml
services:
  - name: remote-logs
    provider: ssh
    config:
      host: 10.0.1.10
      user: deploy
      path: /var/log/app.log
      private_key: |
        -----BEGIN OPENSSH PRIVATE KEY-----
        b3BlbnNzaC1rZXktdjEAAAAABG5v...
        -----END OPENSSH PRIVATE KEY-----
```

### Password authentication

```yaml
services:
  - name: legacy-server
    provider: ssh
    config:
      host: 10.0.1.50
      user: admin
      password: "${SSH_PASSWORD}"
      path: /var/log/app/output.log
      port: 2222
```
