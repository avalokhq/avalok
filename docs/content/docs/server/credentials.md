---
weight: 440
title: "Credential Management"
description: "Managed credentials for Kubernetes, SSH, WinRM, and cloud storage targets."
icon: "key"
---

Avalok Server stores and manages credentials in PostgreSQL, allowing teams to share access to infrastructure without distributing raw secrets.

## Credential Types

| Type | Description | Use Case |
|------|-------------|----------|
| **kubernetes** | Kubeconfig data, bearer tokens, or certificate-based auth | Connecting to Kubernetes clusters |
| **ssh** | SSH keys, passwords, or agent forwarding configuration | Connecting to Linux/Unix hosts |
| **winrm** | Username/password or certificate-based auth | Connecting to Windows hosts |
| **s3** | AWS access keys, region, and optional custom endpoint | Connecting to S3 or S3-compatible storage |
| **azure-storage** | Account key, connection string, SAS token, or managed identity | Connecting to Azure Blob Storage or Azure File Shares |
| **gcs** | Service account credentials JSON or credentials file path | Connecting to Google Cloud Storage |

## Creating Credentials

Admins create credentials via the API or the admin UI.

```
POST /api/admin/credentials
Content-Type: application/json
Authorization: Bearer <token>
```

### Kubernetes Credential

```json
{
  "name": "prod-cluster",
  "target_type": "kubernetes",
  "config": {
    "kubeconfig_content": "apiVersion: v1\nclusters:\n- cluster:\n    server: https://k8s.example.com\n    certificate-authority-data: LS0t...\n  name: prod\n..."
  }
}
```

### SSH Credential

```json
{
  "name": "app-servers",
  "target_type": "ssh",
  "config": {
    "host": "10.0.1.50",
    "port": 22,
    "username": "deploy",
    "private_key": "-----BEGIN OPENSSH PRIVATE KEY-----\n..."
  }
}
```

### WinRM Credential

```json
{
  "name": "windows-fleet",
  "target_type": "winrm",
  "config": {
    "host": "10.0.2.100",
    "port": 5986,
    "username": "administrator",
    "password": "secure-password",
    "use_tls": true
  }
}
```

### S3 Credential

```json
{
  "name": "aws-prod",
  "target_type": "s3",
  "config": {
    "region": "us-east-1",
    "access_key_id": "AKIA...",
    "secret_access_key": "..."
  }
}
```

For S3-compatible storage (MinIO, Backblaze, etc.), add the `endpoint` field:

```json
{
  "name": "minio-logs",
  "target_type": "s3",
  "config": {
    "endpoint": "https://minio.internal:9000",
    "access_key_id": "minioadmin",
    "secret_access_key": "minioadmin"
  }
}
```

### Azure Storage Credential

A single `azure-storage` credential type is used for both Azure Blob Storage and Azure File Share resources. Four authentication methods are supported:

**Account Key:**

```json
{
  "name": "azure-storage-prod",
  "target_type": "azure-storage",
  "config": {
    "auth_method": "account-key",
    "account_name": "mystorageaccount",
    "account_key": "..."
  }
}
```

**Connection String:**

```json
{
  "name": "azure-storage-connstr",
  "target_type": "azure-storage",
  "config": {
    "auth_method": "connection-string",
    "connection_string": "DefaultEndpointsProtocol=https;AccountName=..."
  }
}
```

**SAS Token:**

```json
{
  "name": "azure-storage-sas",
  "target_type": "azure-storage",
  "config": {
    "auth_method": "sas-token",
    "account_name": "mystorageaccount",
    "sas_token": "sv=2021-06-08&ss=b&..."
  }
}
```

**Managed Identity:**

```json
{
  "name": "azure-storage-mi",
  "target_type": "azure-storage",
  "config": {
    "auth_method": "managed-identity",
    "account_name": "mystorageaccount"
  }
}
```

Managed Identity uses `DefaultAzureCredential` and works automatically on Azure VMs with an assigned identity.

### GCS Credential

```json
{
  "name": "gcs-prod",
  "target_type": "gcs",
  "config": {
    "credentials_json": "{\"type\":\"service_account\",...}"
  }
}
```

Alternatively, reference a credentials file on the server:

```json
{
  "name": "gcs-prod-file",
  "target_type": "gcs",
  "config": {
    "credentials_file": "/etc/avalok/gcs-key.json"
  }
}
```

## Updating Credentials

```
PUT /api/admin/credentials/{name}
Content-Type: application/json
Authorization: Bearer <token>
```

Send the full updated credential object. Fields not included are cleared.

## Deleting Credentials

```
DELETE /api/admin/credentials/{name}
Authorization: Bearer <token>
```

If the credential is referenced by one or more resources, the delete request will fail with a `409 Conflict` response listing the dependent resources. Remove or reassign the resources first, or use `?force=true` to delete anyway.

## Using Credentials in Workspaces

Reference a managed credential in your workspace YAML using the `credential_profile` field:

```yaml
environments:
  production:
    provider: kubernetes
    credential_profile: prod-cluster
    services:
      api:
        type: deployment
        name: api-server
        namespace: default
```

The server resolves the credential at runtime, so workspace authors never need direct access to the underlying secrets.

## Sensitive Field Redaction

API responses automatically redact sensitive fields to prevent accidental exposure. The following fields are replaced with a placeholder in responses:

| Redacted Fields |
|-----------------|
| `password` |
| `passphrase` |
| `private_key` |
| `key_data` |
| `key_path` |
| `token` |
| `secret` |
| `kubeconfig_content` |
| `bearer_token` |
| `ca_cert` |
| `proxy_url` |

Redaction behavior can be toggled with the `redact_credentials` server setting. See [Settings]({{< relref "settings" >}}).

## Testing Credentials

Verify that a credential can successfully connect to its target:

```
POST /api/admin/credentials/{name}/test
Authorization: Bearer <token>
```

**Response (200):**

```json
{
  "status": "ok",
  "message": "Connection successful"
}
```

**Response (failure):**

```json
{
  "status": "error",
  "message": "dial tcp 10.0.1.50:22: connection refused"
}
```

## Operator Resolver (Serve Mode)

In `avalok serve` mode, credentials are not stored in a database. Instead, the **operator resolver** discovers credentials from the local environment:

- **Kubernetes** -- reads from the default kubeconfig (`~/.kube/config`) or the `KUBECONFIG` environment variable.
- **SSH** -- reads from `~/.ssh/config` and available SSH keys.

This allows single-user `serve` mode to work without any credential configuration.
