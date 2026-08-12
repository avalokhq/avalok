---
weight: 450
title: "Resources"
description: "Direct connections to Kubernetes clusters and cloud storage without workspace YAML."
icon: "cloud"
---

Resources provide a way to connect Avalok directly to infrastructure without defining a full workspace YAML configuration. This is useful for ad-hoc exploration, quick debugging, or giving scoped access to specific clusters and storage buckets.

## Resource Types

| Type | Description | Use Case |
|------|-------------|----------|
| **kubernetes** | Kubernetes cluster connection | Browse namespaces, workloads, and stream pod logs |
| **s3** | AWS S3 or S3-compatible storage | Browse and stream log files from S3 buckets |
| **azure-blob** | Azure Blob Storage | Browse and stream log files from Blob containers |
| **azure-file** | Azure File Share | Browse and stream log files from File Shares |
| **gcs** | Google Cloud Storage | Browse and stream log files from GCS buckets |

## Creating a Resource

Admins create resources via the API or admin UI. Navigate to **Resources** in the sidebar and click **Create**.

```
POST /api/admin/resources
Content-Type: application/json
Authorization: Bearer <token>
```

### Kubernetes Resource

```json
{
  "name": "prod-cluster",
  "type": "kubernetes",
  "credential_profile": "prod-cluster",
  "description": "Production Kubernetes cluster"
}
```

The `credential_profile` field references a managed credential. See [Credential Management]({{< relref "credentials" >}}).

### S3 Resource

```json
{
  "name": "app-logs",
  "type": "s3",
  "credential_profile": "aws-prod",
  "description": "Application logs in S3",
  "config": {
    "bucket": "my-app-logs",
    "prefix": "production/",
    "region": "us-east-1"
  }
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `bucket` | Yes | S3 bucket name |
| `prefix` | No | Key prefix to scope browsing to a subfolder |
| `region` | No | AWS region (required for AWS S3, optional for S3-compatible) |
| `endpoint` | No | Custom endpoint URL for S3-compatible storage (MinIO, Backblaze, etc.) |
| `force_path_style` | No | Use path-style URLs instead of virtual-hosted (required for some S3-compatible providers) |
| `poll_interval` | No | Polling interval in seconds for live mode |
| `pattern` | No | Glob pattern to filter files |

### Azure Blob Resource

```json
{
  "name": "audit-logs",
  "type": "azure-blob",
  "credential_profile": "azure-storage-prod",
  "description": "Audit logs in Azure Blob",
  "config": {
    "container": "audit-logs",
    "prefix": "2026/"
  }
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `container` | Yes | Blob container name |
| `prefix` | No | Blob name prefix to scope browsing |
| `poll_interval` | No | Polling interval in seconds for live mode |
| `pattern` | No | Glob pattern to filter files |

When not using a credential profile, Azure resources support four authentication methods: Account Key, Connection String, SAS Token, and Managed Identity.

### Azure File Resource

```json
{
  "name": "iis-logs",
  "type": "azure-file",
  "credential_profile": "azure-storage-prod",
  "description": "IIS logs on Azure File Share",
  "config": {
    "share_name": "iis-logs",
    "directory": "W3SVC1/"
  }
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `share_name` | Yes | Azure File Share name |
| `directory` | No | Directory path within the share |
| `poll_interval` | No | Polling interval in seconds for live mode |
| `pattern` | No | Glob pattern to filter files |

### GCS Resource

```json
{
  "name": "gke-logs",
  "type": "gcs",
  "credential_profile": "gcs-prod",
  "description": "GKE logs in GCS",
  "config": {
    "bucket": "gke-cluster-logs",
    "prefix": "production/"
  }
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `bucket` | Yes | GCS bucket name |
| `prefix` | No | Object prefix to scope browsing |
| `project` | No | Google Cloud project ID |
| `poll_interval` | No | Polling interval in seconds for live mode |
| `pattern` | No | Glob pattern to filter files |

## Browsing Kubernetes Resources

Once a Kubernetes resource is created, users with appropriate scope can browse it through the UI or API.

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

## Browsing Cloud Storage Resources

Cloud storage resources include a built-in storage browser for navigating folders and files.

### Storage Browser

Navigate to a cloud storage resource to open the storage browser. It displays a hierarchical folder tree with:

- Folder and file icons for easy navigation
- File sizes and timestamps
- Breadcrumb navigation for the current path
- Back button that returns to the last folder you were in (not root)

Click any file to stream its contents in the log viewer.

### Storage API

List objects and directories in a storage resource:

```
GET /api/admin/resources/{name}/storage/list?prefix={path}
Authorization: Bearer <token>
```

Stream a single object's content via HTTP:

```
GET /api/admin/resources/{name}/storage/content/{key}
Authorization: Bearer <token>
```

Objects can also be streamed via WebSocket with mode options: `?mode=tail` (default, stream from end), `?mode=head` (stream from start), `?mode=live` (new content only).

## Cluster Overview

Each Kubernetes resource provides an overview page showing:

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
