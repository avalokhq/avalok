---
weight: 430
title: "Roles & Access Control"
description: "Role-based access control, user statuses, and the scope system."
icon: "shield_person"
---

Avalok Server enforces role-based access control (RBAC) with a flexible scope system that restricts what each user can see and do.

## Roles

| Role | Description | Capabilities |
|------|-------------|--------------|
| **admin** | Full access | All operations: user management, credential management, workspace/resource CRUD, settings, approvals |
| **manager** | User management | Approve/disable users, manage users within their scope, view all resources within scope |
| **reader** | Read-only (server mode) | View workspaces, environments, services, and stream logs within their assigned scope |
| **viewer** | Read-only (serve mode) | View resources exposed by `avalok serve`, read-only access |

## User Statuses

| Status | Description |
|--------|-------------|
| **active** | User can log in and access resources within their role and scope |
| **pending** | User has registered but awaits admin approval |
| **disabled** | User account is deactivated; login is blocked |

New users created via self-registration start as **pending**. Users created directly by an admin can be set to **active** immediately.

## Scope System

Scopes define the boundary of a user's access using path-based patterns. A user can only view and interact with resources that fall within their assigned scope.

### Scope Patterns

| Pattern | Matches | Example |
|---------|---------|---------|
| `workspace` | Entire workspace | `production` |
| `workspace/environment` | All services in an environment | `production/us-east` |
| `workspace/environment/service` | A specific service | `production/us-east/api` |
| `env:<name>` | A standalone environment | `env:staging` |
| `env:<name>/<service>` | A service in a standalone environment | `env:staging/redis` |
| `svc:<name>` | A standalone service | `svc:monitoring` |
| `res:<name>` | A Kubernetes resource (all namespaces) | `res:prod-cluster` |
| `res:<name>/<namespace>` | A specific namespace in a resource | `res:prod-cluster/default` |

### Empty Scope

An **empty scope** (blank string) grants access to **all resources**. This is the default for admin users.

### Scope Examples

```
# Full access to the "production" workspace
scope: "production"

# Access only the us-east environment within production
scope: "production/us-east"

# Access only the API service in us-east
scope: "production/us-east/api"

# Access a standalone environment
scope: "env:staging"

# Access a Kubernetes resource across all namespaces
scope: "res:prod-cluster"

# Access only the "monitoring" namespace in a cluster
scope: "res:prod-cluster/monitoring"
```

## User Management

Admins can perform the following user management operations:

| Operation | Endpoint | Description |
|-----------|----------|-------------|
| List users | `GET /api/admin/users` | List all users |
| Create user | `POST /api/admin/users` | Create a user with a specific role, scope, and status |
| Approve user | `PUT /api/admin/users/{username}` | Change status from `pending` to `active` |
| Disable user | `PUT /api/admin/users/{username}` | Set status to `disabled` |
| Delete user | `DELETE /api/admin/users/{username}` | Permanently remove a user |
| Reset password | `PUT /api/admin/users/{username}` | Set a new password for a user |

### Creating a User

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

### Setting Scope and Expiry

Admins can assign a **scope** and an optional **expiry date** when creating or updating a user. When a user's expiry date passes, their account is effectively disabled.

```json
{
  "scope": "production/us-east/api",
  "expires_at": "2026-09-01T00:00:00Z"
}
```
