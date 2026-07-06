---
weight: 390
title: "IIS"
description: "Read IIS web server log files"
icon: "public"
---

# IIS Provider

The IIS provider reads Internet Information Services (IIS) log files. It wraps the [File provider](file) with IIS-specific directory resolution, automatically locating log files for a given site name under the standard IIS log directory structure.

## How It Works

1. Determines the IIS log directory (defaults to `C:\inetpub\logs\LogFiles` on Windows)
2. If a `site` name is given, searches for a matching subdirectory (e.g. `W3SVC1`)
3. Passes a `*.log` glob pattern to the underlying File provider
4. Streams and tails log files using the File provider's follow mode (100ms polling)

## Configuration

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `site` | string | no | | IIS site name. The provider searches for a subdirectory matching this name. |
| `log_dir` | string | no | `C:\inetpub\logs\LogFiles` | Custom log directory path. Overrides the default IIS log location. |

## Directory Resolution

IIS stores logs in subdirectories named `W3SVC<n>` (where `<n>` is the site ID). The provider matches your `site` value case-insensitively against directory names. If no match is found, it falls back to the first `W3SVC*` directory it finds.

## Examples

### Default site logs

```yaml
services:
  - name: iis-logs
    provider: iis
    config: {}
```

### Specific site

```yaml
services:
  - name: corporate-site
    provider: iis
    config:
      site: CorporateWebsite
```

### Custom log directory

```yaml
services:
  - name: iis-custom
    provider: iis
    config:
      log_dir: D:\WebLogs\IIS
      site: MyApp
```
