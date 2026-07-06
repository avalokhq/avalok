package cli

import (
	"fmt"
	"os"

	"github.com/spf13/cobra"
)

var Version = "dev"

func Execute() {
	rootCmd := &cobra.Command{
		Use:   "avalok",
		Short: "Secure log access broker",
		Long:  "avalok — secure, read-only log access without infrastructure access.",
	}

	rootCmd.AddCommand(versionCmd())
	rootCmd.AddCommand(serveCmd())
	rootCmd.AddCommand(serverCmd())
	rootCmd.AddCommand(tailCmd())
	rootCmd.AddCommand(providersCmd())
	rootCmd.AddCommand(createCmd())

	if err := rootCmd.Execute(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func versionCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "version",
		Short: "Print the version",
		Run: func(cmd *cobra.Command, args []string) {
			fmt.Printf("avalok %s\n", Version)
		},
	}
}
