---
weight: 300
title: "Providers"
description: "Connect to logs from any infrastructure"
icon: "extension"
---

# Providers

Providers are the connectors that let Avalok read logs from different infrastructure sources. Each provider knows how to authenticate, connect, and stream logs from a specific type of system.

You configure providers in your workspace YAML file under the `services` section:

```yaml
services:
  - name: my-service
    provider: docker
    config:
      container_name: my-app
```

## Available Providers

| Provider | Description | Use Case |
|----------|-------------|----------|
| [Docker](docker) | Container logs via `docker logs` | Docker containers on any host |
| [Kubernetes](kubernetes) | Pod logs via the Kubernetes API | Kubernetes clusters |
| [File](file) | Local log files via glob patterns | Application log files |
| [Journalctl](journalctl) | Systemd journal logs | Linux systemd services |
| [SSH](ssh) | Remote logs over SSH | Any remote Linux/Unix server |
| [Containerd](containerd) | Container logs via `crictl` | Containerd/CRI runtimes |
| [Windows Event Log](windows-eventlog) | Windows Event Log via `wevtutil` | Windows servers |
| [WinRM](winrm) | Remote logs over WinRM | Remote Windows servers |
| [IIS](iis) | IIS web server logs | IIS sites on Windows |

## Remote Targets

Some providers (Docker, File, Journalctl) can run over remote targets by configuring an SSH or WinRM connection in your workspace's `environments` section. The provider command is then executed on the remote host rather than locally.
