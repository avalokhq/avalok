package server

import (
	"context"
	"fmt"
	"strings"

	"github.com/avalokhq/avalok/internal/shellutil"
	"github.com/avalokhq/avalok/internal/workspace"
)

// needsSSHTransport returns true when a service is on an SSH target but
// its provider doesn't natively handle SSH (docker, file, containerd, etc.).
// Providers that already do SSH internally (journalctl, ssh) return false.
func needsSSHTransport(resolved *workspace.ResolvedService) bool {
	if resolved.Target.Type != "ssh" {
		return false
	}
	switch resolved.Service.Provider {
	case "ssh", "journalctl", "kubernetes":
		return false
	}
	return true
}

// buildRemoteCommand builds the shell command to run a provider's operation
// on a remote host via SSH. Prepends sudo if the config has sudo=true.
func buildRemoteCommand(providerType string, config map[string]any, follow bool, tail int) string {
	sudo := cfgBool(config, "sudo")

	var cmd string
	switch providerType {
	case "docker":
		container := shellutil.Quote(cfgStr(config, "container_name"))
		cmd = "docker logs"
		if follow {
			cmd += " --follow"
		}
		if tail > 0 {
			cmd += fmt.Sprintf(" --tail %d", tail)
		}
		cmd += " --timestamps " + container

	case "file":
		qpath := shellutil.Quote(cfgStr(config, "path"))
		readAll := cfgBool(config, "read_all")
		sudoPrefix := ""
		if sudo {
			sudoPrefix = "sudo "
		}
		emptyCheck := fmt.Sprintf("%s[ -s %s ] || echo '[info] log file is empty, waiting for new logs'; ", sudoPrefix, qpath)
		if follow {
			if tail > 0 {
				cmd = emptyCheck + fmt.Sprintf("%stail -n %d -f %s", sudoPrefix, tail, qpath)
			} else {
				cmd = emptyCheck + fmt.Sprintf("%stail -n +1 -f %s", sudoPrefix, qpath)
			}
		} else if readAll {
			cmd = emptyCheck + fmt.Sprintf("%scat %s", sudoPrefix, qpath)
		} else if tail > 0 {
			cmd = fmt.Sprintf("%stail -n %d %s", sudoPrefix, tail, qpath)
		} else {
			cmd = emptyCheck + fmt.Sprintf("%scat %s", sudoPrefix, qpath)
		}
		sudo = false

	case "containerd":
		container := shellutil.Quote(cfgStr(config, "container_name"))
		cmd = "crictl logs"
		if follow {
			cmd += " -f"
		}
		if tail > 0 {
			cmd += fmt.Sprintf(" --tail %d", tail)
		}
		cmd += " " + container

	default:
		return fmt.Sprintf("echo 'unsupported provider over SSH: %s'", providerType)
	}

	if sudo {
		cmd = "sudo " + cmd
	}
	return cmd + " 2>&1"
}

// sshTransportConfig builds a config map for the SSH provider to execute
// a remote command, preserving host/user/port/key_path from the resolved config.
func sshTransportConfig(resolved *workspace.ResolvedService, command string) map[string]any {
	config := map[string]any{
		"host":    resolved.Config["host"],
		"command": command,
	}
	if v, ok := resolved.Config["user"]; ok {
		config["user"] = v
	}
	if v, ok := resolved.Config["port"]; ok {
		config["port"] = v
	}
	if v, ok := resolved.Config["key_path"]; ok {
		config["key_path"] = v
	}
	if v, ok := resolved.Config["private_key"]; ok {
		config["private_key"] = v
	}
	if v, ok := resolved.Config["password"]; ok {
		config["password"] = v
	}
	if v, ok := resolved.Config["passphrase"]; ok {
		config["passphrase"] = v
	}
	return config
}

func (s *Server) resolveWithCredentials(ctx context.Context, resolved *workspace.ResolvedService, follow bool, tail int) (string, map[string]any) {
	if s.creds != nil {
		if resolved.Target.CredentialProfile != "" {
			resolved.Config["credential_profile"] = resolved.Target.CredentialProfile
		}
		creds, err := s.creds.Resolve(ctx, resolved.Service.Provider, resolved.Target.Type, resolved.Config)
		if err == nil {
			resolved.Config = creds.Config
		}
	}
	return resolveTransport(resolved, follow, tail)
}

// resolveTransport checks whether a resolved service needs SSH or WinRM
// transport wrapping and returns the appropriate provider name and config.
func resolveTransport(resolved *workspace.ResolvedService, follow bool, tail int) (string, map[string]any) {
	if needsSSHTransport(resolved) {
		cmd := buildRemoteCommand(resolved.Service.Provider, resolved.Config, follow, tail)
		return "ssh", sshTransportConfig(resolved, cmd)
	}
	if needsWinRMTransport(resolved) {
		cmd := buildPowerShellCommand(resolved.Service.Provider, resolved.Config, follow, tail)
		return "winrm", winrmTransportConfig(resolved, cmd)
	}
	return resolved.Service.Provider, resolved.Config
}

func needsWinRMTransport(resolved *workspace.ResolvedService) bool {
	if resolved.Target.Type != "winrm" {
		return false
	}
	switch resolved.Service.Provider {
	case "winrm":
		return false
	}
	return true
}

func buildPowerShellCommand(providerType string, config map[string]any, follow bool, tail int) string {
	switch providerType {
	case "file":
		path := cfgStr(config, "path")
		escaped := strings.ReplaceAll(path, "'", "''")
		readAll := cfgBool(config, "read_all")
		emptyCheck := fmt.Sprintf("if ((Get-Item '%s').Length -eq 0) { Write-Output '[info] log file is empty, waiting for new logs' }; ", escaped)
		if follow {
			if readAll {
				return emptyCheck + fmt.Sprintf("Get-Content -Path '%s' -Wait", escaped)
			}
			if tail > 0 {
				return emptyCheck + fmt.Sprintf("Get-Content -Path '%s' -Wait -Tail %d", escaped, tail)
			}
			return emptyCheck + fmt.Sprintf("Get-Content -Path '%s' -Wait", escaped)
		}
		if tail > 0 && !readAll {
			return fmt.Sprintf("Get-Content -Path '%s' -Tail %d", escaped, tail)
		}
		return emptyCheck + fmt.Sprintf("Get-Content -Path '%s'", escaped)

	case "docker":
		container := cfgStr(config, "container_name")
		escaped := strings.ReplaceAll(container, "'", "''")
		cmd := "docker logs"
		if follow {
			cmd += " --follow"
		}
		if tail > 0 {
			cmd += fmt.Sprintf(" --tail %d", tail)
		}
		cmd += " --timestamps '" + escaped + "'"
		return cmd

	case "windows-eventlog":
		channel := cfgStr(config, "channel")
		if channel == "" {
			channel = "Application"
		}
		escaped := strings.ReplaceAll(channel, "'", "''")
		count := 100
		if tail > 0 {
			count = tail
		}
		return fmt.Sprintf("wevtutil qe '%s' /rd:true /f:text /c:%d", escaped, count)

	case "iis":
		path := cfgStr(config, "path")
		escaped := strings.ReplaceAll(path, "'", "''")
		if follow {
			if tail > 0 {
				return fmt.Sprintf("Get-Content -Path '%s' -Wait -Tail %d", escaped, tail)
			}
			return fmt.Sprintf("Get-Content -Path '%s' -Wait", escaped)
		}
		if tail > 0 {
			return fmt.Sprintf("Get-Content -Path '%s' -Tail %d", escaped, tail)
		}
		return fmt.Sprintf("Get-Content -Path '%s'", escaped)

	default:
		return fmt.Sprintf("Write-Output 'unsupported provider over WinRM: %s'", providerType)
	}
}

func winrmTransportConfig(resolved *workspace.ResolvedService, command string) map[string]any {
	config := map[string]any{
		"host":    resolved.Config["host"],
		"command": command,
	}
	if v, ok := resolved.Config["user"]; ok {
		config["user"] = v
	}
	if v, ok := resolved.Config["port"]; ok {
		config["port"] = v
	}
	if v, ok := resolved.Config["password"]; ok {
		config["password"] = v
	}
	if v, ok := resolved.Config["use_https"]; ok {
		config["use_https"] = v
	}
	if v, ok := resolved.Config["insecure"]; ok {
		config["insecure"] = v
	}
	return config
}

func cfgStr(config map[string]any, key string) string {
	if v, ok := config[key].(string); ok {
		return v
	}
	return ""
}

func cfgBool(config map[string]any, key string) bool {
	if v, ok := config[key].(bool); ok {
		return v
	}
	return false
}
