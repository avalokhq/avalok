import { useState, useEffect } from 'react'
import { Plus, Trash2, Pencil, ChevronDown, ChevronRight, Copy, Check } from 'lucide-react'
import { EntityIconRaw } from '../ui/EntityIcon'
import { cn } from '../../lib/cn'
import PageHeader from '../ui/PageHeader'
import Tabs from '../ui/Tabs'
import Card from '../ui/Card'
import CollectionGrid from '../ui/CollectionGrid'
import DataTable from '../ui/DataTable'
import LayoutToggle from '../ui/LayoutToggle'
import { useLayoutToggle } from '../../lib/useLayoutToggle'
import Button from '../ui/Button'
import Alert from '../ui/Alert'
import Spinner from '../ui/Spinner'
import EmptyState from '../ui/EmptyState'
import FormField from '../ui/FormField'
import IconButton from '../ui/IconButton'
import Toggle from '../ui/Toggle'
import Input, { Textarea, Select } from '../ui/Input'
import ProviderIcon from '../ui/ProviderIcon'
import {
  adminListResources, adminGetResource, adminCreateResource, adminUpdateResource,
  adminDeleteResource, adminTestResource, adminListCredentials,
} from '../../lib/api'
import type { AdminResource, AdminCredential } from '../../lib/api'
import {
  type StorageField, type AzureAuthMethod,
  AZURE_AUTH_TABS, AZURE_AUTH_FIELDS, CRED_AUTH_KEY_SET,
  detectAzureAuth, isAzureType,
} from '../../lib/resourceConstants'

const KUBERNETES_LOGO = 'https://cdn.jsdelivr.net/gh/selfhst/icons@main/webp/kubernetes.webp'

interface Props {
  onNavigateResource?: (name: string, description: string, type: string) => void
}

export default function ManageResourcesPage({ onNavigateResource }: Props) {
  const [resources, setResources] = useState<AdminResource[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [editingResource, setEditingResource] = useState<AdminResource | null>(null)
  const [testResults, setTestResults] = useState<Record<string, { status: string; error?: string; message?: string }>>({})
  const [error, setError] = useState('')
  const { layout, changeLayout } = useLayoutToggle('avalok-manage-res-layout')

  async function load() {
    setLoading(true)
    try { setResources(await adminListResources() || []) } catch { setError('Failed to load resources') }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  async function handleDelete(name: string, e?: React.MouseEvent) {
    e?.stopPropagation()
    if (!confirm(`Delete resource "${name}"? This will not affect the cluster itself.`)) return
    try { await adminDeleteResource(name); load() } catch { setError('Failed to delete resource') }
  }

  async function handleTest(name: string) {
    setTestResults(prev => ({ ...prev, [name]: { status: 'testing' } }))
    try {
      const result = await adminTestResource(name)
      setTestResults(prev => ({ ...prev, [name]: result }))
    } catch {
      setTestResults(prev => ({ ...prev, [name]: { status: 'error', error: 'Test failed' } }))
    }
  }

  async function handleEdit(name: string) {
    try {
      const res = await adminGetResource(name)
      setEditingResource(res)
      setShowCreate(false)
    } catch { setError('Failed to load resource details') }
  }

  return (
    <div className="flex-1 overflow-auto">
      <div className="px-8 lg:px-16 py-8">
        <PageHeader
          title="Resources"
          actions={
            <div className="flex items-center gap-2">
              <Button onClick={() => { setShowCreate(!showCreate); setEditingResource(null) }}>
                <Plus className="w-4 h-4" /> Add Resource
              </Button>
              <LayoutToggle layout={layout} onChange={changeLayout} />
            </div>
          }
        />

        {error && <Alert variant="error" className="mb-4">{error}</Alert>}

        {showCreate && <AddResourceForm onDone={() => { setShowCreate(false); load() }} />}
        {editingResource && <AddResourceForm editing={editingResource} onDone={() => { setEditingResource(null); load() }} />}

        {loading ? <Spinner label="Loading resources..." /> : (
          resources.length > 0 ? (
            layout === 'list' ? (
              <DataTable
                columns={[
                  {
                    key: 'name',
                    header: 'Name',
                    render: (res: AdminResource) => (
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-accent-500/10 flex items-center justify-center shrink-0">
                          <ProviderIcon provider={res.type} className="w-5 h-5" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-[var(--text-primary)]">{res.name}</div>
                          {res.description && <div className="text-xs text-[var(--text-secondary)] mt-0.5 line-clamp-1">{res.description}</div>}
                        </div>
                      </div>
                    ),
                  },
                  {
                    key: 'type',
                    header: 'Type',
                    align: 'right' as const,
                    render: (res: AdminResource) => (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent-500/10 text-accent-400 border border-accent-500/20 font-medium">{res.type}</span>
                    ),
                  },
                  {
                    key: 'actions',
                    header: '',
                    className: 'w-32',
                    render: (res: AdminResource) => (
                      <div className="flex items-center gap-1 justify-end">
                        <Button variant="secondary" size="sm" onClick={(e: React.MouseEvent) => { e.stopPropagation(); handleTest(res.name) }}>Test</Button>
                        <IconButton variant={'accent' as const} onClick={(e: React.MouseEvent<HTMLButtonElement>) => { e.stopPropagation(); handleEdit(res.name) }} title="Edit">
                          <Pencil className="w-4 h-4" />
                        </IconButton>
                        <IconButton variant={'danger' as const} onClick={(e: React.MouseEvent<HTMLButtonElement>) => handleDelete(res.name, e)} title="Delete">
                          <Trash2 className="w-4 h-4" />
                        </IconButton>
                      </div>
                    ),
                  },
                  {
                    key: 'arrow',
                    header: '',
                    className: 'w-8',
                    render: () => <ChevronRight className="w-4 h-4 text-[var(--text-muted)]" />,
                  },
                ]}
                data={resources}
                keyFn={res => res.name}
                onRowClick={res => onNavigateResource?.(res.name, res.description || '', res.type)}
              />
            ) : (
              <CollectionGrid>
                {resources.map(res => (
                  <Card key={res.name} hover padding="lg" onClick={() => onNavigateResource?.(res.name, res.description || '', res.type)} className="cursor-pointer text-left group">
                    <div className="w-8 h-8 rounded-lg bg-accent-500/10 flex items-center justify-center mb-3">
                      <ProviderIcon provider={res.type} className="w-5 h-5" />
                    </div>
                    <div className="text-sm font-medium text-[var(--text-primary)] truncate">{res.name}</div>
                    <div className="text-xs text-[var(--text-secondary)] mt-1 line-clamp-2">{res.description || res.type}</div>
                    {testResults[res.name] && (
                      <div className={cn('text-xs mt-1',
                        testResults[res.name].status === 'ok' ? 'text-emerald-400' :
                        testResults[res.name].status === 'testing' ? 'text-[var(--text-muted)]' : 'text-red-400'
                      )}>
                        {testResults[res.name].status === 'ok'
                          ? (testResults[res.name].message || 'Connected')
                          : testResults[res.name].status === 'testing'
                            ? 'Testing...'
                            : testResults[res.name].error}
                      </div>
                    )}
                    <div className="flex items-center gap-2 mt-4 pt-3 border-t border-[var(--border-subtle)] w-full text-xs text-[var(--text-secondary)]">
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent-500/10 text-accent-400 border border-accent-500/20 font-medium">{res.type}</span>
                      <div className="ml-auto flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-all">
                        <Button variant="secondary" size="sm" onClick={e => { e.stopPropagation(); handleTest(res.name) }}>Test</Button>
                        <IconButton variant="accent" onClick={e => { e.stopPropagation(); handleEdit(res.name) }} title="Edit">
                          <Pencil className="w-3.5 h-3.5" />
                        </IconButton>
                        <IconButton variant="danger" onClick={e => handleDelete(res.name, e)} title="Delete">
                          <Trash2 className="w-3.5 h-3.5" />
                        </IconButton>
                      </div>
                    </div>
                  </Card>
                ))}
              </CollectionGrid>
            )
          ) : (
            <EmptyState
              icon={<EntityIconRaw kind="resource" className="w-6 h-6 text-amber-400 opacity-60" />}
              title="No resources yet"
              description="Add a Kubernetes cluster or cloud storage to get started."
            />
          )
        )}
      </div>
    </div>
  )
}

// --- Resource form constants ---

const SA_SETUP_COMMANDS = [
  { title: '1. Create namespace', command: 'kubectl create namespace avalok-system' },
  { title: '2. Create ServiceAccount', command: 'kubectl create serviceaccount avalok-reader -n avalok-system' },
  {
    title: '3. Create ClusterRole (read-only log access)',
    command: `cat <<EOF | kubectl apply -f -
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: avalok-reader
rules:
- apiGroups: [""]
  resources: ["pods", "pods/log", "namespaces"]
  verbs: ["get", "list", "watch"]
- apiGroups: ["apps"]
  resources: ["deployments", "statefulsets", "daemonsets"]
  verbs: ["get", "list"]
EOF`,
  },
  {
    title: '4. Bind ClusterRole to ServiceAccount',
    command: `kubectl create clusterrolebinding avalok-reader \\
  --clusterrole=avalok-reader \\
  --serviceaccount=avalok-system:avalok-reader`,
  },
  {
    title: '5. Create long-lived token',
    command: `cat <<EOF | kubectl apply -f -
apiVersion: v1
kind: Secret
metadata:
  name: avalok-reader-token
  namespace: avalok-system
  annotations:
    kubernetes.io/service-account.name: avalok-reader
type: kubernetes.io/service-account-token
EOF`,
  },
  {
    title: '6. Get the bearer token',
    command: `kubectl get secret avalok-reader-token -n avalok-system \\
  -o jsonpath='{.data.token}' | base64 -d`,
  },
  { title: '7. Get the API server URL', command: `kubectl cluster-info | grep 'control plane'` },
  {
    title: '8. Get CA certificate (optional, for private clusters)',
    command: `kubectl get secret avalok-reader-token -n avalok-system \\
  -o jsonpath='{.data.ca\\.crt}'`,
  },
]

const KUBECONFIG_SETUP_COMMANDS = [
  {
    title: '1. Create a dedicated ServiceAccount (recommended)',
    command: `kubectl create namespace avalok-system
kubectl create serviceaccount avalok-reader -n avalok-system`,
  },
  {
    title: '2. Create ClusterRole (read-only log access)',
    command: `cat <<EOF | kubectl apply -f -
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: avalok-reader
rules:
- apiGroups: [""]
  resources: ["pods", "pods/log", "namespaces"]
  verbs: ["get", "list", "watch"]
- apiGroups: ["apps"]
  resources: ["deployments", "statefulsets", "daemonsets"]
  verbs: ["get", "list"]
EOF`,
  },
  {
    title: '3. Bind ClusterRole to ServiceAccount',
    command: `kubectl create clusterrolebinding avalok-reader \\
  --clusterrole=avalok-reader \\
  --serviceaccount=avalok-system:avalok-reader`,
  },
  {
    title: '4. Generate a kubeconfig for the ServiceAccount',
    command: `SECRET=$(kubectl get sa avalok-reader -n avalok-system \\
  -o jsonpath='{.secrets[0].name}' 2>/dev/null)

# For Kubernetes >= 1.24 (token not auto-mounted):
cat <<EOF | kubectl apply -f -
apiVersion: v1
kind: Secret
metadata:
  name: avalok-reader-token
  namespace: avalok-system
  annotations:
    kubernetes.io/service-account.name: avalok-reader
type: kubernetes.io/service-account-token
EOF
SECRET=avalok-reader-token

TOKEN=$(kubectl get secret $SECRET -n avalok-system \\
  -o jsonpath='{.data.token}' | base64 -d)
CA=$(kubectl get secret $SECRET -n avalok-system \\
  -o jsonpath='{.data.ca\\.crt}')
SERVER=$(kubectl config view --minify \\
  -o jsonpath='{.clusters[0].cluster.server}')

cat <<EOF
apiVersion: v1
kind: Config
clusters:
- cluster:
    certificate-authority-data: $CA
    server: $SERVER
  name: avalok-cluster
contexts:
- context:
    cluster: avalok-cluster
    user: avalok-reader
  name: avalok-context
current-context: avalok-context
users:
- name: avalok-reader
  user:
    token: $TOKEN
EOF`,
  },
  { title: '5. Or use an existing kubeconfig', command: `cat ~/.kube/config` },
]

type AuthMethod = 'service-account' | 'kubeconfig'
type ResourceType = 'kubernetes' | 's3' | 'azure-blob' | 'azure-file' | 'gcs'

const RESOURCE_TYPE_OPTIONS: { value: ResourceType; label: string }[] = [
  { value: 'kubernetes', label: 'Kubernetes' },
  { value: 's3', label: 'S3 / S3-Compatible' },
  { value: 'azure-blob', label: 'Azure Blob Storage' },
  { value: 'azure-file', label: 'Azure File Share' },
  { value: 'gcs', label: 'Google Cloud Storage' },
]

const STORAGE_FIELDS: Record<string, StorageField[]> = {
  s3: [
    { key: 'bucket', label: 'Bucket', placeholder: 'my-log-bucket', required: true },
    { key: 'prefix', label: 'Prefix', placeholder: 'logs/app/', hint: 'Object key prefix' },
    { key: 'region', label: 'Region', placeholder: 'us-east-1', hint: 'AWS region' },
    { key: 'endpoint', label: 'Endpoint', placeholder: 'https://minio.example.com', hint: 'Custom endpoint for S3-compatible stores' },
    { key: 'access_key_id', label: 'Access Key ID', placeholder: '', hint: 'Leave empty for default credential chain' },
    { key: 'secret_access_key', label: 'Secret Access Key', placeholder: '', type: 'password', hint: 'Leave empty for default credential chain' },
    { key: 'poll_interval', label: 'Poll Interval (s)', placeholder: '30', hint: 'Seconds between checks for new log content (min 5)' },
    { key: 'pattern', label: 'File Pattern', placeholder: '*.log', hint: 'Glob pattern to filter objects' },
    { key: 'force_path_style', label: 'Force Path Style', placeholder: '', type: 'toggle', hint: 'Required for some S3-compatible stores' },
  ],
  'azure-blob': [
    { key: 'container', label: 'Container', placeholder: 'logs', required: true },
    { key: 'prefix', label: 'Prefix', placeholder: 'app/2024/', hint: 'Blob name prefix' },
    { key: 'poll_interval', label: 'Poll Interval (s)', placeholder: '30', hint: 'Seconds between checks for new log content (min 5)' },
    { key: 'pattern', label: 'File Pattern', placeholder: '*.log', hint: 'Glob pattern to filter blobs' },
  ],
  'azure-file': [
    { key: 'share_name', label: 'Share Name', placeholder: 'logshare', required: true },
    { key: 'directory', label: 'Directory', placeholder: 'app/logs', hint: 'Directory path within the share' },
    { key: 'poll_interval', label: 'Poll Interval (s)', placeholder: '30', hint: 'Seconds between checks for new log content (min 5)' },
    { key: 'pattern', label: 'File Pattern', placeholder: '*.log', hint: 'Glob pattern to filter files' },
  ],
  gcs: [
    { key: 'bucket', label: 'Bucket', placeholder: 'my-log-bucket', required: true },
    { key: 'prefix', label: 'Prefix', placeholder: 'logs/app/', hint: 'Object key prefix' },
    { key: 'project', label: 'Project ID', placeholder: 'my-gcp-project' },
    { key: 'credentials_json', label: 'Credentials JSON', placeholder: '', type: 'password', hint: 'Service account JSON content' },
    { key: 'credentials_file', label: 'Credentials File', placeholder: '/path/to/sa.json', hint: 'Path to service account JSON' },
    { key: 'poll_interval', label: 'Poll Interval (s)', placeholder: '30', hint: 'Seconds between checks for new log content (min 5)' },
    { key: 'pattern', label: 'File Pattern', placeholder: '*.log', hint: 'Glob pattern to filter objects' },
  ],
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)

  function handleCopy() {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <button
      onClick={handleCopy}
      className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors"
      title="Copy"
    >
      {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  )
}

function AddResourceForm({ editing, onDone }: { editing?: AdminResource; onDone: () => void }) {
  const isEdit = !!editing

  function detectAuthMethod(config?: Record<string, unknown>): AuthMethod {
    if (!config) return 'service-account'
    if (config.kubeconfig_content) return 'kubeconfig'
    return 'service-account'
  }

  const [name, setName] = useState(editing?.name || '')
  const [resourceType, setResourceType] = useState<ResourceType>((editing?.type as ResourceType) || 'kubernetes')
  const [authMethod, setAuthMethod] = useState<AuthMethod>(detectAuthMethod(editing?.config))
  const [azureAuthMethod, setAzureAuthMethod] = useState<AzureAuthMethod>(detectAzureAuth(editing?.config))
  const [apiServerUrl, setApiServerUrl] = useState(
    (editing?.config?.api_server_url as string) || ''
  )
  const [bearerToken, setBearerToken] = useState('')
  const [caCert, setCaCert] = useState('')
  const [insecureSkipTls, setInsecureSkipTls] = useState(
    !!(editing?.config?.insecure_skip_tls)
  )
  const [kubeconfigContent, setKubeconfigContent] = useState('')
  const [kubeconfigContext, setKubeconfigContext] = useState(
    (editing?.config?.context as string) || ''
  )
  const [description, setDescription] = useState(editing?.description || '')
  const [showInstructions, setShowInstructions] = useState(!isEdit && resourceType === 'kubernetes')
  const [credentials, setCredentials] = useState<AdminCredential[]>([])
  const [credentialProfile, setCredentialProfile] = useState<string>(
    (editing?.config?.credential_profile as string) || ''
  )

  useEffect(() => {
    adminListCredentials().then(setCredentials).catch(() => {})
  }, [])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [testResult, setTestResult] = useState<{ status: string; error?: string; message?: string } | null>(null)

  const [storageConfig, setStorageConfig] = useState<Record<string, string>>(() => {
    if (!editing?.config || editing.type === 'kubernetes') return {}
    const cfg: Record<string, string> = {}
    for (const [k, v] of Object.entries(editing.config)) {
      if (typeof v === 'string' && v !== '***redacted***') cfg[k] = v
      else if (typeof v === 'boolean') cfg[k] = v ? 'true' : ''
    }
    return cfg
  })

  const isCloudType = resourceType !== 'kubernetes'
  const usingCredential = !!credentialProfile
  const credTargetType = (resourceType === 'azure-blob' || resourceType === 'azure-file') ? 'azure-storage' : resourceType
  const matchingCreds = credentials.filter(c => c.target_type === credTargetType)

  function allCloudFields(): StorageField[] {
    const common = STORAGE_FIELDS[resourceType] || []
    if (usingCredential) return common
    if (isAzureType(resourceType)) {
      return [...(AZURE_AUTH_FIELDS[azureAuthMethod] || []), ...common]
    }
    return common
  }

  function buildConfig(): Record<string, unknown> {
    if (isCloudType) {
      const cfg: Record<string, unknown> = {}
      if (credentialProfile) cfg.credential_profile = credentialProfile
      for (const field of allCloudFields()) {
        const val = storageConfig[field.key]
        if (val) {
          if (field.type === 'toggle') cfg[field.key] = true
          else cfg[field.key] = val
        }
      }
      return cfg
    }
    if (authMethod === 'kubeconfig') {
      const cfg: Record<string, unknown> = {}
      if (credentialProfile) cfg.credential_profile = credentialProfile
      if (kubeconfigContent) cfg.kubeconfig_content = kubeconfigContent
      if (kubeconfigContext) cfg.context = kubeconfigContext
      return cfg
    }
    const cfg: Record<string, unknown> = {}
    if (credentialProfile) cfg.credential_profile = credentialProfile
    if (apiServerUrl) cfg.api_server_url = apiServerUrl
    if (bearerToken) cfg.bearer_token = bearerToken
    if (caCert) cfg.ca_cert = caCert
    if (insecureSkipTls) cfg.insecure_skip_tls = true
    return cfg
  }

  function validateForm(): string | null {
    if (!name) return 'Name is required'
    if (usingCredential) return null
    if (isCloudType && !isEdit) {
      for (const field of allCloudFields()) {
        if (field.required && !storageConfig[field.key]) return `${field.label} is required`
      }
    }
    if (!isCloudType && !isEdit) {
      if (authMethod === 'kubeconfig') {
        if (!kubeconfigContent) return 'Kubeconfig content is required'
      } else {
        if (!apiServerUrl) return 'API Server URL is required'
        if (!bearerToken) return 'Bearer Token is required'
      }
    }
    return null
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const validationError = validateForm()
    if (validationError) { setError(validationError); return }
    setLoading(true)
    setError('')
    setTestResult(null)
    try {
      const config = buildConfig()
      if (isEdit) {
        await adminUpdateResource(name, { config: Object.keys(config).length > 0 ? config : undefined, description })
      } else {
        await adminCreateResource({ name, type: resourceType, config, description })
      }
      onDone()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : `Failed to ${isEdit ? 'update' : 'create'} resource`)
    } finally { setLoading(false) }
  }

  async function handleTestAndSave(e: React.FormEvent) {
    e.preventDefault()
    const validationError = validateForm()
    if (validationError) { setError(validationError); return }
    setLoading(true)
    setError('')
    setTestResult(null)
    try {
      const config = buildConfig()
      if (isEdit) {
        await adminUpdateResource(name, { config: Object.keys(config).length > 0 ? config : undefined, description })
      } else {
        await adminCreateResource({ name, type: resourceType, config, description })
      }
      const result = await adminTestResource(name)
      setTestResult(result)
      if (result.status === 'ok') {
        setTimeout(() => onDone(), 1500)
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : `Failed to ${isEdit ? 'update' : 'create'} resource`)
    } finally { setLoading(false) }
  }

  function updateStorageField(key: string, value: string) {
    setStorageConfig(prev => ({ ...prev, [key]: value }))
  }

  const activeCommands = authMethod === 'kubeconfig' ? KUBECONFIG_SETUP_COMMANDS : SA_SETUP_COMMANDS

  return (
    <Card padding="none" className="mb-4">
      <div className="px-4 pt-4 pb-2 space-y-3">
        {!isEdit && (
          <FormField label="Resource Type">
            <Select value={resourceType} onChange={e => { setResourceType(e.target.value as ResourceType); setTestResult(null) }}>
              {RESOURCE_TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </Select>
          </FormField>
        )}
        {matchingCreds.length > 0 && (
          <FormField label="Credentials" hint={credentialProfile ? 'Auth fields from credential profile' : 'or enter inline below'}>
            <Select value={credentialProfile} onChange={e => setCredentialProfile(e.target.value)}>
              <option value="">Inline credentials</option>
              {matchingCreds.map(c => <option key={c.name} value={c.name}>{c.name}{c.description ? ` — ${c.description}` : ''}</option>)}
            </Select>
          </FormField>
        )}
        {!usingCredential && !isCloudType && (
          <FormField label="Authentication Method">
            <Tabs
              tabs={[
                { id: 'service-account', label: 'Service Account Token' },
                { id: 'kubeconfig', label: 'Kubeconfig' },
              ]}
              active={authMethod}
              onChange={(id) => setAuthMethod(id as AuthMethod)}
            />
          </FormField>
        )}
        {!usingCredential && isAzureType(resourceType) && (
          <FormField label="Authentication Method">
            <Tabs
              tabs={AZURE_AUTH_TABS}
              active={azureAuthMethod}
              onChange={(id) => setAzureAuthMethod(id as AzureAuthMethod)}
            />
          </FormField>
        )}
      </div>

      {!isCloudType && (
        <div className="border-b border-[var(--border-subtle)]">
          <button
            onClick={() => setShowInstructions(!showInstructions)}
            className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-[var(--bg-hover)] transition-colors"
          >
            <div className="flex items-center gap-2">
              <img src={KUBERNETES_LOGO} alt="Kubernetes" className="w-4 h-4" />
              <span className="text-base text-[var(--text-primary)]">Setup Instructions</span>
              <span className="text-xs text-[var(--text-muted)]">
                {authMethod === 'kubeconfig' ? 'Generate or use an existing kubeconfig' : 'Create a read-only ServiceAccount'}
              </span>
            </div>
            {showInstructions ? <ChevronDown className="w-4 h-4 text-[var(--text-muted)]" /> : <ChevronRight className="w-4 h-4 text-[var(--text-muted)]" />}
          </button>

          {showInstructions && (
            <div className="px-4 pb-4 space-y-3">
              <p className="text-xs text-[var(--text-secondary)]">
                {authMethod === 'kubeconfig'
                  ? 'Generate a kubeconfig with a dedicated ServiceAccount for best security, or use an existing kubeconfig. Avalok needs read-only access to pods, logs, namespaces, and workloads.'
                  : 'These commands create a read-only ServiceAccount on your cluster. Avalok uses this to list namespaces, discover workloads, and stream pod logs. No write access is granted.'}
              </p>
              {activeCommands.map((cmd, i) => (
                <div key={i}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-[var(--text-secondary)]">{cmd.title}</span>
                    <CopyButton text={cmd.command} />
                  </div>
                  <pre className="text-xs font-mono bg-[var(--bg-app)] border border-[var(--border-subtle)] rounded-md px-3 py-2 text-[var(--text-primary)] overflow-x-auto whitespace-pre">
                    {cmd.command}
                  </pre>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="p-4">
        {error && <Alert variant="error" className="mb-3">{error}</Alert>}
        {testResult && (
          <Alert variant={testResult.status === 'ok' ? 'success' : 'error'} className="mb-3">
            {testResult.status === 'ok' ? (testResult.message || 'Connection successful') : testResult.error}
          </Alert>
        )}

        <form onSubmit={handleTestAndSave} className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Name" required>
              <Input value={name} onChange={e => setName(e.target.value)} className={cn(isEdit && 'opacity-60 cursor-not-allowed')} placeholder={isCloudType ? 'prod-logs' : 'production-cluster'} required disabled={isEdit} />
            </FormField>
            <FormField label="Description">
              <Input value={description} onChange={e => setDescription(e.target.value)} placeholder={isCloudType ? 'Production log storage' : 'Production GKE cluster'} />
            </FormField>
          </div>

          {isCloudType ? (
            <div className="flex flex-col gap-3">
              {!usingCredential && isAzureType(resourceType) && (AZURE_AUTH_FIELDS[azureAuthMethod] || []).map(field => (
                <FormField key={field.key} label={field.label} required={field.required} hint={field.hint}>
                  <Input
                    type={field.type === 'password' ? 'password' : 'text'}
                    value={storageConfig[field.key] || ''}
                    onChange={e => updateStorageField(field.key, e.target.value)}
                    placeholder={isEdit && field.type === 'password' ? 'Leave empty to keep existing...' : field.placeholder}
                    required={field.required && !isEdit}
                  />
                </FormField>
              ))}
              {(STORAGE_FIELDS[resourceType] || []).filter(f => !usingCredential || !CRED_AUTH_KEY_SET.has(f.key)).map(field => (
                field.type === 'toggle' ? (
                  <div key={field.key} className="flex items-center justify-between py-1">
                    <div>
                      <span className="text-xs font-medium text-[var(--text-secondary)]">{field.label}</span>
                      {field.hint && <p className="text-[10px] text-[var(--text-muted)] mt-0.5">{field.hint}</p>}
                    </div>
                    <Toggle checked={!!storageConfig[field.key]} onChange={v => updateStorageField(field.key, v ? 'true' : '')} />
                  </div>
                ) : (
                  <FormField key={field.key} label={field.label} required={field.required} hint={field.hint}>
                    <Input
                      type={field.type === 'password' ? 'password' : 'text'}
                      value={storageConfig[field.key] || ''}
                      onChange={e => updateStorageField(field.key, e.target.value)}
                      placeholder={isEdit && field.type === 'password' ? 'Leave empty to keep existing...' : field.placeholder}
                      required={field.required && !isEdit}
                    />
                  </FormField>
                )
              ))}
            </div>
          ) : usingCredential ? (
            <div className="text-xs text-[var(--text-secondary)] py-2">
              Authentication from credential profile <span className="font-medium text-[var(--text-primary)]">{credentialProfile}</span>
            </div>
          ) : authMethod === 'kubeconfig' ? (
            <>
              <FormField label="Kubeconfig" required>
                <Textarea
                  value={kubeconfigContent}
                  onChange={e => setKubeconfigContent(e.target.value)}
                  className="h-40 font-mono"
                  placeholder={isEdit ? 'Leave empty to keep existing kubeconfig...' : 'Paste the full kubeconfig YAML here...'}
                  required={!isEdit}
                />
              </FormField>
              <FormField label="Context" hint="optional, defaults to current-context">
                <Input value={kubeconfigContext} onChange={e => setKubeconfigContext(e.target.value)} placeholder="avalok-context" />
              </FormField>
            </>
          ) : (
            <>
              <FormField label="API Server URL" required>
                <Input value={apiServerUrl} onChange={e => setApiServerUrl(e.target.value)} placeholder="https://your-cluster-api:6443" required={!isEdit} />
              </FormField>

              <FormField label="Bearer Token" required>
                <Textarea
                  value={bearerToken}
                  onChange={e => setBearerToken(e.target.value)}
                  className="h-20 font-mono"
                  placeholder={isEdit ? 'Leave empty to keep existing token...' : 'Paste the token from step 6...'}
                  required={!isEdit}
                />
              </FormField>

              <FormField label="CA Certificate" hint="optional, for private clusters">
                <Textarea
                  value={caCert}
                  onChange={e => setCaCert(e.target.value)}
                  className="h-20 font-mono"
                  placeholder={isEdit ? 'Leave empty to keep existing cert...' : 'Paste base64-encoded CA cert from step 8...'}
                />
              </FormField>

              <div className="flex items-center justify-between py-1">
                <div>
                  <span className="text-xs font-medium text-[var(--text-secondary)]">Skip TLS Verification</span>
                  <p className="text-[10px] text-[var(--text-muted)] mt-0.5">Enable for clusters with self-signed certificates</p>
                </div>
                <Toggle checked={insecureSkipTls} onChange={setInsecureSkipTls} />
              </div>
            </>
          )}

          <div className="flex justify-end gap-2 pt-2 border-t border-[var(--border-subtle)]">
            <Button variant="ghost" type="button" onClick={onDone}>Cancel</Button>
            <Button variant="secondary" type="button" onClick={handleSubmit} loading={loading}>
              {loading ? 'Saving...' : isEdit ? 'Update' : 'Save'}
            </Button>
            <Button type="submit" loading={loading}>
              {loading ? 'Testing...' : isEdit ? 'Test & Update' : 'Test & Save'}
            </Button>
          </div>
        </form>
      </div>
    </Card>
  )
}
