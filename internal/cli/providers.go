package cli

import (
	"fmt"
	"sort"

	"github.com/spf13/cobra"

	"github.com/avalokhq/avalok/internal/provider"
	_ "github.com/avalokhq/avalok/internal/provider/azureblob"
	_ "github.com/avalokhq/avalok/internal/provider/azurefile"
	_ "github.com/avalokhq/avalok/internal/provider/containerd"
	_ "github.com/avalokhq/avalok/internal/provider/docker"
	_ "github.com/avalokhq/avalok/internal/provider/file"
	_ "github.com/avalokhq/avalok/internal/provider/gcs"
	_ "github.com/avalokhq/avalok/internal/provider/iis"
	_ "github.com/avalokhq/avalok/internal/provider/journalctl"
	_ "github.com/avalokhq/avalok/internal/provider/kubernetes"
	_ "github.com/avalokhq/avalok/internal/provider/s3"
	_ "github.com/avalokhq/avalok/internal/provider/self"
	_ "github.com/avalokhq/avalok/internal/provider/ssh"
	_ "github.com/avalokhq/avalok/internal/provider/windowseventlog"
	_ "github.com/avalokhq/avalok/internal/provider/winrm"
)

func providersCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "providers",
		Short: "List available log providers",
		Run: func(cmd *cobra.Command, args []string) {
			names := provider.Available()
			sort.Strings(names)
			fmt.Printf("Available providers (%d):\n", len(names))
			for _, name := range names {
				fmt.Printf("  - %s\n", name)
			}
		},
	}
}
