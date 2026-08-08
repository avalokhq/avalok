---
weight: 110
title: "Introduction"
description: "What is Avalok, who it's for, and what it can do."
icon: "info"
---

# What is Avalok?

**Unified log streaming across your entire infrastructure.**

Avalok is an open-source, single-binary log streaming tool that gives you real-time access to logs from Docker, Kubernetes, systemd, plain files, SSH remotes, containerd, WinRM hosts, Windows Event Log, IIS, and cloud storage (S3, Azure Blob, Azure File, GCS) -- all through one interface. No agents to install, no log pipeline to maintain. Point Avalok at your infrastructure and start reading logs immediately.

Avalok ships as a single Go binary with an embedded web UI. Download it, write a short YAML config, and run `avalok serve`. That's it.

## Who is Avalok for?

- **DevOps and SRE teams** who need a fast, low-ceremony way to access logs across environments without granting direct infrastructure access.
- **Developers** who want to tail logs from staging or production containers without learning `kubectl logs`, SSH, or provider-specific CLIs.
- **Platform teams** building internal developer platforms who need a centralized, RBAC-controlled log viewer.
- **On-call engineers** who need to pull logs from multiple sources during an incident without jumping between terminals.

## Key Features

| Feature | Description |
|---|---|
| **14 log providers** | Docker, Kubernetes, journalctl (systemd), file, SSH, containerd, WinRM, Windows Event Log, IIS, S3, Azure Blob, Azure File, GCS, and a built-in self-log provider. |
| **Real-time streaming** | Logs stream live over WebSocket with follow mode -- like `tail -f` for your whole stack. |
| **Embedded web UI** | A full browser-based log viewer is compiled into the binary. No separate frontend to deploy. |
| **CLI tailing** | Use `avalok tail` to stream logs directly in your terminal, with multi-instance merge. |
| **File browser** | Browse, view, and download files on remote hosts through the web UI. Supports compressed archives. |
| **RBAC and scoped access** | Control which workspaces, environments, and services each user can see. |
| **Credential management** | In server mode, store and manage SSH keys, kubeconfigs, and passwords centrally with encrypted storage. |
| **Visual config builder** | Run `avalok create config` to open a browser-based workspace YAML builder -- no manual YAML editing required. |
| **Kubernetes resource browser** | Browse namespaces, deployments, pods, and services directly in the web UI. |
| **Cloud storage browser** | Browse and stream log files from S3, Azure Blob, Azure File, and GCS buckets with a built-in folder navigator. |
| **Command palette** | Press Ctrl+K to fuzzy-search across all entities, pages, and settings. |
| **Workspace hierarchy** | Organize logs by workspace, environment, and service. Choose from four hierarchy templates. |

## Two Modes of Operation

Avalok runs in two distinct modes depending on your needs:

### `avalok serve` -- Local / Operator Mode

Designed for individual use or quick sharing. You point Avalok at one or more workspace YAML files and it starts a local web server with token-based authentication. Logs are streamed using your local credentials (SSH keys, kubeconfig, Docker socket). State is held in memory -- nothing is persisted to disk.

**Best for:** personal use, ad-hoc debugging sessions, sharing temporary log access with a colleague via a token URL.

```bash
avalok serve workspace.yaml
```

### `avalok server` -- Persistent Server Mode

A multi-user deployment backed by PostgreSQL. Supports JWT authentication, role-based access control, managed credentials, and persistent workspace storage. Designed to run as a long-lived service behind a reverse proxy.

**Best for:** team deployments, platform engineering, production log access with audit and access control.

```bash
avalok server start --config server.yaml
```

{{< alert context="info" >}}
Both modes use the same workspace YAML format and the same set of providers. You can start with `serve` for quick wins and move to `server` when you need multi-user access.
{{< /alert >}}

## Open Source

Avalok is open source and available on [GitHub](https://github.com/avalokhq/avalok). Contributions, issues, and feedback are welcome.
