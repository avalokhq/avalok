---
weight: 240
title: "create"
description: "Create avalok resources including workspace configurations."
icon: "add_circle"
---

# avalok create

Parent command for creating avalok resources.

## Subcommands

| Subcommand | Description |
|------------|-------------|
| [`create config`](#create-config) | Open the browser-based workspace config builder |

---

## create config

Start a local HTTP server and open the browser-based config builder for creating workspace YAML files. The config builder provides a visual interface for defining workspaces, environments, targets, and services without writing YAML by hand.

### Usage

```bash
avalok create config [flags]
```

### Flags

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--host` | string | `127.0.0.1` | Bind address (use `0.0.0.0` for all interfaces) |
| `-p`, `--port` | int | `9091` | HTTP server port |
| `-o`, `--output` | string | | Default output filename for generated YAML |

### How It Works

1. Starts a local HTTP server on the configured address and port.
2. Opens your default browser to `http://<host>:<port>/?mode=config`.
3. Serves the visual config builder UI.
4. Keeps running until you press `Ctrl+C`.

The config builder runs on port `9091` by default (not `9090`) to avoid conflicts with a running `avalok serve` instance.

### Config Builder UI

The config builder provides a visual interface for workspace configuration:

- **Workspace creation** -- Define workspace name and description.
- **Environment management** -- Add environments (e.g., production, staging, development) with drag-and-drop ordering.
- **Target configuration** -- Configure connection targets (SSH hosts, Kubernetes clusters, local Docker) with provider-specific settings.
- **Service definition** -- Add services to targets, select log providers (Docker, Kubernetes, journalctl, file, etc.), and configure provider-specific options.
- **YAML preview** -- See the generated YAML in real time as you build the configuration.
- **Import/export** -- Import existing YAML files for editing, or export the generated configuration.

### Examples

#### Open the config builder with defaults

```bash
avalok create config
```

Opens `http://127.0.0.1:9091/?mode=config` in your browser.

#### Custom port

```bash
avalok create config -p 3000
```

#### Specify a default output filename

```bash
avalok create config -o production.yaml
```

#### Bind to all interfaces

```bash
avalok create config --host 0.0.0.0
```

Makes the config builder accessible from other machines on the network. Useful when running on a remote server and accessing from your local browser.
