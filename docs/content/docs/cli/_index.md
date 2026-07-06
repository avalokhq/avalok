---
weight: 200
title: "CLI Reference"
description: "Complete command-line interface reference for avalok."
icon: "terminal"
---

# CLI Reference

Avalok provides a single binary with several commands for streaming, serving, and managing logs across your infrastructure.

```bash
avalok [command] [flags]
```

## Commands

| Command | Description |
|---------|-------------|
| [`serve`]({{< relref "serve" >}}) | Start avalok in local/operator mode with token-based auth |
| [`server`]({{< relref "server" >}}) | Persistent multi-user server with PostgreSQL, JWT, and RBAC |
| [`tail`]({{< relref "tail" >}}) | Stream logs directly to terminal (no web UI) |
| [`create`]({{< relref "create" >}}) | Create avalok resources (config builder) |
| [`providers`]({{< relref "providers-cmd" >}}) | List all registered log providers |
| `version` | Print the avalok version |

## Global Behavior

Avalok operates as a secure, read-only log access broker. It never modifies your infrastructure -- it only reads logs from configured providers using existing credentials (kubeconfig, SSH config, etc.).

All commands that start an HTTP server embed the full web UI and serve it alongside the API.
