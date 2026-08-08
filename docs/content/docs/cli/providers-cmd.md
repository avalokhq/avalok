---
weight: 250
title: "providers"
description: "List all registered log providers."
icon: "list"
---

# avalok providers

List all log providers compiled into the current avalok binary. Providers are the backends that avalok uses to connect to and stream logs from different sources.

## Usage

```bash
avalok providers
```

No flags are accepted.

## Output

The command prints a sorted list of all registered provider names along with a count:

```
Available providers (14):
  - azure-blob
  - azure-file
  - containerd
  - docker
  - file
  - gcs
  - iis
  - journalctl
  - kubernetes
  - s3
  - self
  - ssh
  - windowseventlog
  - winrm
```

## Provider Descriptions

| Provider | Description |
|----------|-------------|
| `azure-blob` | Logs from Azure Blob Storage containers |
| `azure-file` | Logs from Azure File Shares |
| `containerd` | Logs from containerd-managed containers |
| `docker` | Logs from Docker containers via the Docker API |
| `file` | Tail log files on disk |
| `gcs` | Logs from Google Cloud Storage buckets |
| `iis` | IIS (Internet Information Services) web server logs on Windows |
| `journalctl` | Systemd journal logs on Linux via `journalctl` |
| `kubernetes` | Logs from Kubernetes pods via the Kubernetes API |
| `s3` | Logs from AWS S3 or S3-compatible storage |
| `self` | Avalok's own internal logs |
| `ssh` | Logs from remote hosts over SSH (wraps other providers) |
| `windowseventlog` | Windows Event Log entries |
| `winrm` | Logs from remote Windows hosts over WinRM |

## When to Use

Run `avalok providers` to verify which providers are available in your build. This is helpful for:

- Confirming that a provider you need is compiled in.
- Troubleshooting workspace configurations that reference an unknown provider.
- Checking available options when writing workspace YAML files.
