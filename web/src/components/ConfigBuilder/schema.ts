export interface FieldDef {
  key: string
  label: string
  placeholder: string
  required?: boolean
  help?: string
  type?: 'text' | 'number' | 'password' | 'toggle'
}

export const PROVIDERS = [
  { value: 'file', label: 'File', desc: 'Local or remote log files' },
  { value: 'docker', label: 'Docker', desc: 'Docker container logs' },
  { value: 'kubernetes', label: 'Kubernetes', desc: 'Pod logs from deployments, statefulsets, or pods' },
  { value: 'journalctl', label: 'Journalctl', desc: 'Systemd journal logs' },
  { value: 'ssh', label: 'SSH', desc: 'Remote command output' },
  { value: 'containerd', label: 'Containerd', desc: 'Containerd/CRI logs' },
  { value: 'windows-eventlog', label: 'Windows Event Log', desc: 'Windows Event Viewer' },
  { value: 'iis', label: 'IIS', desc: 'IIS W3C access logs' },
  { value: 'winrm', label: 'WinRM', desc: 'Remote Windows via WinRM' },
] as const

export const PROVIDER_FIELDS: Record<string, FieldDef[]> = {
  file: [
    { key: 'path', label: 'File Path', placeholder: '/var/log/app/*.log', required: true, help: 'Absolute path or glob pattern' },
    { key: 'log_dir', label: 'Log Directory', placeholder: '/var/log/app/', help: 'Directory containing rotated/compressed logs. Enables file browser.' },
    { key: 'read_all', label: 'Read All', type: 'toggle', placeholder: '', help: 'Read all existing content from the file before tailing. When off, only new lines are streamed' },
  ],
  docker: [
    { key: 'container_name', label: 'Container Name', placeholder: 'my-container', required: true },
  ],
  kubernetes: [
    { key: 'deployment', label: 'Deployment', placeholder: 'my-deployment', help: 'Deployment name — auto-discovers pods from its selector' },
    { key: 'statefulset', label: 'StatefulSet', placeholder: 'my-statefulset', help: 'StatefulSet name — auto-discovers pods from its selector' },
    { key: 'daemonset', label: 'DaemonSet', placeholder: 'my-daemonset', help: 'DaemonSet name — auto-discovers pods from its selector' },
    { key: 'pod', label: 'Pod', placeholder: 'my-pod-abc123', help: 'Direct pod name — target a specific pod' },
    { key: 'selector', label: 'Label Selector', placeholder: 'app=my-service', help: 'Raw label selector (advanced). Overrides deployment/statefulset/daemonset if set' },
    { key: 'container', label: 'Container', placeholder: 'main', help: 'Specific container name. Leave empty for the default container' },
    { key: 'all_containers', label: 'All Containers', type: 'toggle', placeholder: '', help: 'Stream logs from all containers in each pod (including init containers)' },
    { key: 'previous', label: 'Previous Container', type: 'toggle', placeholder: '', help: 'Fetch logs from the previous terminated container instance' },
    { key: 'tail_lines', label: 'Tail Lines', type: 'number', placeholder: '', help: 'Number of lines to fetch from the end. Leave empty to stream all logs from the start' },
  ],
  journalctl: [
    { key: 'unit', label: 'Systemd Unit', placeholder: 'myapp.service', required: true },
  ],
  ssh: [
    { key: 'command', label: 'Remote Command', placeholder: 'tail -f /var/log/syslog', required: true, help: 'Command to execute on the remote host' },
  ],
  containerd: [
    { key: 'container_name', label: 'Container Name', placeholder: 'my-container', required: true },
  ],
  'windows-eventlog': [
    { key: 'channel', label: 'Event Channel', placeholder: 'Application', required: true },
    { key: 'source', label: 'Event Source', placeholder: 'MyApp', help: 'Optional: filter by source' },
  ],
  iis: [
    { key: 'site', label: 'IIS Site Name', placeholder: 'Default Web Site', required: true },
  ],
  winrm: [
    { key: 'path', label: 'File Path', placeholder: 'C:\\Logs\\app.log', help: 'Remote file path on the Windows host' },
    { key: 'command', label: 'PowerShell Command', placeholder: 'Get-Content C:\\Logs\\app.log -Wait', help: 'Custom command (overrides path)' },
  ],
}

export const TARGET_TYPES = [
  { value: 'kubernetes', label: 'Kubernetes', desc: 'Kubernetes cluster' },
  { value: 'ssh', label: 'SSH', desc: 'Remote host via SSH' },
  { value: 'winrm', label: 'WinRM', desc: 'Remote Windows via WinRM' },
  { value: 'local', label: 'Local', desc: 'Local machine' },
  { value: 'windows', label: 'Windows', desc: 'Local Windows host' },
] as const

export const TARGET_FIELDS: Record<string, FieldDef[]> = {
  kubernetes: [
    { key: 'context', label: 'Kube Context', placeholder: 'my-cluster-context', help: 'kubeconfig context name (from ~/.kube/config)' },
    { key: 'namespace', label: 'Namespace', placeholder: 'default', required: true },
    { key: 'kubeconfig', label: 'Kubeconfig Path', placeholder: '~/.kube/config', help: 'Explicit path to kubeconfig file. Leave empty to use default (~/.kube/config or $KUBECONFIG)' },
    { key: 'proxy_url', label: 'Proxy URL', placeholder: 'socks5://localhost:1080', help: 'HTTP/SOCKS proxy for private clusters (e.g. AKS private endpoint)' },
  ],
  ssh: [
    { key: 'host', label: 'SSH Host', placeholder: 'dev-server-01', required: true, help: 'Hostname or IP address (can match ~/.ssh/config entry)' },
    { key: 'user', label: 'SSH User', placeholder: 'ubuntu', help: 'Optional if configured in ~/.ssh/config' },
    { key: 'port', label: 'SSH Port', placeholder: '22', help: 'Optional, defaults to 22' },
    { key: 'key_path', label: 'SSH Key Path', placeholder: '~/.ssh/id_ed25519', help: 'Optional if using SSH agent or ~/.ssh/config' },
    { key: 'password', label: 'SSH Password', placeholder: '', type: 'password', help: 'Password auth (requires sshpass on the host). Leave empty for key-based auth' },
    { key: 'passphrase', label: 'Key Passphrase', placeholder: '', type: 'password', help: 'Passphrase for encrypted SSH private keys. Leave empty if key is unencrypted' },
    { key: 'sudo', label: 'Use Sudo', placeholder: '', type: 'toggle', help: 'Prepend sudo to remote commands (requires passwordless sudo on target)' },
  ],
  winrm: [
    { key: 'host', label: 'Host', placeholder: '192.168.1.50', required: true, help: 'Hostname or IP of the Windows machine' },
    { key: 'user', label: 'Username', placeholder: 'Administrator', required: true },
    { key: 'password', label: 'Password', placeholder: '', type: 'password', required: true },
    { key: 'port', label: 'Port', placeholder: '5985', help: 'Default: 5985 (HTTP) or 5986 (HTTPS)' },
    { key: 'use_https', label: 'Use HTTPS', placeholder: '', type: 'toggle', help: 'Connect over HTTPS (port 5986)' },
    { key: 'insecure', label: 'Skip TLS Verify', placeholder: '', type: 'toggle', help: 'Accept self-signed certificates' },
  ],
  local: [],
  windows: [
    { key: 'host', label: 'Host', placeholder: 'localhost', help: 'Leave empty for local machine' },
  ],
}

export const SENSITIVE_KEYS = new Set(
  Object.values(TARGET_FIELDS)
    .flat()
    .filter(f => f.type === 'password')
    .map(f => f.key)
)

export function providerFieldsFor(provider: string): FieldDef[] {
  return PROVIDER_FIELDS[provider] ?? []
}

export function targetFieldsFor(type: string): FieldDef[] {
  return TARGET_FIELDS[type] ?? []
}
