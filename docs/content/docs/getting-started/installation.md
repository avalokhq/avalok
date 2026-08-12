---
weight: 120
title: "Installation"
description: "Download pre-built binaries, build from source, or deploy with Docker."
icon: "download"
---

# Installation

Avalok is distributed as a single binary with no runtime dependencies. Choose the installation method that fits your environment.

## Pre-built Binaries

Download the latest release from [GitHub Releases](https://github.com/avalokhq/avalok/releases).

| Platform | Architecture | Filename |
|---|---|---|
| Linux | amd64 | `avalok` |
| Windows | amd64 | `avalok.exe` |

After downloading, make the binary executable and move it to your PATH:

```bash
chmod +x avalok
sudo mv avalok /usr/local/bin/
```

Verify the installation:

```bash
avalok version
```

## Build from Source

Building from source requires:

- **Go 1.26+** -- [go.dev/dl](https://go.dev/dl/)
- **Node.js 22+** -- [nodejs.org](https://nodejs.org/) or via nvm/fnm

The repository includes an `.nvmrc` file. If you use nvm or fnm, the build script will automatically switch to the correct Node version.

### Linux / macOS

```bash
git clone https://github.com/avalokhq/avalok.git
cd avalok
./build.sh
```

### Windows

```powershell
git clone https://github.com/avalokhq/avalok.git
cd avalok
.\build.bat
```

Binaries are written to the `bin/` directory:

```
bin/avalok        # Linux amd64
bin/avalok.exe    # Windows amd64
```

### What the Build Script Does

The build script (`build.sh` / `build.bat`) handles the full pipeline:

1. **Checks Go version** -- verifies Go 1.26+ is installed.
2. **Checks Node.js version** -- verifies Node 22+ is available. If nvm or fnm is detected and the active version is too old, it attempts to switch automatically.
3. **Installs frontend dependencies** -- runs `npm ci` (or `npm install` if no lockfile exists) in the `web/` directory.
4. **Builds the frontend** -- runs `npm run build`, then copies the output into `internal/server/frontend/` for Go embedding.
5. **Cross-compiles Go binaries** -- builds both Linux and Windows amd64 binaries with the embedded frontend, writing them to `bin/`.

You can set a custom version string by exporting `VERSION` before building:

```bash
VERSION=1.0.0 ./build.sh
```

## Docker (Server Mode)

For persistent server deployments, Avalok provides a Docker Compose setup with PostgreSQL.

Generate the `docker-compose.yml`:

```bash
avalok server deploy
```

This creates a `docker-compose.yml` in the current directory with two services and a randomly generated JWT secret:

- **avalok** -- the Avalok server, listening on port 9090 (host networking)
- **postgres** -- PostgreSQL 17 for persistent storage

Start the stack:

```bash
docker compose up -d
```

On first start, an admin account is created automatically. Get the credentials from the logs:

```bash
docker compose logs avalok | grep -A 3 "ADMIN ACCOUNT CREATED"
```

## Next Steps

Once Avalok is installed, head to the [Quick Start]({{< ref "quickstart" >}}) guide to stream your first logs.
