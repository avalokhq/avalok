@echo off
setlocal EnableDelayedExpansion

if "%VERSION%"=="" set "VERSION=dev"

set "REQUIRED_NODE_MAJOR=22"
set "REQUIRED_GO_MAJOR=1"
set "REQUIRED_GO_MINOR=26"

echo === Avalok Build ===
echo.

rem ---------------------------------------------------------------------------
rem 1. Check Go
rem ---------------------------------------------------------------------------
echo [1/5] Checking Go...

where go >nul 2>&1
if !ERRORLEVEL! neq 0 (
    echo [X] Go is not installed. Install Go %REQUIRED_GO_MAJOR%.%REQUIRED_GO_MINOR%+ from https://go.dev/dl/
    exit /b 1
)

for /f "tokens=3" %%v in ('go version') do set "GO_RAW=%%v"
set "GO_VER=!GO_RAW:go=!"
for /f "tokens=1,2 delims=." %%a in ("!GO_VER!") do (
    set "GO_MAJOR=%%a"
    set "GO_MINOR=%%b"
)

set "GO_OK=0"
if !GO_MAJOR! gtr %REQUIRED_GO_MAJOR% set "GO_OK=1"
if !GO_MAJOR! equ %REQUIRED_GO_MAJOR% if !GO_MINOR! geq %REQUIRED_GO_MINOR% set "GO_OK=1"

if "!GO_OK!"=="0" (
    echo [X] Go !GO_VER! found, but %REQUIRED_GO_MAJOR%.%REQUIRED_GO_MINOR%+ is required. Update from https://go.dev/dl/
    exit /b 1
)
echo [OK] Go !GO_VER!

rem ---------------------------------------------------------------------------
rem 2. Check Node.js (nvm-windows, fnm, system node)
rem ---------------------------------------------------------------------------
echo.
echo [2/5] Checking Node.js...

set "NODE_OK=0"
set "HAS_NVM=0"
set "HAS_FNM=0"

where nvm >nul 2>&1
if !ERRORLEVEL! equ 0 set "HAS_NVM=1"

where fnm >nul 2>&1
if !ERRORLEVEL! equ 0 set "HAS_FNM=1"

call :check_node
if "!NODE_OK!"=="1" (
    echo [OK] Node !NODE_DISPLAY!
    goto :node_done
)

if "!HAS_NVM!"=="1" (
    echo [!] Node %REQUIRED_NODE_MAJOR%+ not active. Attempting to switch via nvm...
    call nvm use %REQUIRED_NODE_MAJOR% >nul 2>&1
    call :check_node
    if "!NODE_OK!"=="1" (
        echo [OK] Switched to Node !NODE_DISPLAY! via nvm
        goto :node_done
    )
    echo [!] Installing Node %REQUIRED_NODE_MAJOR% via nvm...
    call nvm install %REQUIRED_NODE_MAJOR% >nul 2>&1
    call nvm use %REQUIRED_NODE_MAJOR% >nul 2>&1
    call :check_node
    if "!NODE_OK!"=="1" (
        echo [OK] Installed and switched to Node !NODE_DISPLAY! via nvm
        goto :node_done
    )
)

if "!HAS_FNM!"=="1" (
    echo [!] Node %REQUIRED_NODE_MAJOR%+ not active. Attempting to switch via fnm...
    call fnm use %REQUIRED_NODE_MAJOR% >nul 2>&1
    fnm env --shell cmd > "%TEMP%\fnm_env.bat" 2>nul
    call "%TEMP%\fnm_env.bat"
    del "%TEMP%\fnm_env.bat" 2>nul
    call :check_node
    if "!NODE_OK!"=="1" (
        echo [OK] Switched to Node !NODE_DISPLAY! via fnm
        goto :node_done
    )
    echo [!] Installing Node %REQUIRED_NODE_MAJOR% via fnm...
    call fnm install %REQUIRED_NODE_MAJOR% >nul 2>&1
    call fnm use %REQUIRED_NODE_MAJOR% >nul 2>&1
    fnm env --shell cmd > "%TEMP%\fnm_env.bat" 2>nul
    call "%TEMP%\fnm_env.bat"
    del "%TEMP%\fnm_env.bat" 2>nul
    call :check_node
    if "!NODE_OK!"=="1" (
        echo [OK] Installed and switched to Node !NODE_DISPLAY! via fnm
        goto :node_done
    )
)

where node >nul 2>&1
if !ERRORLEVEL! equ 0 (
    for /f "delims=" %%v in ('node -v') do set "CURRENT_NODE=%%v"
    echo [X] Node !CURRENT_NODE! found, but %REQUIRED_NODE_MAJOR%+ is required. Run: nvm install %REQUIRED_NODE_MAJOR%
) else (
    echo [X] Node.js is not installed. Install Node %REQUIRED_NODE_MAJOR%+ from https://nodejs.org/ or via nvm/fnm.
)
exit /b 1

:node_done

where npm >nul 2>&1
if !ERRORLEVEL! neq 0 (
    echo [X] npm not found. It should come with Node.js — check your installation.
    exit /b 1
)

rem ---------------------------------------------------------------------------
rem 3. Install frontend dependencies
rem ---------------------------------------------------------------------------
echo.
echo [3/5] Installing frontend dependencies...

pushd web

if exist "node_modules\.package-lock.json" if exist "package-lock.json" (
    echo [OK] node_modules up to date — skipping install
    goto :deps_done
)

if exist "package-lock.json" (
    call npm ci --loglevel=error
) else (
    echo [!] No package-lock.json found — running npm install (this will create one^)
    call npm install --loglevel=error
)
if !ERRORLEVEL! neq 0 (
    echo [X] npm install failed
    popd
    exit /b 1
)
echo [OK] Dependencies installed

:deps_done
popd

rem ---------------------------------------------------------------------------
rem 4. Build frontend + copy to embed directory
rem ---------------------------------------------------------------------------
echo.
echo [4/5] Building frontend...

pushd web
call npm run build
if !ERRORLEVEL! neq 0 (
    echo [X] Frontend build failed
    popd
    exit /b 1
)
popd

if exist internal\server\frontend rmdir /s /q internal\server\frontend
mkdir internal\server\frontend
xcopy /s /e /q web\dist\* internal\server\frontend\ >nul

echo [OK] Frontend built and copied to internal/server/frontend/

rem ---------------------------------------------------------------------------
rem 5. Build Go binaries
rem ---------------------------------------------------------------------------
echo.
echo [5/5] Building Go binaries...

go mod tidy
if !ERRORLEVEL! neq 0 (
    echo [X] go mod tidy failed
    exit /b 1
)

if not exist bin mkdir bin

echo   - Linux amd64...
set "GOOS=linux"
set "GOARCH=amd64"
go build -ldflags "-X github.com/avalokhq/avalok/internal/cli.Version=!VERSION!" -o bin/avalok ./cmd/avalok
if !ERRORLEVEL! neq 0 (
    echo [X] Linux build failed
    exit /b 1
)
echo [OK] bin/avalok

echo   - Windows amd64...
set "GOOS=windows"
set "GOARCH=amd64"
go build -ldflags "-X github.com/avalokhq/avalok/internal/cli.Version=!VERSION!" -o bin/avalok.exe ./cmd/avalok
if !ERRORLEVEL! neq 0 (
    echo [X] Windows build failed
    exit /b 1
)
echo [OK] bin/avalok.exe

echo.
echo === Build complete ===
echo.
dir bin\avalok bin\avalok.exe

endlocal
exit /b 0

rem ---------------------------------------------------------------------------
rem Subroutine: check_node
rem Sets NODE_OK=1 if node >= REQUIRED_NODE_MAJOR, NODE_DISPLAY to version
rem ---------------------------------------------------------------------------
:check_node
set "NODE_OK=0"
set "NODE_DISPLAY="
where node >nul 2>&1
if !ERRORLEVEL! neq 0 goto :eof
for /f "delims=" %%v in ('node -v') do set "NODE_RAW=%%v"
set "NODE_DISPLAY=!NODE_RAW!"
set "NODE_NUM=!NODE_RAW:v=!"
for /f "tokens=1 delims=." %%a in ("!NODE_NUM!") do set "NODE_MAJOR=%%a"
if !NODE_MAJOR! geq %REQUIRED_NODE_MAJOR% set "NODE_OK=1"
goto :eof
