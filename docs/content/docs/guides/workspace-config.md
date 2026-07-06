---
weight: 530
title: "Workspace Configuration"
description: "Patterns and examples for building workspace YAML configs."
icon: "settings"
---

# Workspace Configuration

A workspace YAML file defines the services you want to monitor, the environments they run in, and the connection targets for each environment. This guide covers common patterns from simple to advanced.

## Workspace Structure

Every workspace has three top-level sections:

```yaml
name: my-workspace
description: "Human-readable description"

services:
  - name: service-name
    provider: docker
    config:
      container_name: my-app

environments:
  - name: production
    targets:
      - name: prod-host
        type: ssh
        host: 10.0.1.10
        user: deploy
        service_names:
          - service-name

settings:
  hierarchy: default
```

| Section | Purpose |
|---|---|
| `name` | Unique identifier for the workspace |
| `description` | Shown in the UI alongside the workspace name |
| `services` | What to monitor -- provider type and provider-specific config |
| `environments` | Where to monitor -- connection targets that run the services |
| `settings` | Optional -- hierarchy template, SSH timeout, log buffer size |

---

## Basic Patterns

### Single Service

The simplest workspace: one service running locally.

```yaml
name: local-app
description: "Local Docker container"

services:
  - name: app
    provider: docker
    config:
      container_name: my-app

environments:
  - name: local
    targets:
      - name: localhost
        type: local
        service_names:
          - app
```

### Multi-Service

Monitor multiple services in the same environment:

```yaml
name: web-stack
description: "Web application stack"

services:
  - name: nginx
    provider: docker
    config:
      container_name: nginx

  - name: api
    provider: docker
    config:
      container_name: api-server

  - name: worker
    provider: docker
    config:
      container_name: background-worker

  - name: system
    provider: journalctl
    config:
      unit: ""

environments:
  - name: production
    targets:
      - name: web-server
        type: ssh
        host: 10.0.1.10
        user: deploy
        key_path: ~/.ssh/id_ed25519
        service_names:
          - nginx
          - api
          - worker
          - system
```

### Multi-Environment

Same services deployed to different environments:

```yaml
name: platform
description: "Application platform"

services:
  - name: api
    provider: docker
    config:
      container_name: api

  - name: web
    provider: docker
    config:
      container_name: web

environments:
  - name: staging
    targets:
      - name: staging-host
        type: ssh
        host: 10.0.1.10
        user: deploy
        key_path: ~/.ssh/id_ed25519
        service_names:
          - api
          - web

  - name: production
    targets:
      - name: prod-host
        type: ssh
        host: 10.0.2.10
        user: deploy
        key_path: ~/.ssh/id_ed25519
        service_names:
          - api
          - web
```

---

## SSH Targets

### Key-Based Authentication

```yaml
targets:
  - name: prod-server
    type: ssh
    host: 10.0.1.10
    user: deploy
    key_path: ~/.ssh/id_ed25519
    service_names:
      - my-service
```

### Key with Passphrase

```yaml
targets:
  - name: prod-server
    type: ssh
    host: 10.0.1.10
    user: deploy
    key_path: ~/.ssh/id_rsa
    passphrase: my-key-passphrase
    service_names:
      - my-service
```

### Password Authentication

```yaml
targets:
  - name: legacy-server
    type: ssh
    host: 10.0.1.20
    user: admin
    password: server-password
    service_names:
      - my-service
```

### Custom Port

```yaml
targets:
  - name: custom-port
    type: ssh
    host: 10.0.1.10
    user: deploy
    port: "2222"
    key_path: ~/.ssh/id_ed25519
    service_names:
      - my-service
```

### Sudo Access

Some providers (file, journalctl) may need root access. Enable sudo on the target:

```yaml
targets:
  - name: restricted-host
    type: ssh
    host: 10.0.1.10
    user: deploy
    key_path: ~/.ssh/id_ed25519
    sudo: true
    service_names:
      - protected-logs
```

---

## Kubernetes Targets

### Kubeconfig File

```yaml
targets:
  - name: k8s-cluster
    type: kubernetes
    kubeconfig: ~/.kube/config
    context: my-cluster-context
    namespace: default
    service_names:
      - my-k8s-service
```

### Specific Context and Namespace

```yaml
targets:
  - name: production-k8s
    type: kubernetes
    kubeconfig: ~/.kube/config
    context: prod-cluster
    namespace: my-app
    service_names:
      - api
      - worker
```

### Bearer Token Authentication

For service accounts or CI/CD pipelines:

```yaml
targets:
  - name: k8s-sa
    type: kubernetes
    api_server_url: https://k8s.example.com:6443
    bearer_token: eyJhbGciOi...
    ca_cert: /path/to/ca.crt
    namespace: production
    service_names:
      - api
```

### In-Cluster Configuration

When Avalok runs inside the cluster (e.g., as a pod), it uses the in-cluster service account automatically. No kubeconfig or token is needed:

```yaml
targets:
  - name: in-cluster
    type: kubernetes
    namespace: my-namespace
    service_names:
      - api
```

### Skip TLS Verification

For development clusters with self-signed certificates:

```yaml
targets:
  - name: dev-k8s
    type: kubernetes
    api_server_url: https://dev-k8s.internal:6443
    bearer_token: dev-token
    insecure_skip_tls: true
    namespace: default
    service_names:
      - my-service
```

---

## WinRM Targets

### HTTPS (Recommended)

```yaml
targets:
  - name: windows-server
    type: winrm
    host: 10.0.3.10
    user: Administrator
    password: windows-password
    use_https: true
    service_names:
      - event-log
      - iis-logs
```

### HTTP with Self-Signed Certificate

```yaml
targets:
  - name: dev-windows
    type: winrm
    host: 10.0.3.10
    user: Administrator
    password: windows-password
    use_https: true
    insecure: true
    service_names:
      - event-log
```

---

## Advanced Patterns

### Service Overrides Per Target

When the same service has different configuration on different targets, use the `services` block on the target instead of `service_names`:

```yaml
services:
  - name: app-logs
    provider: file
    config:
      log_dir: /var/log/myapp
      pattern: "*.log"

environments:
  - name: production
    targets:
      - name: server-1
        type: ssh
        host: 10.0.1.10
        user: deploy
        key_path: ~/.ssh/id_ed25519
        services:
          - name: app-logs
            config:
              log_dir: /opt/myapp/logs
              pattern: "app-*.log"

      - name: server-2
        type: ssh
        host: 10.0.1.11
        user: deploy
        key_path: ~/.ssh/id_ed25519
        service_names:
          - app-logs  # Uses the default config
```

The override config is merged with the service's base config. Override keys replace base keys; unspecified keys are inherited.

### Hierarchy Templates

The `hierarchy` setting controls how services are organized in the UI sidebar:

```yaml
settings:
  hierarchy: default
```

| Template | Structure | Best For |
|---|---|---|
| `default` | Workspace > Environment > Service | Most deployments |
| `service-first` | Workspace > Service > Environment | When you want to compare a service across environments |
| `product-first` | Product > Service > Environment | Multi-product organizations |
| `company` | Company > Product > Service > Environment | Large enterprises |

### Credential Profiles (Server Mode)

In server mode, targets can reference centrally managed credential profiles instead of embedding credentials:

```yaml
environments:
  - name: production
    targets:
      - name: prod-host
        type: ssh
        host: 10.0.1.10
        credential_profile: prod-ssh-key
        service_names:
          - api
          - web

      - name: k8s-cluster
        type: kubernetes
        credential_profile: prod-kubeconfig
        namespace: my-app
        service_names:
          - api-pods
```

Credential profiles are managed through the Admin UI under **Admin > Credentials**.

### Friendly Names

Give services human-readable display names:

```yaml
services:
  - name: nginx-proxy
    friendly_name: "Web Proxy"
    provider: docker
    config:
      container_name: nginx

  - name: pg-primary
    friendly_name: "PostgreSQL Primary"
    provider: docker
    config:
      container_name: postgres-primary
```

The `name` field is used internally (API paths, scope rules). The `friendly_name` is displayed in the UI.

---

## Mixed Infrastructure

Avalok's strength is unifying logs across different infrastructure. Here is a workspace that monitors Linux servers, Windows servers, and Kubernetes -- all in one view.

```yaml
name: full-stack
description: "Complete infrastructure monitoring"

services:
  # Linux services
  - name: api
    provider: docker
    config:
      container_name: api-server

  - name: system-journal
    provider: journalctl
    config:
      unit: ""

  - name: app-logs
    provider: file
    config:
      log_dir: /var/log/myapp
      pattern: "*.log"

  # Windows services
  - name: windows-events
    provider: windows-eventlog
    config:
      log_name: Application

  - name: iis-access
    provider: iis
    config:
      site_name: Default Web Site

  # Kubernetes services
  - name: k8s-api
    provider: kubernetes
    config:
      resource: deployment
      name: api

  - name: k8s-worker
    provider: kubernetes
    config:
      resource: deployment
      name: worker

environments:
  - name: production
    targets:
      - name: linux-host
        type: ssh
        host: 10.0.1.10
        user: deploy
        key_path: ~/.ssh/id_ed25519
        service_names:
          - api
          - system-journal
          - app-logs

      - name: windows-host
        type: winrm
        host: 10.0.3.10
        user: Administrator
        password: win-password
        use_https: true
        service_names:
          - windows-events
          - iis-access

      - name: k8s-cluster
        type: kubernetes
        kubeconfig: ~/.kube/config
        context: prod-cluster
        namespace: my-app
        service_names:
          - k8s-api
          - k8s-worker
```

---

## Real-World Example: Microservices Platform

A more realistic example for a team running a microservices platform with staging and production environments across multiple servers and a Kubernetes cluster.

```yaml
name: acme-platform
description: "ACME Corp microservices platform"

services:
  - name: gateway
    friendly_name: "API Gateway"
    provider: docker
    config:
      container_name: gateway

  - name: auth-service
    friendly_name: "Auth Service"
    provider: docker
    config:
      container_name: auth

  - name: order-service
    friendly_name: "Order Service"
    provider: kubernetes
    config:
      resource: deployment
      name: order-service

  - name: payment-service
    friendly_name: "Payment Service"
    provider: kubernetes
    config:
      resource: deployment
      name: payment-service

  - name: notification-worker
    friendly_name: "Notification Worker"
    provider: kubernetes
    config:
      resource: deployment
      name: notification-worker

  - name: nginx-access
    friendly_name: "Nginx Access Logs"
    provider: file
    config:
      log_dir: /var/log/nginx
      pattern: "access*.log"

  - name: app-logs
    friendly_name: "Application Logs"
    provider: file
    config:
      log_dir: /var/log/acme
      pattern: "*.log"

environments:
  - name: staging
    targets:
      - name: staging-vm
        type: ssh
        host: staging.internal.acme.com
        user: deploy
        key_path: ~/.ssh/id_ed25519
        service_names:
          - gateway
          - auth-service
          - nginx-access
          - app-logs

      - name: staging-k8s
        type: kubernetes
        kubeconfig: ~/.kube/config
        context: staging-cluster
        namespace: acme-staging
        service_names:
          - order-service
          - payment-service
          - notification-worker

  - name: production
    targets:
      - name: prod-lb-1
        type: ssh
        host: lb1.acme.com
        user: deploy
        key_path: ~/.ssh/id_ed25519
        service_names:
          - gateway
          - nginx-access

      - name: prod-lb-2
        type: ssh
        host: lb2.acme.com
        user: deploy
        key_path: ~/.ssh/id_ed25519
        service_names:
          - gateway
          - nginx-access

      - name: prod-auth
        type: ssh
        host: auth.acme.com
        user: deploy
        key_path: ~/.ssh/id_ed25519
        service_names:
          - auth-service
          - app-logs

      - name: prod-k8s
        type: kubernetes
        kubeconfig: ~/.kube/config
        context: prod-cluster
        namespace: acme-production
        service_names:
          - order-service
          - payment-service
          - notification-worker

settings:
  hierarchy: service-first
  ssh_timeout: 10
```

This workspace gives the team a single view across:

- 2 load balancers (SSH + Docker + File)
- 1 auth server (SSH + Docker + File)
- 1 Kubernetes cluster (3 deployments)
- 2 environments (staging and production)

With `hierarchy: service-first`, the UI groups by service name so you can compare the same service across staging and production side by side.
