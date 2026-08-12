---
weight: 470
title: "API Reference"
description: "Complete REST API documentation for Avalok Server."
icon: "api"
---

All API endpoints are served under the `/api` prefix. Authenticated endpoints require a valid JWT passed via the `Authorization: Bearer <token>` header or the `?token=` query parameter.

## Public Endpoints

These endpoints do not require authentication.

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/health` | Health check. Returns `{"status":"ok"}` when the server is running. |
| `GET` | `/api/templates` | List available workspace templates. |

## Authentication

| Method | Path | Access | Description |
|--------|------|--------|-------------|
| `POST` | `/api/auth/login` | Public | Authenticate and receive a JWT. |
| `POST` | `/api/auth/register` | Public | Register a new user (pending approval). Requires `self_registration` enabled. |
| `POST` | `/api/auth/logout` | Authenticated | Revoke the current session. |
| `GET` | `/api/auth/me` | Authenticated | Get current user info. |

### Login

```
POST /api/auth/login
```

**Request:**

```json
{
  "username": "admin",
  "password": "your-password"
}
```

**Response:**

```json
{
  "token": "eyJhbG...",
  "user": {
    "username": "admin",
    "role": "admin",
    "status": "active"
  }
}
```

### Register

```
POST /api/auth/register
```

**Request:**

```json
{
  "username": "new-user",
  "password": "secure-password"
}
```

**Response:**

```json
{
  "message": "Registration successful. Awaiting admin approval."
}
```

## Workspaces

All workspace endpoints require authentication. Access is governed by the user's role and scope.

| Method | Path | Access | Description |
|--------|------|--------|-------------|
| `GET` | `/api/workspaces` | reader+ | List all workspaces within scope. |
| `GET` | `/api/workspaces/{name}` | reader+ | Get workspace details. |
| `GET` | `/api/workspaces/{name}/environments` | reader+ | List environments in a workspace. |
| `GET` | `/api/workspaces/{name}/environments/{env}` | reader+ | Get environment details. |
| `GET` | `/api/workspaces/{name}/environments/{env}/services` | reader+ | List services in an environment. |
| `GET` | `/api/workspaces/{name}/environments/{env}/services/{svc}` | reader+ | Get service details. |
| `GET` | `/api/workspaces/{name}/environments/{env}/services/{svc}/instances` | reader+ | List instances (pods/containers). |
| `GET` | `/api/workspaces/{name}/environments/{env}/services/{svc}/check` | reader+ | Run a health check on a service. |
| `GET` | `/api/workspaces/{name}/environments/{env}/services/{svc}/stream` | reader+ | Stream logs (SSE). |
| `GET` | `/api/workspaces/{name}/environments/{env}/services/{svc}/files` | reader+ | Browse files on the target. |

## Standalone Environments

| Method | Path | Access | Description |
|--------|------|--------|-------------|
| `GET` | `/api/environments` | reader+ | List standalone environments. |
| `GET` | `/api/environments/{name}` | reader+ | Get environment details. |
| `GET` | `/api/environments/{name}/services` | reader+ | List services in the environment. |
| `GET` | `/api/environments/{name}/services/{svc}/stream` | reader+ | Stream service logs (SSE). |

## Standalone Services

| Method | Path | Access | Description |
|--------|------|--------|-------------|
| `GET` | `/api/services` | reader+ | List standalone services. |
| `GET` | `/api/services/{name}` | reader+ | Get service details. |
| `GET` | `/api/services/{name}/stream` | reader+ | Stream service logs (SSE). |

## Admin: Users

All admin endpoints require the `admin` role.

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/admin/users` | List all users. |
| `POST` | `/api/admin/users` | Create a new user. |
| `GET` | `/api/admin/users/{username}` | Get user details. |
| `PUT` | `/api/admin/users/{username}` | Update user (role, scope, status, password, expiry). |
| `DELETE` | `/api/admin/users/{username}` | Delete a user. |

### Create User

```
POST /api/admin/users
```

```json
{
  "username": "deploy-reader",
  "password": "secure-password",
  "role": "reader",
  "scope": "production/us-east",
  "status": "active",
  "expires_at": "2026-12-31T23:59:59Z"
}
```

### Update User

```
PUT /api/admin/users/{username}
```

```json
{
  "role": "manager",
  "scope": "production",
  "status": "active"
}
```

## Admin: Workspaces

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/admin/workspaces` | List all workspaces. |
| `POST` | `/api/admin/workspaces` | Create a workspace. |
| `GET` | `/api/admin/workspaces/{name}` | Get workspace details. |
| `PUT` | `/api/admin/workspaces/{name}` | Update a workspace. |
| `DELETE` | `/api/admin/workspaces/{name}` | Delete a workspace. |

## Admin: Credentials

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/admin/credentials` | List all credentials (sensitive fields redacted). |
| `POST` | `/api/admin/credentials` | Create a credential profile. |
| `GET` | `/api/admin/credentials/{name}` | Get credential details. |
| `PUT` | `/api/admin/credentials/{name}` | Update a credential. |
| `DELETE` | `/api/admin/credentials/{name}` | Delete a credential. |
| `POST` | `/api/admin/credentials/{name}/test` | Test credential connectivity. |

## Admin: Resources

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/admin/resources` | List all resources (Kubernetes and cloud storage). |
| `POST` | `/api/admin/resources` | Create a resource. |
| `GET` | `/api/admin/resources/{name}` | Get resource details. |
| `PUT` | `/api/admin/resources/{name}` | Update a resource. |
| `DELETE` | `/api/admin/resources/{name}` | Delete a resource. |
| `GET` | `/api/admin/resources/{name}/storage/list` | List objects/directories in a cloud storage resource. Supports `?prefix=` query param. |
| `GET` | `/api/admin/resources/{name}/storage/content/{key}` | Download a single object's content from cloud storage via HTTP. |

## Admin: Standalone Environments

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/admin/environments` | List all standalone environments. |
| `POST` | `/api/admin/environments` | Create a standalone environment. |
| `GET` | `/api/admin/environments/{name}` | Get environment details. |
| `PUT` | `/api/admin/environments/{name}` | Update an environment. |
| `DELETE` | `/api/admin/environments/{name}` | Delete an environment. |

## Admin: Standalone Services

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/admin/services` | List all standalone services. |
| `POST` | `/api/admin/services` | Create a standalone service. |
| `GET` | `/api/admin/services/{name}` | Get service details. |
| `PUT` | `/api/admin/services/{name}` | Update a service. |
| `DELETE` | `/api/admin/services/{name}` | Delete a service. |

## Admin: Settings

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/admin/settings` | Get all server settings. |
| `PUT` | `/api/admin/settings` | Update server settings (partial update). |

## Streaming

Avalok supports two real-time streaming mechanisms for log data.

### Server-Sent Events (SSE)

Log stream endpoints return an SSE stream when accessed with a standard HTTP request.

```
GET /api/workspaces/{name}/environments/{env}/services/{svc}/stream
Authorization: Bearer <token>
Accept: text/event-stream
```

**Response headers:**

```
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive
```

**Event format:**

```
data: {"line": "2026-08-01T12:00:00Z INFO  Starting server...", "timestamp": "2026-08-01T12:00:00Z"}

data: {"line": "2026-08-01T12:00:01Z INFO  Listening on :8080", "timestamp": "2026-08-01T12:00:01Z"}
```

### WebSocket

For bidirectional communication, connect via WebSocket by sending an `Upgrade` header:

```
GET /api/workspaces/{name}/environments/{env}/services/{svc}/stream
Authorization: Bearer <token>
Connection: Upgrade
Upgrade: websocket
```

#### WebSocket Commands

Once connected, send JSON commands to control the stream:

| Command | Payload | Description |
|---------|---------|-------------|
| Pause | `{"action": "pause"}` | Pause the log stream. The server buffers lines while paused. |
| Resume | `{"action": "resume"}` | Resume a paused stream. Buffered lines are delivered immediately. |

```json
{"action": "pause"}
```

```json
{"action": "resume"}
```

## Error Responses

All API errors follow a consistent format:

```json
{
  "error": "Descriptive error message"
}
```

| Status Code | Meaning |
|-------------|---------|
| `400` | Bad request (invalid input) |
| `401` | Unauthorized (missing or invalid token) |
| `403` | Forbidden (insufficient role or out of scope) |
| `404` | Resource not found |
| `413` | Payload too large (exceeds 1 MB limit) |
| `429` | Too many requests (rate limited) |
| `500` | Internal server error |
