---
weight: 370
title: "Windows Event Log"
description: "Read Windows Event Log entries"
icon: "event_note"
---

# Windows Event Log Provider

The Windows Event Log provider reads event log entries using the `wevtutil` command. It supports filtering by channel, source, and severity level, and uses XPath queries for precise event selection. Follow mode polls for new events every 2 seconds.

## How It Works

1. Builds an XPath query based on the configured filters (source, level, time range)
2. Runs `wevtutil qe <channel> /q:<query> /f:text /c:<count>` to fetch events
3. Parses the text output into structured log entries
4. In follow mode, polls every 2 seconds for events newer than the last check

## Configuration

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `channel` | string | no | `Application` | Event log channel to read (e.g. `Application`, `System`, `Security`) |
| `source` | string | no | | Filter by event source/provider name |
| `level` | string | no | | Maximum severity level. Values: `critical`, `error`, `warning`, `information`, `verbose`. Shows events at this level and above. |
| `count` | int | no | `100` | Number of events to fetch per query |

## Level Filtering

The `level` field sets a threshold. Events at the specified level and all more severe levels are included:

| Level | Numeric | Includes |
|-------|---------|----------|
| `critical` | 1 | Critical only |
| `error` | 2 | Critical, Error |
| `warning` | 3 | Critical, Error, Warning |
| `information` | 4 | Critical, Error, Warning, Information |
| `verbose` | 5 | All events |

## Examples

### Application log

```yaml
services:
  - name: app-events
    provider: windows-eventlog
    config:
      channel: Application
```

### System errors

```yaml
services:
  - name: system-errors
    provider: windows-eventlog
    config:
      channel: System
      level: error
      count: 200
```

### Specific source

```yaml
services:
  - name: iis-events
    provider: windows-eventlog
    config:
      channel: Application
      source: W3SVC
```

### Security audit log

```yaml
services:
  - name: security-audit
    provider: windows-eventlog
    config:
      channel: Security
      count: 500
```
