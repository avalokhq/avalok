package cli

import (
	"bufio"
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"net"
	"os"
	"os/signal"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"time"

	"github.com/spf13/cobra"

	"github.com/avalokhq/avalok/internal/credential/operator"
	"github.com/avalokhq/avalok/internal/logbuffer"
	_ "github.com/avalokhq/avalok/internal/provider/containerd"
	_ "github.com/avalokhq/avalok/internal/provider/docker"
	_ "github.com/avalokhq/avalok/internal/provider/file"
	_ "github.com/avalokhq/avalok/internal/provider/iis"
	_ "github.com/avalokhq/avalok/internal/provider/journalctl"
	_ "github.com/avalokhq/avalok/internal/provider/kubernetes"
	selfprovider "github.com/avalokhq/avalok/internal/provider/self"
	_ "github.com/avalokhq/avalok/internal/provider/ssh"
	_ "github.com/avalokhq/avalok/internal/provider/windowseventlog"
	_ "github.com/avalokhq/avalok/internal/provider/winrm"
	"github.com/avalokhq/avalok/internal/server"
	"github.com/avalokhq/avalok/internal/store"
	"github.com/avalokhq/avalok/internal/store/memory"
	"github.com/avalokhq/avalok/internal/workspace"
)

func serveCmd() *cobra.Command {
	var host string
	var port int
	var tokens int
	var scope bool
	var scopeFilter string

	cmd := &cobra.Command{
		Use:   "serve [workspace.yaml...]",
		Short: "Start avalok in local mode",
		Long:  "Load workspace YAML files and serve logs using the operator's local credentials.",
		Args:  cobra.MinimumNArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			return runServe(cmd.Context(), args, host, port, tokens, scope, scopeFilter)
		},
	}

	cmd.Flags().StringVar(&host, "host", "0.0.0.0", "Bind address (0.0.0.0 for all interfaces, 127.0.0.1 for localhost only)")
	cmd.Flags().IntVarP(&port, "port", "p", 9090, "HTTP server port")
	cmd.Flags().IntVar(&tokens, "tokens", 1, "Number of access tokens to generate")
	cmd.Flags().BoolVar(&scope, "scope", false, "Interactively select which environments and services to share")
	cmd.Flags().StringVar(&scopeFilter, "allow", "", "Comma-separated scope paths (e.g. workspace/env/service)")

	return cmd
}

func runServe(ctx context.Context, yamlPaths []string, host string, port int, tokenCount int, interactiveScope bool, scopeFilter string) error {
	ctx, cancel := signal.NotifyContext(ctx, os.Interrupt, syscall.SIGTERM)
	defer cancel()

	buf := logbuffer.New(2000)
	selfprovider.SetBuffer(buf)
	logHandler := server.SetupLogger(buf, "")
	defer logHandler.Close()

	memStore := memory.New()
	credResolver := operator.New()

	fmt.Println("Avalok — secure log access broker")
	fmt.Println()

	var allWorkspaces []*workspace.Workspace

	for _, path := range yamlPaths {
		absPath, err := filepath.Abs(path)
		if err != nil {
			return fmt.Errorf("resolving path %q: %w", path, err)
		}

		w, err := workspace.Load(absPath)
		if err != nil {
			return fmt.Errorf("loading workspace %q: %w", path, err)
		}

		if err := memStore.SaveWorkspace(ctx, w); err != nil {
			return fmt.Errorf("saving workspace %q: %w", w.Name, err)
		}

		allWorkspaces = append(allWorkspaces, w)

		fmt.Printf("  Loaded workspace: %s (%s)\n", w.Name, w.Description)
		for _, env := range w.Environments {
			resolved, _ := w.Resolve(env.Name)
			fmt.Printf("    %s: %d targets, %d services\n", env.Name, len(env.Targets), len(resolved))
			for _, rs := range resolved {
				targetType := rs.Target.Type
				providerType := rs.Service.Provider
				label := rs.Service.FriendlyName
				if label == "" {
					label = rs.Service.Name
				}
				fmt.Printf("      • %s [%s on %s target]\n", label, providerType, targetType)
			}
		}
	}

	// Determine scope
	var scopePaths []string

	if scopeFilter != "" {
		scopePaths = strings.Split(scopeFilter, ",")
		for i := range scopePaths {
			scopePaths[i] = strings.TrimSpace(scopePaths[i])
		}
		scopePaths = resolveShortScopes(scopePaths, allWorkspaces)
	} else if interactiveScope {
		var err error
		scopePaths, err = runInteractiveScope(allWorkspaces)
		if err != nil {
			return fmt.Errorf("scope selection: %w", err)
		}
	}

	fmt.Println()

	if len(scopePaths) > 0 {
		fmt.Println("Scope (shared access limited to):")
		for _, s := range scopePaths {
			fmt.Printf("  • %s\n", s)
		}
		fmt.Println()
	}

	displayHost := displayHostname(host)

	fmt.Println("Access tokens:")
	for i := range tokenCount {
		token := generateToken()
		user := &store.User{
			ID:       fmt.Sprintf("token-%d", i+1),
			Username: fmt.Sprintf("user-%d", i+1),
			Role:     "viewer",
			Token:    token,
			Scope:    scopePaths,
		}
		if err := memStore.CreateUser(ctx, user); err != nil {
			return fmt.Errorf("creating token user: %w", err)
		}
		fmt.Printf("  http://%s:%d?token=%s\n", displayHost, port, token)
	}

	srv := server.New(memStore, credResolver)

	fmt.Println("Checking service connectivity...")
	fmt.Println()
	results := srv.CheckAllServices(ctx)
	upCount, downCount := 0, 0
	for _, r := range results {
		if r.Status == "up" {
			upCount++
			fmt.Printf("  \033[32m✓\033[0m %s/%s/%s [%s]\n", r.Workspace, r.Environment, r.Service, r.Provider)
		} else {
			downCount++
			fmt.Printf("  \033[31m✗\033[0m %s/%s/%s [%s] — %s\n", r.Workspace, r.Environment, r.Service, r.Provider, r.Error)
		}
	}
	fmt.Println()
	fmt.Printf("  %d up, %d down, %d total\n", upCount, downCount, len(results))

	addr := fmt.Sprintf("%s:%d", host, port)

	go func() {
		fmt.Printf("\nListening on %s:%d\n", host, port)
		fmt.Println("Press Ctrl+C to stop")
		if err := srv.Start(addr); err != nil && ctx.Err() == nil {
			fmt.Fprintf(os.Stderr, "server error: %v\n", err)
			cancel()
		}
	}()

	<-ctx.Done()
	fmt.Println("\nShutting down...")

	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer shutdownCancel()
	return srv.Shutdown(shutdownCtx)
}

func runInteractiveScope(workspaces []*workspace.Workspace) ([]string, error) {
	scanner := bufio.NewScanner(os.Stdin)
	var result []string

	fmt.Println()

	for _, ws := range workspaces {
		fmt.Printf("━━ %s (%s) ━━\n", ws.Name, ws.Description)
		fmt.Println()

		// List environments
		fmt.Println("  Environments:")
		for i, env := range ws.Environments {
			svcCount := 0
			for _, t := range env.Targets {
				svcCount += len(t.AllServiceNames())
			}
			fmt.Printf("    [%d] %s (%d services)\n", i+1, env.Name, svcCount)
		}
		fmt.Println()
		fmt.Print("  Select environments (comma-separated numbers, or 'all', or 'skip'): ")

		if !scanner.Scan() {
			return nil, fmt.Errorf("unexpected end of input")
		}
		input := strings.TrimSpace(scanner.Text())

		if input == "skip" || input == "" {
			continue
		}

		var selectedEnvs []workspace.Environment
		if input == "all" {
			selectedEnvs = ws.Environments
		} else {
			indices := parseNumbers(input)
			for _, idx := range indices {
				if idx >= 1 && idx <= len(ws.Environments) {
					selectedEnvs = append(selectedEnvs, ws.Environments[idx-1])
				}
			}
		}

		for _, env := range selectedEnvs {
			resolved, err := ws.Resolve(env.Name)
			if err != nil || len(resolved) == 0 {
				continue
			}

			fmt.Println()
			fmt.Printf("  Services in %s/%s:\n", ws.Name, env.Name)
			for i, rs := range resolved {
				name := rs.Service.FriendlyName
				if name == "" {
					name = rs.Service.Name
				}
				fmt.Printf("    [%d] %s (%s) — %s\n", i+1, name, rs.Service.Name, rs.Service.Provider)
			}
			fmt.Println()
			fmt.Print("  Select services (comma-separated numbers, or 'all'): ")

			if !scanner.Scan() {
				return nil, fmt.Errorf("unexpected end of input")
			}
			svcInput := strings.TrimSpace(scanner.Text())

			if svcInput == "all" || svcInput == "" {
				result = append(result, ws.Name+"/"+env.Name)
			} else {
				indices := parseNumbers(svcInput)
				for _, idx := range indices {
					if idx >= 1 && idx <= len(resolved) {
						result = append(result, ws.Name+"/"+env.Name+"/"+resolved[idx-1].Service.Name)
					}
				}
			}
		}

		fmt.Println()
	}

	return result, nil
}

func parseNumbers(input string) []int {
	parts := strings.Split(input, ",")
	var nums []int
	for _, p := range parts {
		p = strings.TrimSpace(p)
		n, err := strconv.Atoi(p)
		if err == nil {
			nums = append(nums, n)
		}
	}
	return nums
}

func displayHostname(host string) string {
	if host == "0.0.0.0" || host == "" || host == "::" {
		if ip := outboundIP(); ip != "" {
			return ip
		}
		return "localhost"
	}
	return host
}

func outboundIP() string {
	conn, err := net.Dial("udp", "8.8.8.8:80")
	if err != nil {
		return ""
	}
	defer conn.Close()
	addr := conn.LocalAddr().(*net.UDPAddr)
	return addr.IP.String()
}

func generateToken() string {
	b := make([]byte, 16)
	rand.Read(b)
	return hex.EncodeToString(b)
}

// resolveShortScopes expands bare environment or service names against loaded
// workspaces. For example, "work" becomes "m-saat-sau-bees/work" if there is
// an environment named "work" in any loaded workspace. Already-qualified paths
// (containing "/") are left unchanged.
func resolveShortScopes(paths []string, workspaces []*workspace.Workspace) []string {
	resolved := make([]string, 0, len(paths))
	for _, p := range paths {
		if strings.Contains(p, "/") {
			resolved = append(resolved, p)
			continue
		}
		matched := false
		for _, ws := range workspaces {
			if ws.Name == p {
				resolved = append(resolved, p)
				matched = true
				break
			}
			for _, env := range ws.Environments {
				if env.Name == p {
					resolved = append(resolved, ws.Name+"/"+p)
					matched = true
					break
				}
				svcs, _ := ws.Resolve(env.Name)
				for _, rs := range svcs {
					if rs.Service.Name == p {
						resolved = append(resolved, ws.Name+"/"+env.Name+"/"+p)
						matched = true
						break
					}
				}
				if matched {
					break
				}
			}
			if matched {
				break
			}
		}
		if !matched {
			resolved = append(resolved, p)
		}
	}
	return resolved
}
