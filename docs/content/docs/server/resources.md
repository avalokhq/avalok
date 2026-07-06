---
weight: 450
title: "Kubernetes Resources"
description: "Direct Kubernetes cluster management without workspace YAML."
icon: "cloud"
---

Resources provide a way to connect Avalok directly to Kubernetes clusters without defining a full workspace YAML configuration. This is useful for ad-hoc cluster exploration, quick debugging, or giving scoped access to specific clusters and namespaces.

## Overview

A resource represents a single Kubernetes cluster connection. Once created, users can browse the cluster's namespaces and workloads, stream pod logs, and view cluster health -- all through the Avalok UI.

## Creating a Resource

Admins create resources via the API or admin UI.

```
POST /api/admin/resources
Content-Type: application/json
Authorization: Bearer <token>
```

```json
{
  "name": "prod-cluster",
  "credential_profile": "prod-cluster",
  "description": "Production Kubernetes cluster"
}
```

The `credential_profile` field references a managed credential of type `kubernetes`. See [Credential Management]({{< relref "credentials" >}}).

## Browsing Resources

Once a resource is created, users with appropriate scope can browse it through the UI or API.

### Namespaces

List all namespaces in the cluster:

```
GET /api/resources/{name}/namespaces
Authorization: Bearer <token>
```

### Workloads

View workloads within a namespace:

```
GET /api/resources/{name}/namespaces/{namespace}/workloads
Authorization: Bearer <token>
```

Supported workload types:

| Workload Type | Description |
|---------------|-------------|
| **Deployments** | Standard stateless workloads |
| **StatefulSets** | Stateful workloads with persistent identity |
| **DaemonSets** | Workloads running on every (or selected) node(s) |

### Pod Logs

Stream logs from a specific pod:

```
GET /api/resources/{name}/namespaces/{namespace}/pods/{pod}/logs
Authorization: Bearer <token>
```

Logs are streamed in real time, making it easy to tail running containers for debugging.

## Cluster Overview

Each resource provides an overview page showing:

- Total pod count and status breakdown (running, pending, failed)
- Node health and readiness
- Namespace summary
- Workload counts by type

## Access Control

Resource access is governed by the scope system. Non-admin users need a scope that includes the resource:

| Scope Pattern | Access |
|---------------|--------|
| `res:prod-cluster` | All namespaces in the `prod-cluster` resource |
| `res:prod-cluster/monitoring` | Only the `monitoring` namespace in `prod-cluster` |
| *(empty)* | All resources (admin default) |

See [Roles & Access Control]({{< relref "rbac" >}}) for more on the scope system.

## Managing Resources

| Operation | Endpoint | Method |
|-----------|----------|--------|
| List resources | `/api/admin/resources` | `GET` |
| Create resource | `/api/admin/resources` | `POST` |
| Update resource | `/api/admin/resources/{name}` | `PUT` |
| Delete resource | `/api/admin/resources/{name}` | `DELETE` |
