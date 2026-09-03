---
weight: 380
title: "WinRM"
description: "Read logs from remote Windows servers via WinRM"
icon: "computer"
---

# WinRM Provider

The WinRM provider connects to remote Windows servers using the Windows Remote Management protocol and streams logs by either tailing a file with `Get-Content -Wait` or running a custom PowerShell command.

## How It Works

1. Connects to the remote Windows host via WinRM (HTTP or HTTPS)
2. Runs either `Get-Content -Path <path> -Wait` (for file-based streaming) or a custom PowerShell command
3. Streams stdout and stderr back as log entries

## Configuration

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `host` | string | yes | | WinRM hostname or IP address |
| `user` | string | no | | Windows username for authentication |
| `password` | string | no | | Windows password for authentication |
| `port` | int/string | no | `5985` (HTTP) or `5986` (HTTPS) | WinRM port |
| `path` | string | no | | Remote file path to tail (uses `Get-Content -Wait` in follow mode) |
| `command` | string | no | | Custom PowerShell command to run |
| `use_https` | bool | no | `false` | Use HTTPS (port defaults to 5986 when enabled) |
| `insecure` | bool | no | `false` | Skip TLS certificate verification for HTTPS connections |

Either `path` or `command` must be provided. If both are set, `command` takes precedence.

## Prerequisites

WinRM must be enabled and configured for Basic authentication on the target Windows server. Run in an elevated PowerShell:

```powershell
winrm quickconfig -force
winrm set winrm/config/service/auth '@{Basic="true"}'
winrm set winrm/config/service '@{AllowUnencrypted="true"}'
Restart-Service WinRM
```

Verify with `winrm get winrm/config/service/auth` — confirm `Basic = true`.

For HTTPS, a valid SSL certificate must be configured on the WinRM listener, or use `insecure: true` for self-signed certificates.

If you run into connection or authentication errors, see the [Troubleshooting]({{< relref "../guides/troubleshooting#winrm-connections" >}}) guide.

## Examples

### Tail a remote log file

```yaml
services:
  - name: app-logs
    provider: winrm
    config:
      host: 10.0.1.100
      user: Administrator
      password: "${WINRM_PASSWORD}"
      path: C:\logs\myapp\app.log
```

### Custom PowerShell command

```yaml
services:
  - name: iis-requests
    provider: winrm
    config:
      host: 10.0.1.100
      user: Administrator
      password: "${WINRM_PASSWORD}"
      command: "Get-Content -Path 'C:\\inetpub\\logs\\LogFiles\\W3SVC1\\*.log' -Wait -Tail 50"
```

### HTTPS connection

```yaml
services:
  - name: secure-logs
    provider: winrm
    config:
      host: 10.0.1.100
      user: deploy
      password: "${WINRM_PASSWORD}"
      path: C:\logs\app.log
      use_https: true
      port: 5986
```

### HTTPS with self-signed certificate

```yaml
services:
  - name: dev-logs
    provider: winrm
    config:
      host: 10.0.1.100
      user: deploy
      password: "${WINRM_PASSWORD}"
      path: C:\logs\app.log
      use_https: true
      insecure: true
```
