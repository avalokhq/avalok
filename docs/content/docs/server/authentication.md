---
weight: 420
title: "Authentication"
description: "JWT-based authentication, login, registration, and session management."
icon: "lock"
---

Avalok uses different authentication mechanisms depending on the operating mode.

| Mode | Mechanism | Details |
|------|-----------|---------|
| **Server** | JWT (HS256) | 24-hour expiry, issued on login |
| **Serve** | Token | Static token passed at startup |

## Login

Authenticate with username and password to receive a JWT.

```
POST /api/auth/login
Content-Type: application/json
```

```json
{
  "username": "admin",
  "password": "your-password"
}
```

**Response (200):**

```json
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "username": "admin",
    "role": "admin",
    "status": "active"
  }
}
```

The token is signed with HS256 using the `AVALOK_JWT_SECRET` and expires after 24 hours.

## Registration

New users can self-register if the `self_registration` setting is enabled. Registered users start in **pending** status and require admin approval before they can log in.

```
POST /api/auth/register
Content-Type: application/json
```

```json
{
  "username": "new-user",
  "password": "secure-password"
}
```

**Response (200):**

```json
{
  "message": "Registration successful. Awaiting admin approval."
}
```

{{< alert context="info" >}}
To prevent username enumeration, attempting to register a duplicate username returns a fake success response identical to a genuine registration.
{{< /alert >}}

Self-registration can be toggled via the `self_registration` server setting. See [Settings]({{< relref "settings" >}}).

## Logout

Revoke the current session by calling the logout endpoint.

```
POST /api/auth/logout
Authorization: Bearer <token>
```

**Response (200):**

```json
{
  "message": "Logged out successfully"
}
```

## Current User

Retrieve information about the authenticated user.

```
GET /api/auth/me
Authorization: Bearer <token>
```

**Response (200):**

```json
{
  "username": "admin",
  "role": "admin",
  "status": "active",
  "scope": "",
  "expires_at": null
}
```

## Token Delivery

Include the JWT in requests using one of two methods:

| Method | Example |
|--------|---------|
| **Authorization header** (preferred) | `Authorization: Bearer eyJhbG...` |
| **Query parameter** | `GET /api/workspaces?token=eyJhbG...` |

The query parameter method is useful for WebSocket connections or situations where setting headers is not possible.

## Password Security

- Passwords are hashed using **bcrypt** before storage.
- Plaintext passwords are never stored or logged.

## Rate Limiting

Authentication endpoints are rate-limited on a per-IP basis to prevent brute-force attacks. Repeated failed login attempts from the same IP will be temporarily blocked.
