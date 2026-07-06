---
weight: 230
title: "tail"
description: "Stream logs directly to terminal without the web UI."
icon: "receipt_long"
---

# avalok tail

Stream logs from a specific service directly to your terminal. No web UI, no HTTP server -- just log output on stdout, similar to `kubectl logs` or `tail -f`.

Useful for quick debugging, scripting, piping into other tools, or when you do not need the full web interface.

## Usage

```bash
avalok tail <workspace/environment/service> [flags]
```

The target must be specified in the format `<workspace>/<environment>/<service>`, matching the names defined in your workspace YAML file.

## Flags

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `-f`, `--follow` | bool | `false` | Follow log output continuously (like `tail -f`) |
| `-n`, `--tail` | int | `50` | Number of lines to show from the end of the log |
| `-w`, `--workspace` | string | | Workspace YAML file path (**required**) |

## How It Works

1. Loads the specified workspace YAML file.
2. Resolves the target path to find the matching environment, target, and service configuration.
3. Connects to the service using the appropriate log provider (Docker, Kubernetes, SSH, etc.) with credentials from your local environment.
4. Lists all log instances for the service (e.g., multiple pod replicas in Kubernetes).
5. Streams logs from all instances, merging them into a single output stream.

When multiple instances are found (e.g., 3 replicas of a Kubernetes deployment), each line is prefixed with the instance identifier:

```
[pod-abc-123] 2024-01-15T10:30:00Z Request processed
[pod-def-456] 2024-01-15T10:30:01Z Request processed
```

When only a single instance is found, lines are printed without a prefix.

## Examples

### Basic tail (last 50 lines)

```bash
avalok tail my-infra/production/api -w workspace.yaml
```

Output:

```
Streaming logs from my-infra/production/api (1 instances)
2024-01-15T10:30:00Z [INFO] Server started on :8080
2024-01-15T10:30:01Z [INFO] Connected to database
...
```

### Follow mode (continuous streaming)

```bash
avalok tail my-infra/production/api -w workspace.yaml -f
```

Streams logs continuously until you press `Ctrl+C`. New log lines appear in real time.

### Show last 10 lines only

```bash
avalok tail my-infra/production/api -w workspace.yaml -n 10
```

### Follow with limited initial history

```bash
avalok tail my-infra/production/api -w workspace.yaml -f -n 100
```

Shows the last 100 lines, then continues streaming new lines.

### Pipe into other tools

```bash
# Filter for errors
avalok tail my-infra/production/api -w workspace.yaml -n 1000 | grep ERROR

# Count requests per endpoint
avalok tail my-infra/production/nginx -w workspace.yaml -n 5000 | awk '{print $7}' | sort | uniq -c | sort -rn

# Follow and filter in real time
avalok tail my-infra/production/api -w workspace.yaml -f | grep --line-buffered "status=500"
```
