---
weight: 410
title: "Deployment"
description: "Deploy Avalok Server with Docker Compose and PostgreSQL."
icon: "deployed_code"
---

Avalok Server runs as a containerized service backed by PostgreSQL. The `avalok server deploy` command generates a production-ready `docker-compose.yml` to get you started.

## Quick Start

```bash
# 1. Generate docker-compose.yml
avalok server deploy

# 2. Start services
docker compose up -d

# 3. Create the initial admin user
avalok server init --url http://localhost:9090

# 4. Verify
curl http://localhost:9090/api/health
```

## Docker Compose Architecture

The generated `docker-compose.yml` includes two services:

| Service | Image | Purpose |
|---------|-------|---------|
| `avalok` | `avalok:latest` | Application server (default port 9090) |
| `postgres` | `postgres:17-alpine` | Database backend |

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `AVALOK_DATABASE_URL` | PostgreSQL connection string (e.g. `postgres://user:pass@localhost:5432/avalok`) | Required |
| `AVALOK_JWT_SECRET` | Secret for signing JWT tokens. Must be at least 32 characters. Known placeholders like `changeme` are rejected at startup. | Required |
| `AVALOK_BIND_ADDR` | Address the server binds to | `0.0.0.0` |
| `AVALOK_PORT` | Port the server listens on | `9090` |

## Step-by-Step Deployment

### 1. Generate the Compose File

```bash
avalok server deploy
```

This writes a `docker-compose.yml` in the current directory pre-configured with secure defaults. Edit the file to set your `AVALOK_JWT_SECRET` and database credentials.

### 2. Initialize the Database and Admin User

After starting the containers, run the init command to create the first admin account:

```bash
avalok server init --url http://localhost:9090
```

You will be prompted for an admin username and password. This account has full access to all server features.

### 3. Start the Server

```bash
docker compose up -d
```

The server is now accessible at `http://localhost:9090`.

## Volume Mounts

For connecting to Kubernetes clusters or SSH targets, mount the relevant credential files into the container:

```yaml
volumes:
  - ~/.kube/config:/root/.kube/config:ro
  - ~/.ssh:/root/.ssh:ro
```

## Production: TLS via Reverse Proxy

Avalok does not include built-in TLS termination. Use a reverse proxy in front of the server for HTTPS.

### Nginx Example

```nginx
server {
    listen 443 ssl;
    server_name avalok.example.com;

    ssl_certificate     /etc/ssl/certs/avalok.pem;
    ssl_certificate_key /etc/ssl/private/avalok.key;

    location / {
        proxy_pass http://127.0.0.1:9090;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # WebSocket support
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

### Caddy Example

```
avalok.example.com {
    reverse_proxy localhost:9090
}
```

### Traefik Example (Docker Labels)

```yaml
labels:
  - "traefik.enable=true"
  - "traefik.http.routers.avalok.rule=Host(`avalok.example.com`)"
  - "traefik.http.routers.avalok.tls.certresolver=letsencrypt"
  - "traefik.http.services.avalok.loadbalancer.server.port=9090"
```

## Security Headers

Avalok automatically sets the following response headers on every request:

| Header | Value |
|--------|-------|
| `X-Content-Type-Options` | `nosniff` |
| `X-Frame-Options` | `DENY` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | Restricts camera, microphone, geolocation |

## Request Limits

The server enforces a **1 MB** maximum request body size. Requests exceeding this limit are rejected with `413 Payload Too Large`.
