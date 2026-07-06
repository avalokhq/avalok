package cli

import (
	"context"
	"fmt"
	"os"
	"os/signal"
	"strings"
	"syscall"

	"github.com/spf13/cobra"

	"github.com/avalokhq/avalok/internal/provider"
	_ "github.com/avalokhq/avalok/internal/provider/containerd"
	"github.com/avalokhq/avalok/internal/stream"
	_ "github.com/avalokhq/avalok/internal/provider/docker"
	_ "github.com/avalokhq/avalok/internal/provider/file"
	_ "github.com/avalokhq/avalok/internal/provider/iis"
	_ "github.com/avalokhq/avalok/internal/provider/journalctl"
	_ "github.com/avalokhq/avalok/internal/provider/kubernetes"
	_ "github.com/avalokhq/avalok/internal/provider/self"
	_ "github.com/avalokhq/avalok/internal/provider/ssh"
	_ "github.com/avalokhq/avalok/internal/provider/windowseventlog"
	_ "github.com/avalokhq/avalok/internal/provider/winrm"
	"github.com/avalokhq/avalok/internal/workspace"
)

func tailCmd() *cobra.Command {
	var follow bool
	var tail int
	var workspaceFile string

	cmd := &cobra.Command{
		Use:   "tail <workspace>/<environment>/<service>",
		Short: "Stream logs from a service",
		Long:  "Stream logs from a service in a workspace. Requires a workspace YAML file.",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			return runTail(cmd.Context(), args[0], workspaceFile, follow, tail)
		},
	}

	cmd.Flags().BoolVarP(&follow, "follow", "f", false, "Follow log output")
	cmd.Flags().IntVarP(&tail, "tail", "n", 50, "Number of lines to show from end")
	cmd.Flags().StringVarP(&workspaceFile, "workspace", "w", "", "Workspace YAML file (required)")
	cmd.MarkFlagRequired("workspace")

	return cmd
}

func runTail(ctx context.Context, target string, workspaceFile string, follow bool, tailLines int) error {
	ctx, cancel := signal.NotifyContext(ctx, os.Interrupt, syscall.SIGTERM)
	defer cancel()

	parts := strings.SplitN(target, "/", 3)
	if len(parts) != 3 {
		return fmt.Errorf("target must be in format <workspace>/<environment>/<service>, got %q", target)
	}
	wsName, envName, svcName := parts[0], parts[1], parts[2]

	w, err := workspace.Load(workspaceFile)
	if err != nil {
		return fmt.Errorf("loading workspace: %w", err)
	}
	if w.Name != wsName {
		return fmt.Errorf("workspace name mismatch: file has %q, requested %q", w.Name, wsName)
	}

	resolved, err := w.ResolveService(envName, svcName)
	if err != nil {
		return err
	}

	p, ok := provider.Get(resolved.Service.Provider)
	if !ok {
		return fmt.Errorf("unknown provider: %q", resolved.Service.Provider)
	}

	if err := p.Connect(ctx, resolved.Config); err != nil {
		return fmt.Errorf("connecting to %s: %w", svcName, err)
	}
	defer p.Close()

	instances, err := p.ListInstances(ctx)
	if err != nil {
		return fmt.Errorf("listing instances: %w", err)
	}

	if len(instances) == 0 {
		return fmt.Errorf("no log instances found for service %q", svcName)
	}

	fmt.Fprintf(os.Stderr, "Streaming logs from %s/%s/%s (%d instances)\n", wsName, envName, svcName, len(instances))

	var streams []<-chan provider.LogEntry
	for _, inst := range instances {
		s, sErr := p.Stream(ctx, inst.ID, provider.StreamOpts{
			Follow: follow,
			Tail:   tailLines,
		})
		if sErr != nil {
			fmt.Fprintf(os.Stderr, "[warn] stream %s: %v\n", inst.ID, sErr)
			continue
		}
		streams = append(streams, s)
	}
	if len(streams) == 0 {
		return fmt.Errorf("failed to stream any instances for service %q", svcName)
	}

	ch := stream.MergeAll(ctx, streams...)
	multiInstance := len(instances) > 1

	for entry := range ch {
		if multiInstance {
			fmt.Printf("[%s] %s\n", entry.Instance, entry.Line)
		} else {
			fmt.Println(entry.Line)
		}
	}

	return nil
}
