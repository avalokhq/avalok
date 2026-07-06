#!/bin/bash
set -e

VERSION="${VERSION:-dev}"
REQUIRED_NODE_MAJOR=22
REQUIRED_GO_MAJOR=1
REQUIRED_GO_MINOR=26

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

info()  { echo -e "${GREEN}[✓]${NC} $1"; }
warn()  { echo -e "${YELLOW}[!]${NC} $1"; }
fail()  { echo -e "${RED}[✗]${NC} $1"; exit 1; }

echo "=== Avalok Build ==="
echo ""

# ---------------------------------------------------------------------------
# 1. Check Go
# ---------------------------------------------------------------------------
echo "[1/5] Checking Go..."

if ! command -v go &>/dev/null; then
    fail "Go is not installed. Install Go ${REQUIRED_GO_MAJOR}.${REQUIRED_GO_MINOR}+ from https://go.dev/dl/"
fi

GO_VERSION=$(go version | grep -oP '\d+\.\d+' | head -1)
GO_MAJOR=$(echo "$GO_VERSION" | cut -d. -f1)
GO_MINOR=$(echo "$GO_VERSION" | cut -d. -f2)

if [ "$GO_MAJOR" -lt "$REQUIRED_GO_MAJOR" ] || { [ "$GO_MAJOR" -eq "$REQUIRED_GO_MAJOR" ] && [ "$GO_MINOR" -lt "$REQUIRED_GO_MINOR" ]; }; then
    fail "Go ${GO_VERSION} found, but ${REQUIRED_GO_MAJOR}.${REQUIRED_GO_MINOR}+ is required. Update from https://go.dev/dl/"
fi
info "Go ${GO_VERSION} — OK"

# ---------------------------------------------------------------------------
# 2. Check Node.js (handle nvm, fnm, system node)
# ---------------------------------------------------------------------------
echo ""
echo "[2/5] Checking Node.js..."

load_nvm() {
    export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
    if [ -s "$NVM_DIR/nvm.sh" ]; then
        source "$NVM_DIR/nvm.sh"
        return 0
    fi
    # Windows: nvm-windows doesn't use nvm.sh — check if nvm command exists
    if command -v nvm &>/dev/null; then
        return 0
    fi
    return 1
}

HAS_NVM=false
HAS_FNM=false
NODE_OK=false

if load_nvm; then
    HAS_NVM=true
elif command -v fnm &>/dev/null; then
    HAS_FNM=true
fi

ensure_node_version() {
    if ! command -v node &>/dev/null; then
        return 1
    fi
    local NODE_VERSION
    NODE_VERSION=$(node -v | grep -oP '\d+' | head -1)
    if [ "$NODE_VERSION" -ge "$REQUIRED_NODE_MAJOR" ]; then
        return 0
    fi
    return 1
}

if ensure_node_version; then
    NODE_OK=true
    info "Node $(node -v) — OK"
elif $HAS_NVM; then
    warn "Node ${REQUIRED_NODE_MAJOR}+ not active. Attempting to switch via nvm..."
    if nvm use "$REQUIRED_NODE_MAJOR" 2>/dev/null; then
        info "Switched to Node $(node -v) via nvm"
        NODE_OK=true
    elif nvm install "$REQUIRED_NODE_MAJOR" 2>/dev/null; then
        nvm use "$REQUIRED_NODE_MAJOR"
        info "Installed and switched to Node $(node -v) via nvm"
        NODE_OK=true
    fi
elif $HAS_FNM; then
    warn "Node ${REQUIRED_NODE_MAJOR}+ not active. Attempting to switch via fnm..."
    if fnm use "$REQUIRED_NODE_MAJOR" 2>/dev/null; then
        eval "$(fnm env)"
        info "Switched to Node $(node -v) via fnm"
        NODE_OK=true
    elif fnm install "$REQUIRED_NODE_MAJOR" 2>/dev/null; then
        fnm use "$REQUIRED_NODE_MAJOR"
        eval "$(fnm env)"
        info "Installed and switched to Node $(node -v) via fnm"
        NODE_OK=true
    fi
fi

if ! $NODE_OK; then
    if command -v node &>/dev/null; then
        CURRENT_NODE=$(node -v)
        fail "Node ${CURRENT_NODE} found, but ${REQUIRED_NODE_MAJOR}+ is required. Run: nvm install ${REQUIRED_NODE_MAJOR}"
    else
        fail "Node.js is not installed. Install Node ${REQUIRED_NODE_MAJOR}+ from https://nodejs.org/ or via nvm/fnm."
    fi
fi

if ! command -v npm &>/dev/null; then
    fail "npm not found. It should come with Node.js — check your installation."
fi

# ---------------------------------------------------------------------------
# 3. Install frontend dependencies
# ---------------------------------------------------------------------------
echo ""
echo "[3/5] Installing frontend dependencies..."

cd web

if [ -f "node_modules/.package-lock.json" ] && [ "package-lock.json" -ot "node_modules/.package-lock.json" ]; then
    info "node_modules up to date — skipping install"
else
    if [ -f "package-lock.json" ]; then
        npm ci --loglevel=error
    else
        warn "No package-lock.json found — running npm install (this will create one)"
        npm install --loglevel=error
    fi
    info "Dependencies installed"
fi

cd ..

# ---------------------------------------------------------------------------
# 4. Build frontend + copy to embed directory
# ---------------------------------------------------------------------------
echo ""
echo "[4/5] Building frontend..."

cd web && npm run build && cd ..

rm -rf internal/server/frontend
mkdir -p internal/server/frontend
cp -r web/dist/* internal/server/frontend/

info "Frontend built and copied to internal/server/frontend/"

# ---------------------------------------------------------------------------
# 5. Build Go binaries
# ---------------------------------------------------------------------------
echo ""
echo "[5/5] Building Go binaries..."

go mod tidy

mkdir -p bin

echo "  → Linux amd64..."
GOOS=linux GOARCH=amd64 go build -ldflags "-X github.com/avalokhq/avalok/internal/cli.Version=${VERSION}" -o bin/avalok ./cmd/avalok
info "bin/avalok"

echo "  → Windows amd64..."
GOOS=windows GOARCH=amd64 go build -ldflags "-X github.com/avalokhq/avalok/internal/cli.Version=${VERSION}" -o bin/avalok.exe ./cmd/avalok
info "bin/avalok.exe"

echo ""
echo "=== Build complete ==="
echo ""
ls -lh bin/avalok bin/avalok.exe
