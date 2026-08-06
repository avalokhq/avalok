---
weight: 460
title: "Server Settings"
description: "Runtime configuration for workspaces, registration, and display options."
icon: "settings"
---

Server settings control runtime behavior and can be changed without restarting the server. Manage them through the Admin UI or the settings API.

## API

```
GET /api/admin/settings
Authorization: Bearer <admin-token>
```

```
PUT /api/admin/settings
Content-Type: application/json
Authorization: Bearer <admin-token>
```

```json
{
  "enable_workspaces": true,
  "company_name": "Acme Corp",
  "self_registration": false
}
```

Only the fields included in the PUT request are updated; omitted fields retain their current values.

## Settings Reference

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `enable_workspaces` | bool | `true` | Show the Workspaces section in the UI |
| `enable_environments` | bool | `true` | Show standalone Environments in the UI |
| `enable_services` | bool | `true` | Show standalone Services in the UI |
| `company_name` | string | `""` | Display name shown in the UI header and login page |
| `log_buffer_lines` | int | `10000` | Maximum log lines the browser keeps per stream (max `10000000`). Trimming occurs at 2× this value. |
| `self_registration` | bool | `false` | Allow new users to register via the registration page. Registered users start as `pending` and require admin approval. |
| `redact_credentials` | bool | `true` | Redact sensitive fields (passwords, keys, tokens) in credential API responses. See [Credential Management]({{< relref "credentials" >}}). |
| `file_browser_page_size` | int | `500` | Number of lines displayed per page in the file browser |
| `ws_max_connections` | int | `100` | Maximum number of concurrent WebSocket connections the server accepts |
| `ws_max_message_kb` | int | `64` | Maximum size of a single WebSocket message in kilobytes |
| `stream_tail_lines` | int | `100` | Number of historical log lines loaded when a log stream first opens |

## Feature Toggles

The `enable_workspaces`, `enable_environments`, and `enable_services` settings control which navigation sections appear in the UI. Disabling a section hides it from all users, regardless of role.

This is useful when you want to focus the UI on a specific workflow. For example, if you only use Kubernetes Resources, you can disable all three to declutter the interface.

## WebSocket Tuning

The `ws_max_connections` and `ws_max_message_kb` settings protect the server from resource exhaustion. Adjust these based on the number of concurrent users streaming logs:

- **Small teams (< 10 users):** defaults are sufficient.
- **Larger deployments (50+ users):** consider increasing `ws_max_connections` and monitoring server memory.

## Log Streaming

The `stream_tail_lines` setting controls how many historical lines are sent when a user first opens a log stream. A higher value provides more context but increases the initial payload size. The `log_buffer_lines` setting limits how many lines the browser retains in memory per stream -- once the count reaches 2× this value, older lines are trimmed back down to the configured limit. Accepts values from `1000` to `10000000`.
