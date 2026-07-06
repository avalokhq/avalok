---
weight: 440
title: "Credential Management"
description: "Managed credentials for Kubernetes, SSH, and WinRM targets."
icon: "key"
---

Avalok Server stores and manages credentials in PostgreSQL, allowing teams to share access to infrastructure without distributing raw secrets.

## Credential Types

| Type | Description | Use Case |
|------|-------------|----------|
| **kubernetes** | Kubeconfig data, bearer tokens, or certificate-based auth | Connecting to Kubernetes clusters |
| **ssh** | SSH keys, passwords, or agent forwarding configuration | Connecting to Linux/Unix hosts |
| **winrm** | Username/password or certificate-based auth | Connecting to Windows hosts |

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
