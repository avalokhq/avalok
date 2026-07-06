package cli

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"os/signal"
	"runtime"
	"syscall"
	"time"

	"github.com/spf13/cobra"

	"github.com/avalokhq/avalok/internal/server"
)

func createCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "create",
		Short: "Create avalok resources",
		Long:  "Commands for creating avalok configuration and resources.",
	}

	cmd.AddCommand(createConfigCmd())

	return cmd
}

func createConfigCmd() *cobra.Command {
	var host string
	var port int
	var output string

	cmd := &cobra.Command{
		Use:   "config",
		Short: "Open the config builder UI",
		Long:  "Start a local server and open the browser-based workspace config builder.",
		RunE: func(cmd *cobra.Command, args []string) error {
			return runCreateConfig(cmd.Context(), host, port, output)
		},
	}

	cmd.Flags().StringVar(&host, "host", "127.0.0.1", "Bind address (use 0.0.0.0 for all interfaces)")
	cmd.Flags().IntVarP(&port, "port", "p", 9091, "HTTP server port")
	cmd.Flags().StringVarP(&output, "output", "o", "", "Default output filename for generated YAML")

	return cmd
}

func runCreateConfig(ctx context.Context, host string, port int, output string) error {
	ctx, cancel := signal.NotifyContext(ctx, os.Interrupt, syscall.SIGTERM)
	defer cancel()

	handler := server.NewConfigBuilderHandler(output)

	addr := fmt.Sprintf("%s:%d", host, port)
	httpSrv := &http.Server{
		Addr:         addr,
		Handler:      handler,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 30 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	displayHost := displayHostname(host)
	url := fmt.Sprintf("http://%s:%d/?mode=config", displayHost, port)

	go func() {
		if err := httpSrv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			fmt.Fprintf(os.Stderr, "server error: %v\n", err)
			cancel()
		}
	}()

	// Open browser
	if err := openBrowser(url); err != nil {
		fmt.Fprintf(os.Stderr, "Could not open browser: %v\n", err)
	}

	fmt.Println("Avalok Config Builder")
	fmt.Println()
	fmt.Printf("  UI: %s\n", url)
	fmt.Println()
	fmt.Println("Press Ctrl+C to stop")

	<-ctx.Done()
	fmt.Println("\nShutting down...")

	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer shutdownCancel()
	return httpSrv.Shutdown(shutdownCtx)
}

func openBrowser(url string) error {
	var cmd *exec.Cmd

	switch runtime.GOOS {
	case "linux":
		cmd = exec.Command("xdg-open", url)
	case "darwin":
		cmd = exec.Command("open", url)
	case "windows":
		cmd = exec.Command("cmd", "/c", "start", url)
	default:
		return fmt.Errorf("unsupported platform: %s", runtime.GOOS)
	}

	return cmd.Start()
}
