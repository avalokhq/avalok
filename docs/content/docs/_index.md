---
title: "Avalok Documentation"
description: "Unified log streaming across your entire infrastructure."
---

# Avalok Documentation

Avalok is an open-source, unified log streaming tool that lets you view logs from Docker, Kubernetes, SSH, journalctl, files, containerd, WinRM, Windows Event Log, IIS, and cloud storage (S3, Azure Blob, Azure File, GCS) — all from a single interface.

## Two Ways to Run

- **`avalok serve`** — Local mode. Load workspace configs, share access tokens, stream logs instantly. No database needed.
- **`avalok server`** — Multi-user mode. PostgreSQL-backed with JWT auth, RBAC, managed credentials, and a visual config builder.

## Get Started

1. [Introduction](/docs/getting-started/introduction/) — What Avalok is and who it's for
2. [Installation](/docs/getting-started/installation/) — Download or build from source
3. [Quick Start](/docs/getting-started/quickstart/) — Stream your first logs in 5 minutes
4. [Configuration](/docs/getting-started/configuration/) — Full workspace YAML reference

## Explore

- [CLI Reference](/docs/cli/) — Every command, flag, and option
- [Providers](/docs/providers/) — Connect to 14 different log sources
- [Server Mode](/docs/server/) — Deploy for your team with RBAC
- [Guides](/docs/guides/) — Step-by-step walkthroughs
- [Comparison](/docs/comparison/) — How Avalok compares to Kubetail, Stern, Logdy, Loki, and more
