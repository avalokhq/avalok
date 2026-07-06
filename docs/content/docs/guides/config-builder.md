---
weight: 540
title: "Config Builder"
description: "Visual browser-based editor for creating workspace YAML configurations."
icon: "build"
---

# Config Builder

The Config Builder is a browser-based visual editor for creating workspace YAML configurations. Instead of writing YAML by hand, you fill in forms, select providers from a visual grid, and see the generated YAML in real time.

## Accessing the Config Builder

### Standalone Mode

Run the config builder as a standalone tool:

```bash
avalok create config
```

This starts a local server on port 9091 and opens the config builder in your default browser. The builder runs at `http://127.0.0.1:9091/?mode=config`.

| Flag | Default | Description |
|---|---|---|
| `--host` | `127.0.0.1` | Bind address |
| `-p`, `--port` | `9091` | HTTP server port |
| `-o`, `--output` | `workspace.yaml` | Default output filename |

### Server Mode

In server mode, the config builder is integrated into the admin UI. Navigate to **Admin > Workspaces > Create** to open it. Workspaces created in server mode are saved directly to the database.

---

## Builder Modes

The config builder supports three creation modes:

| Mode | Creates | Use Case |
|---|---|---|
| **Workspace** | Full workspace with services, environments, and targets | Standard multi-environment setup |
| **Environment** | Standalone environment with targets and services | Adding an environment to an existing workspace |
| **Service** | Standalone service definition | Adding a service to an existing workspace |

---

## Creating a Workspace

### Step 1: Workspace Details

Enter the workspace name and description:

- **Name** -- unique identifier (used in API paths and scope rules)
- **Description** -- human-readable label shown in the UI

Select a hierarchy template:

| Template | Structure |
|---|---|
| Default | Workspace > Environment > Service |
| Service First | Workspace > Service > Environment |
| Product First | Product > Service > Environment |
| Company | Company > Product > Service > Environment |

### Step 2: Define Services

Click **Add Service** to create a service definition. For each service:

1. **Name** -- unique identifier within the workspace
2. **Friendly Name** -- optional display name for the UI
3. **Provider** -- select from the provider grid (Docker, Kubernetes, File, Journalctl, SSH, Containerd, Windows Event Log, WinRM, IIS)
4. **Configuration** -- provider-specific fields appear based on your selection

The provider grid shows each provider with an icon and description. Selecting a provider reveals the relevant configuration fields.

### Step 3: Define Environments

Click **Add Environment** to create an environment. For each environment:

1. **Name** -- identifier for this environment (e.g., staging, production)
2. **Targets** -- add one or more connection targets

For each target:

1. **Name** -- identifier for this target
2. **Type** -- select the connection type (Local, SSH, Kubernetes, WinRM, Windows)
3. **Connection Fields** -- type-specific fields appear (host, user, key path, kubeconfig, etc.)
4. **Credential Profile** -- (server mode only) select a stored credential profile
5. **Services** -- select which services run on this target

### Step 4: Review and Save

The config builder validates your configuration and shows any errors. When ready, save or download the generated YAML.

---

## YAML Preview

The right panel shows a live preview of the generated YAML as you build your configuration.

### Preview Features

- **Real-time updates** -- the YAML updates as you add or modify services, environments, and targets
- **Syntax highlighting** -- YAML is rendered with color-coded syntax
- **Copy to clipboard** -- copy the full YAML with one click
- **Download** -- download the YAML as a `.yaml` file
- **Save to disk** -- (standalone mode) save directly to a file in your working directory
- **Import to server** -- (server mode) save the workspace directly to the database
- **Collapsible panel** -- toggle the preview panel to maximize the form area

### Secrets Redaction

The preview includes a secrets redaction toggle. When enabled, sensitive fields (passwords, tokens, private keys) are replaced with `***REDACTED***` in the preview. This is useful when screen-sharing or taking screenshots.

---

## Importing Existing YAML

The config builder can import an existing workspace YAML file. Click **Import YAML** and paste your existing configuration. The builder parses the YAML and populates the form fields, letting you make visual edits and re-export.

---

## Server Mode Extras

When running inside server mode, the config builder has additional capabilities:

### Credential Profile Selection

Instead of entering raw credentials (SSH keys, passwords), you can select from credential profiles managed in **Admin > Credentials**. The target form shows a dropdown of available profiles.

### Resource Import

In server mode, you can import resources (Kubernetes clusters) that have been configured under **Admin > Resources**. The builder can auto-discover namespaces, deployments, and services from connected Kubernetes clusters and generate service definitions from them.

---

## Workflow Examples

### Quick Local Config

```bash
# Open the builder
avalok create config

# Fill in the form, click Save
# File is written to workspace.yaml in your current directory

# Start serving
avalok serve workspace.yaml
```

### Custom Output File

```bash
# Save to a specific filename
avalok create config -o production.yaml
```

### Team Workflow (Server Mode)

1. Admin opens **Admin > Workspaces > Create**
2. Builds the workspace visually
3. Selects credential profiles for SSH and Kubernetes targets
4. Clicks **Save** to persist the workspace to the database
5. Users with appropriate scope see the workspace immediately
