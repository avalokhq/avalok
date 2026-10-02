import { useState, useRef, useMemo, useCallback, useEffect } from 'react'
import {
  Plus, Trash2, ChevronDown, ChevronRight, Server, Box,
  FileText, ArrowDownToLine,
  Copy, Check, Settings, Layers, FolderTree, Save,
  Upload, Eye, EyeOff, X, ChevronLeft,
} from 'lucide-react'
import { cn } from '../../lib/cn'
import { AvalokWordmark } from '../ui/AvalokLogo'
import ProviderIcon from '../ui/ProviderIcon'
import { useTheme, type Theme } from '../../lib/useTheme'
import { Sun, Moon, Monitor as MonitorIcon } from 'lucide-react'
import type { WorkspaceConfig, ServiceDef, EnvironmentDef, TargetDef } from './types'
import { createId, emptyConfig } from './types'
import { PROVIDERS, PROVIDER_FIELDS, TARGET_TYPES, TARGET_FIELDS } from './schema'
import { generateYaml } from './generateYaml'
import { parseWorkspaceYaml } from './parseYaml'
import ResourceImporter, { type ConnectResult } from './ResourceImporter'
import { adminGetWorkspaceYAML, adminGetStandaloneServiceYAML, adminGetStandaloneEnvYAML, adminGetSettings, adminListCredentials, adminListResources, adminGetResource } from '../../lib/api'
import type { AdminCredential, AdminResource } from '../../lib/api'
import Button from '../ui/Button'
import Modal from '../ui/Modal'
import Card from '../ui/Card'
import Badge from '../ui/Badge'
import IconButton from '../ui/IconButton'
import EmptyState from '../ui/EmptyState'
import Alert from '../ui/Alert'
import FormField from '../ui/FormField'
import SegmentedControl from '../ui/SegmentedControl'
import Input, { Select, Textarea } from '../ui/Input'
import { useToast } from '../ui/Feedback'
import IconSelect from './IconSelect'
import CredentialSelector from './CredentialSelector'
import { ConfigField, TextField } from './fields'

const ProviderIconWrapper = (provider: string): React.FC<{ className?: string }> =>
  ({ className }) => <ProviderIcon provider={provider} className={className} />

function update<T>(prev: T, fn: (draft: T) => void): T {
  const next = structuredClone(prev)
  fn(next)
  return next
}

// ConfigField and TextField imported from ./fields

// ── Section wrapper ──

function Section({ title, icon: Icon, children, count, defaultOpen = true, actions }: {
  title: string
  icon: React.FC<{ className?: string }>
  children: React.ReactNode
  count?: number
  defaultOpen?: boolean
  actions?: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="rounded-card border border-line bg-surface shadow-sm">
      <div className={cn('flex items-center gap-2 px-4 py-3', open && 'border-b border-line')}>
        <button
          type="button"
          onClick={() => setOpen(v => !v)}
          aria-expanded={open}
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 text-left"
        >
          {open
            ? <ChevronDown className="size-4 shrink-0 text-fg-muted" />
            : <ChevronRight className="size-4 shrink-0 text-fg-muted" />
          }
          <Icon className="size-4 shrink-0 text-accent" />
          <span className="truncate text-sm font-semibold text-fg">{title}</span>
          {count !== undefined && (
            <Badge tone="neutral" size="sm" className="tabular-nums">{count}</Badge>
          )}
        </button>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
      {open && (
        <div className="space-y-4 p-4">
          {children}
        </div>
      )}
    </div>
  )
}

// ── Service detail form (shown below grid when selected) ──

const CLOUD_STORAGE_TYPES = new Set(['s3', 'azure-blob', 'azure-file', 'gcs'])
const SERVICE_ONLY_KEYS = new Set(['prefix', 'poll_interval', 'pattern', 'directory'])

function ServiceDetailForm({ svc, onChange, onRemove, onClone, onClose, resources }: {
  svc: ServiceDef
  onChange: (svc: ServiceDef) => void
  onRemove: () => void
  onClone: () => void
  onClose: () => void
  resources?: AdminResource[]
}) {
  const fields = PROVIDER_FIELDS[svc.provider] ?? []
  const Icon = ProviderIconWrapper(svc.provider)
  const [loadingResource, setLoadingResource] = useState(false)

  const isCloudProvider = CLOUD_STORAGE_TYPES.has(svc.provider)
  const matchingResources = isCloudProvider && resources
    ? resources.filter(r => r.type === svc.provider)
    : []
  const selectedResource = svc.resource ?? ''

  async function handleResourceSelect(resourceName: string) {
    if (!resourceName) {
      onChange({ ...svc, resource: '', config: {} })
      return
    }
    setLoadingResource(true)
    try {
      const res = await adminGetResource(resourceName, true)
      const resConfig = res.config || {}
      const newConfig: Record<string, string> = {}
      for (const field of fields) {
        if (SERVICE_ONLY_KEYS.has(field.key)) {
          if (svc.config[field.key]) newConfig[field.key] = svc.config[field.key]
        } else if (resConfig[field.key] != null) {
          newConfig[field.key] = String(resConfig[field.key])
        }
      }
      onChange({ ...svc, resource: resourceName, config: newConfig })
    } catch {
      // fall back to manual
    } finally {
      setLoadingResource(false)
    }
  }

  const serviceFields = fields.filter(f => SERVICE_ONLY_KEYS.has(f.key))

  return (
    <div className="overflow-hidden rounded-card border border-accent-line bg-surface shadow-sm">
      <div className="flex items-center gap-2 border-b border-line bg-surface-sunken py-1.5 pl-3 pr-1.5">
        <Icon className="size-3.5 shrink-0 text-accent" />
        <span className="flex-1 truncate text-xs font-medium text-fg">
          {svc.friendly_name || svc.name || 'New Service'}
        </span>
        <Badge tone="neutral" size="sm">{svc.provider}</Badge>
        <IconButton size="xs" variant="accent" label="Clone service" onClick={onClone}>
          <Copy className="size-3.5" />
        </IconButton>
        <IconButton size="xs" variant="danger" label="Remove service" onClick={onRemove}>
          <Trash2 className="size-3.5" />
        </IconButton>
        <IconButton size="xs" label="Close" onClick={onClose}>
          <X className="size-3.5" />
        </IconButton>
      </div>
      <div className="space-y-4 p-4">
        <div className="grid grid-cols-2 gap-4">
          <TextField
            label="Name"
            value={svc.name}
            onChange={v => onChange({ ...svc, name: v.toLowerCase().replace(/[^a-z0-9-]/g, '-') })}
            placeholder="api"
            required
          />
          <IconSelect
            label="Provider"
            required
            value={svc.provider}
            onChange={v => onChange({ ...svc, provider: v, config: {} })}
            options={PROVIDERS}
          />
        </div>
        <TextField
          label="Friendly Name"
          value={svc.friendly_name}
          onChange={v => onChange({ ...svc, friendly_name: v })}
          placeholder="REST API"
        />

        {fields.length > 0 && (
          <div className="space-y-4 border-t border-line pt-4">
            <span className="block font-mono text-2xs font-medium uppercase tracking-wider text-fg-muted">Provider Config</span>

            {matchingResources.length > 0 && (
              <div className="space-y-4">
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-fg-secondary">Connection</label>
                  <SegmentedControl
                    label="Connection"
                    size="sm"
                    className="flex w-full [&>button]:flex-1"
                    value={selectedResource ? 'resource' : 'manual'}
                    onChange={mode => {
                      if (mode === 'manual') handleResourceSelect('')
                      else if (!selectedResource && matchingResources[0]) handleResourceSelect(matchingResources[0].name)
                    }}
                    options={[
                      { value: 'manual', label: 'Manual' },
                      { value: 'resource', label: 'From Resource' },
                    ]}
                  />
                </div>

                {selectedResource && (
                  <FormField label="Resource" help="Connection details from Admin > Resources">
                    <Select
                      value={selectedResource}
                      onChange={e => handleResourceSelect(e.target.value)}
                      disabled={loadingResource}
                    >
                      {matchingResources.map(r => (
                        <option key={r.name} value={r.name}>{r.name}{r.description ? ` — ${r.description}` : ''}</option>
                      ))}
                    </Select>
                  </FormField>
                )}
              </div>
            )}

            {selectedResource ? (
              serviceFields.length > 0 && (
                <div className="grid grid-cols-2 gap-4">
                  {serviceFields.map(field => (
                    <div key={field.key} className={field.type === 'toggle' ? 'col-span-2' : ''}>
                      <ConfigField
                        field={field}
                        value={svc.config[field.key] ?? ''}
                        onChange={v => onChange({ ...svc, config: { ...svc.config, [field.key]: v } })}
                      />
                    </div>
                  ))}
                </div>
              )
            ) : (
              <div className="grid grid-cols-2 gap-4">
                {fields.map(field => (
                  <div key={field.key} className={field.type === 'toggle' ? 'col-span-2' : ''}>
                    <ConfigField
                      field={field}
                      value={svc.config[field.key] ?? ''}
                      onChange={v => onChange({ ...svc, config: { ...svc.config, [field.key]: v } })}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Target card (accordion) ──

function TargetCard({ target, services, expanded, onToggle, onChange, onRemove, onClone, onConnectFromResource, credentials }: {
  target: TargetDef
  services: ServiceDef[]
  expanded: boolean
  onToggle: () => void
  onChange: (t: TargetDef) => void
  onRemove: () => void
  onClone: () => void
  onConnectFromResource?: () => void
  credentials?: AdminCredential[]
}) {
  const fields = TARGET_FIELDS[target.type] ?? []
  const [showOverrides, setShowOverrides] = useState(target.service_overrides.length > 0)

  return (
    <div className={cn(
      'overflow-hidden rounded-card border bg-surface shadow-sm transition-colors',
      expanded ? 'border-accent-line' : 'border-line'
    )}>
      <div className={cn(
        'flex items-center gap-2 bg-surface-sunken py-1.5 pl-3 pr-1.5 transition-colors hover:bg-hover',
        expanded && 'border-b border-line'
      )}>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-left"
        >
          {expanded
            ? <ChevronDown className="size-3.5 shrink-0 text-fg-muted" />
            : <ChevronRight className="size-3.5 shrink-0 text-fg-muted" />
          }
          <Server className="size-3.5 shrink-0 text-fg-secondary" />
          <span className="flex-1 truncate text-xs font-medium text-fg">
            {target.name || 'New Target'}
          </span>
          <Badge tone="neutral" size="sm">{target.type}</Badge>
          {target.service_names.length > 0 && (
            <span className="text-2xs text-fg-muted tabular-nums">{target.service_names.length} svc</span>
          )}
        </button>
        <IconButton size="xs" variant="accent" label="Clone target" onClick={onClone}>
          <Copy className="size-3.5" />
        </IconButton>
        <IconButton size="xs" variant="danger" label="Remove target" onClick={onRemove}>
          <Trash2 className="size-3.5" />
        </IconButton>
      </div>
      {expanded && (
        <div className="space-y-4 p-4">
          <div className="grid grid-cols-2 gap-4">
            <TextField
              label="Target Name"
              value={target.name}
              onChange={v => onChange({ ...target, name: v.toLowerCase().replace(/[^a-z0-9-]/g, '-') })}
              placeholder="prod-cluster"
              required
            />
            <IconSelect
              label="Type"
              required
              value={target.type}
              onChange={v => onChange({ ...target, type: v, connection: {}, credential_profile: '' })}
              options={TARGET_TYPES}
            />
          </div>

          {credentials && credentials.length > 0 ? (
            <CredentialSelector
              targetType={target.type}
              credentials={credentials}
              credentialProfile={target.credential_profile}
              connection={target.connection}
              fields={fields}
              onSelectProfile={(name, kept) => onChange({ ...target, credential_profile: name, connection: kept })}
              onClearProfile={() => onChange({ ...target, credential_profile: '' })}
              onConnectionChange={(key, v) => onChange({ ...target, connection: { ...target.connection, [key]: v } })}
            />
          ) : fields.length > 0 ? (
            <div className="grid grid-cols-2 gap-4">
              {fields.map(field => (
                <div key={field.key} className={field.type === 'toggle' ? 'col-span-2' : ''}>
                  <ConfigField
                    field={field}
                    value={target.connection[field.key] ?? ''}
                    onChange={v => onChange({ ...target, connection: { ...target.connection, [field.key]: v } })}
                  />
                </div>
              ))}
            </div>
          ) : null}

          {onConnectFromResource && target.type === 'kubernetes' && (
            <Button
              variant="subtle"
              size="sm"
              onClick={onConnectFromResource}
              leftIcon={<Server />}
              className="w-full border-dashed"
            >
              Connect from Resource
            </Button>
          )}

          <div>
            <label className="mb-1.5 block text-xs font-medium text-fg-secondary">
              Services on this target
            </label>
            {(() => {
              const targetServices = services.filter(s => !CLOUD_STORAGE_TYPES.has(s.provider))
              return targetServices.length === 0 ? (
              <p className="text-xs text-fg-muted italic">Define global services first</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {targetServices.map(svc => {
                  const active = target.service_names.includes(svc.name)
                  const SvcIcon = ProviderIconWrapper(svc.provider)
                  return (
                    <button
                      key={svc.id}
                      disabled={!svc.name}
                      onClick={() => {
                        const names = active
                          ? target.service_names.filter(n => n !== svc.name)
                          : [...target.service_names, svc.name]
                        onChange({ ...target, service_names: names })
                      }}
                      className={cn(
                        'flex h-7 cursor-pointer items-center gap-1.5 rounded-control border px-2.5 text-xs transition-colors',
                        !svc.name && 'opacity-40 cursor-not-allowed',
                        active
                          ? 'border-accent-line bg-accent-soft font-medium text-accent'
                          : 'border-line bg-surface-sunken text-fg-secondary hover:border-line-strong hover:text-fg'
                      )}
                      aria-pressed={active}
                    >
                      <SvcIcon className="size-3 shrink-0" />
                      {svc.friendly_name || svc.name || '(unnamed)'}
                    </button>
                  )
                })}
              </div>
            )
              })()}
          </div>

          {target.service_names.length > 0 && (
            <div className="border-t border-line pt-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowOverrides(v => !v)}
                leftIcon={showOverrides ? <ChevronDown /> : <ChevronRight />}
                className="-ml-2.5"
              >
                {showOverrides ? 'Hide' : 'Show'} service config overrides
              </Button>
              {showOverrides && (
                <div className="mt-2 space-y-2">
                  {target.service_names.map(svcName => {
                    const globalSvc = services.find(s => s.name === svcName)
                    if (!globalSvc) return null
                    const override = target.service_overrides.find(o => o.name === svcName)
                    const providerFields = PROVIDER_FIELDS[globalSvc.provider] ?? []
                    if (providerFields.length === 0) return null

                    return (
                      <div key={svcName} className="space-y-2 rounded-card border border-line bg-surface-sunken p-3">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-medium text-fg-secondary">{svcName}</span>
                          <span className="text-2xs text-fg-muted">override</span>
                        </div>
                        {providerFields.map(field => (
                          <div key={field.key}>
                            <label className="mb-1 block text-2xs text-fg-muted">{field.label}</label>
                            <Input
                              type="text"
                              value={override?.config[field.key] ?? ''}
                              onChange={e => {
                                const val = e.target.value
                                const existing = target.service_overrides.filter(o => o.name !== svcName)
                                if (val) {
                                  const cfg = override ? { ...override.config, [field.key]: val } : { [field.key]: val }
                                  existing.push({ name: svcName, config: cfg })
                                }
                                onChange({ ...target, service_overrides: existing })
                              }}
                              placeholder={`Override ${field.label.toLowerCase()}...`}
                              className="h-7 bg-surface text-xs"
                            />
                          </div>
                        ))}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Environment detail form (shown below grid when selected) ──

function EnvironmentDetailForm({ env, services, expandedTargetId, onToggleTarget, onChange, onRemove, onClone, onClose, onConnectFromResource, credentials }: {
  env: EnvironmentDef
  services: ServiceDef[]
  expandedTargetId: string | null
  onToggleTarget: (id: string) => void
  onChange: (e: EnvironmentDef) => void
  onRemove: () => void
  onClone: () => void
  onClose: () => void
  onConnectFromResource?: (targetId: string) => void
  credentials?: AdminCredential[]
}) {
  function addTarget() {
    const newId = createId()
    onChange(update(env, d => {
      d.targets.push({
        id: newId, name: '', type: 'kubernetes',
        connection: {}, credential_profile: '', service_names: [], service_overrides: [],
      })
    }))
    onToggleTarget(newId)
  }

  function updateTarget(id: string, t: TargetDef) {
    onChange(update(env, d => {
      const idx = d.targets.findIndex(x => x.id === id)
      if (idx >= 0) d.targets[idx] = t
    }))
  }

  function removeTarget(id: string) {
    onChange(update(env, d => {
      d.targets = d.targets.filter(x => x.id !== id)
    }))
  }

  function cloneTarget(id: string) {
    const source = env.targets.find(x => x.id === id)
    if (!source) return
    const newId = createId()
    const cloned: TargetDef = {
      ...structuredClone(source),
      id: newId,
      name: source.name ? `${source.name}-copy` : '',
    }
    onChange(update(env, d => {
      const idx = d.targets.findIndex(x => x.id === id)
      d.targets.splice(idx + 1, 0, cloned)
    }))
    onToggleTarget(newId)
  }

  return (
    <div className="overflow-hidden rounded-card border border-accent-line bg-surface shadow-sm">
      <div className="flex items-center gap-2 border-b border-line bg-surface-sunken py-1.5 pl-3 pr-1.5">
        <FolderTree className="size-3.5 shrink-0 text-accent" />
        <span className="flex-1 truncate text-left text-sm font-medium text-fg">
          {env.name || 'New Environment'}
        </span>
        <span className="text-2xs text-fg-muted tabular-nums">{env.targets.length} target{env.targets.length !== 1 ? 's' : ''}</span>
        <IconButton size="xs" variant="accent" label="Clone environment" onClick={onClone}>
          <Copy className="size-3.5" />
        </IconButton>
        <IconButton size="xs" variant="danger" label="Remove environment" onClick={onRemove}>
          <Trash2 className="size-3.5" />
        </IconButton>
        <IconButton size="xs" label="Close" onClick={onClose}>
          <X className="size-3.5" />
        </IconButton>
      </div>
      <div className="space-y-4 p-4">
        <TextField
          label="Environment Name"
          value={env.name}
          onChange={v => onChange({ ...env, name: v.toLowerCase().replace(/[^a-z0-9-]/g, '-') })}
          placeholder="production"
          required
        />
        {env.targets.map(target => (
          <TargetCard
            key={target.id}
            target={target}
            services={services}
            expanded={expandedTargetId === target.id}
            onToggle={() => onToggleTarget(target.id)}
            onChange={t => updateTarget(target.id, t)}
            onRemove={() => removeTarget(target.id)}
            onClone={() => cloneTarget(target.id)}
            onConnectFromResource={onConnectFromResource ? () => onConnectFromResource(target.id) : undefined}
            credentials={credentials}
          />
        ))}
        <Button
          variant="subtle"
          size="sm"
          onClick={addTarget}
          leftIcon={<Plus />}
          className="w-full border-dashed"
        >
          Add Target
        </Button>
      </div>
    </div>
  )
}

// ── YAML Preview ──

function YamlPreview({ yaml, redactedYaml, filename, onImportToServer, importing, importError, saveLabel, defaultRedact = true, onCollapse }: {
  yaml: string
  redactedYaml?: string
  filename: string
  onImportToServer?: (yaml: string) => Promise<void>
  importing?: boolean
  importError?: string
  saveLabel?: string
  defaultRedact?: boolean
  onCollapse?: () => void
}) {
  const toast = useToast()
  const [copied, setCopied] = useState(false)
  const [showSecrets, setShowSecrets] = useState(!defaultRedact)
  const hasSensitive = redactedYaml != null && redactedYaml !== yaml

  const displayYaml = hasSensitive && !showSecrets ? redactedYaml : yaml

  const copyToClipboard = useCallback(() => {
    navigator.clipboard.writeText(displayYaml)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [displayYaml])

  const download = useCallback(() => {
    const blob = new Blob([yaml], { type: 'text/yaml' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename || 'workspace.yaml'
    a.click()
    URL.revokeObjectURL(url)
  }, [yaml, filename])

  const save = useCallback(async () => {
    try {
      const res = await fetch('/api/config/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ yaml, filename }),
      })
      if (res.ok) {
        const data = await res.json()
        toast.success('Saved', data.path)
      }
    } catch {
      download()
    }
  }, [yaml, filename, download, toast])

  const lines = displayYaml.split('\n')

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-11 shrink-0 items-center gap-1 border-b border-line px-4">
        <FileText className="size-3.5 shrink-0 text-accent" />
        <span className="ml-1 flex-1 truncate text-sm font-semibold text-fg">YAML Preview</span>
        {hasSensitive && (
          <IconButton
            onClick={() => setShowSecrets(v => !v)}
            variant={showSecrets ? 'warning' : 'default'}
            label={showSecrets ? 'Secrets visible: hide credentials' : 'Secrets hidden: show credentials'}
            tooltipSide="bottom"
          >
            {showSecrets ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
          </IconButton>
        )}
        <IconButton onClick={copyToClipboard} label={copied ? 'Copied' : 'Copy to clipboard'} tooltipSide="bottom">
          {copied ? <Check className="size-3.5 text-success" /> : <Copy className="size-3.5" />}
        </IconButton>
        <IconButton onClick={save} label="Save to disk" tooltipSide="bottom">
          <Save className="size-3.5" />
        </IconButton>
        {onImportToServer ? (
          <Button size="sm" onClick={() => onImportToServer(yaml)} loading={importing} leftIcon={<ArrowDownToLine />} className="ml-1">
            {importing ? 'Saving...' : (saveLabel || 'Import to Server')}
          </Button>
        ) : (
          <Button size="sm" onClick={download} leftIcon={<ArrowDownToLine />} className="ml-1">
            Download
          </Button>
        )}
        {onCollapse && (
          <IconButton onClick={onCollapse} label="Collapse panel" tooltipSide="bottom" className="-mr-1.5">
            <ChevronRight className="size-3.5" />
          </IconButton>
        )}
      </div>
      {importError && (
        <Alert tone="danger" className="m-3 shrink-0">
          {importError}
        </Alert>
      )}
      <div className="flex-1 overflow-auto py-2 font-mono text-xs leading-5" style={{ background: 'var(--log-bg)' }}>
        {lines.map((line, i) => {
          let cls = 'text-fg'
          if (line.match(/^\s*#/)) cls = 'text-fg-muted'
          else if (line.match(/^\S.*:$/)) cls = 'text-info font-semibold'
          else if (line.match(/^\s{2}\S.*:$/)) cls = 'text-info font-medium'
          else if (line.match(/^\s+-\s+name:/)) cls = 'text-warning'

          return (
            <div key={i} className="flex transition-colors hover:bg-hover">
              <span className="w-10 shrink-0 select-none pr-3 text-right text-fg-faint tabular-nums">{i + 1}</span>
              <span className={cn(cls, 'whitespace-pre')}>{line || ' '}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Theme toggle (standalone) ──

const themeOptions: { value: Theme; icon: React.FC<{ className?: string }> }[] = [
  { value: 'dark', icon: Moon },
  { value: 'light', icon: Sun },
  { value: 'auto', icon: MonitorIcon },
]

const THEME_LABELS: Record<Theme, string> = { dark: 'Dark', light: 'Light', auto: 'System' }

// ── Import Modal ──

function ImportModal({ onImport, onClose }: {
  onImport: (config: WorkspaceConfig) => void
  onClose: () => void
}) {
  const [yamlText, setYamlText] = useState('')
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  function handleParse() {
    try {
      const parsed = parseWorkspaceYaml(yamlText)
      onImport(parsed)
    } catch (e: any) {
      setError(e.message || 'Failed to parse YAML')
    }
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const text = reader.result as string
      setYamlText(text)
      setError('')
      try {
        const parsed = parseWorkspaceYaml(text)
        onImport(parsed)
      } catch (err: any) {
        setError(err.message || 'Failed to parse YAML')
      }
    }
    reader.readAsText(file)
  }

  return (
    <Modal
      title="Import Config"
      onClose={onClose}
      size="lg"
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={handleParse} disabled={!yamlText.trim()}>Import</Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="flex w-full cursor-pointer flex-col items-center gap-2 rounded-card border-2 border-dashed border-line py-6 transition-colors hover:border-line-strong hover:bg-hover"
          >
            <Upload className="size-6 text-fg-muted" />
            <span className="text-xs text-fg-secondary">Click to upload a <span className="font-medium text-fg">.yaml</span> file</span>
          </button>
          <input ref={fileRef} type="file" accept=".yaml,.yml" onChange={handleFile} className="hidden" />
        </div>

        <div className="flex items-center gap-3">
          <div className="h-px flex-1 bg-line" />
          <span className="text-2xs uppercase tracking-wider text-fg-muted">or paste YAML</span>
          <div className="h-px flex-1 bg-line" />
        </div>

        <Textarea
          value={yamlText}
          onChange={e => { setYamlText(e.target.value); setError('') }}
          placeholder={'workspace:\n  name: my-workspace\n  description: ...\n\nservices:\n  - name: api\n    provider: docker\n    ...'}
          rows={10}
          className="resize-none font-mono text-xs"
        />

        {error && <Alert tone="danger">{error}</Alert>}
      </div>
    </Modal>
  )
}

// ── Hierarchy Template Picker ──

const HIERARCHY_TEMPLATES = [
  {
    value: 'default',
    label: 'Standard',
    desc: 'Environment > Service',
    preview: ['production', '  api-service, web-app', 'staging', '  api-service, web-app'],
  },
  {
    value: 'service-first',
    label: 'Service-First',
    desc: 'Service > Environment',
    preview: ['api-service', '  production, staging', 'web-app', '  production, staging'],
  },
]

function HierarchyPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium text-fg-secondary">
        Hierarchy Template
      </label>
      <div className="grid grid-cols-2 gap-4">
        {HIERARCHY_TEMPLATES.map(t => (
          <button
            key={t.value}
            type="button"
            onClick={() => onChange(t.value)}
            aria-pressed={value === t.value}
            className={cn(
              'flex cursor-pointer flex-col rounded-card border p-3 text-left transition-colors',
              value === t.value
                ? 'border-accent-line bg-accent-soft'
                : 'border-line bg-surface-sunken hover:border-line-strong hover:bg-hover'
            )}
          >
            <div className="mb-2 flex items-center gap-2">
              <div className={cn(
                'flex size-3 items-center justify-center rounded-full border-2',
                value === t.value ? 'border-accent' : 'border-fg-muted'
              )}>
                {value === t.value && <div className="size-1.5 rounded-full bg-accent" />}
              </div>
              <span className={cn(
                'text-xs font-semibold',
                value === t.value ? 'text-accent' : 'text-fg'
              )}>
                {t.label}
              </span>
              <span className="text-2xs text-fg-muted">{t.desc}</span>
            </div>
            <div className="pl-5 font-mono text-2xs text-fg-muted">
              {t.preview.map((line, i) => (
                <div key={i} className={line.startsWith(' ') ? 'text-fg-muted' : 'font-medium text-fg-secondary'}>
                  {line.startsWith(' ') ? `└ ${line.trim()}` : line}
                </div>
              ))}
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}

// ── Main Component ──

export type { WorkspaceConfig } from './types'

interface ConfigBuilderProps {
  onImportToServer?: (yaml: string, config: WorkspaceConfig) => Promise<void>
  onBack?: () => void
  editWorkspace?: string
  editService?: string
  editEnvironment?: string
  mode?: 'workspace' | 'environment' | 'service'
  serverMode?: boolean
  isAdmin?: boolean
}

export default function ConfigBuilder({ onImportToServer, onBack, editWorkspace, editService, editEnvironment, mode = 'workspace', serverMode, isAdmin }: ConfigBuilderProps = {}) {
  const { theme, setTheme } = useTheme()
  const [config, setConfig] = useState<WorkspaceConfig>(() => {
    const base = emptyConfig()
    if (mode === 'environment') {
      base.environments = [{ id: createId(), name: '', targets: [] }]
    } else if (mode === 'service') {
      base.services = [{ id: createId(), name: '', provider: 'file', friendly_name: '', resource: '', config: {} }]
      base.environments = [{ id: createId(), name: '', targets: [{ id: createId(), name: '', type: 'kubernetes', connection: {}, credential_profile: '', service_names: [], service_overrides: [] }] }]
    }
    return base
  })
  const [serverImporting, setServerImporting] = useState(false)
  const [serverError, setServerError] = useState('')
  const [editLoading, setEditLoading] = useState(!!(editWorkspace || editService || editEnvironment))
  const [adminRedact, setAdminRedact] = useState(true)
  const [credentials, setCredentials] = useState<AdminCredential[]>([])
  const [resources, setResources] = useState<AdminResource[]>([])

  useEffect(() => {
    adminGetSettings()
      .then(s => setAdminRedact(s['redact_credentials'] !== 'false'))
      .catch(() => {})
    if (serverMode) {
      adminListCredentials()
        .then(c => setCredentials(c || []))
        .catch(() => {})
      adminListResources()
        .then(r => setResources(r || []))
        .catch(() => {})
    }
  }, [])

  useEffect(() => {
    const editName = editWorkspace || editService || editEnvironment
    if (!editName) return
    const fetchFn = editService
      ? adminGetStandaloneServiceYAML
      : editEnvironment
        ? adminGetStandaloneEnvYAML
        : adminGetWorkspaceYAML
    fetchFn(editName)
      .then(yamlText => {
        setConfig(parseWorkspaceYaml(yamlText))
      })
      .catch(() => setServerError('Failed to load configuration'))
      .finally(() => setEditLoading(false))
  }, [editWorkspace, editService, editEnvironment])
  const [expandedSvcId, setExpandedSvcId] = useState<string | null>(null)
  const [expandedEnvId, setExpandedEnvId] = useState<string | null>(null)
  const [expandedTargetId, setExpandedTargetId] = useState<string | null>(null)
  const [showImport, setShowImport] = useState(false)
  const [resourceConnectTarget, setResourceConnectTarget] = useState<{ envId: string; targetId: string } | null>(null)
  const [yamlOpen, setYamlOpen] = useState(true)

  const yaml = useMemo(() => generateYaml(config, { mode }), [config, mode])
  const redactedYaml = useMemo(() => generateYaml(config, { redact: true, mode }), [config, mode])
  const defaultFilename = mode === 'service' ? 'service' : mode === 'environment' ? 'environment' : 'workspace'
  const filename = `${config.name || defaultFilename}.yaml`

  function cfg(fn: (d: WorkspaceConfig) => void) {
    setConfig(prev => update(prev, fn))
  }

  function addService() {
    const newId = createId()
    cfg(d => d.services.push({
      id: newId,
      name: '',
      provider: 'file',
      friendly_name: '',
      resource: '',
      config: {},
    }))
    setExpandedSvcId(newId)
  }

  function updateService(id: string, svc: ServiceDef) {
    cfg(d => {
      const idx = d.services.findIndex(s => s.id === id)
      if (idx >= 0) {
        const oldName = d.services[idx].name
        d.services[idx] = svc
        if (oldName && oldName !== svc.name) {
          for (const env of d.environments) {
            for (const target of env.targets) {
              target.service_names = target.service_names.map(n => n === oldName ? svc.name : n)
              for (const ovr of target.service_overrides) {
                if (ovr.name === oldName) ovr.name = svc.name
              }
            }
          }
        }
      }
    })
  }

  function removeService(id: string) {
    cfg(d => { d.services = d.services.filter(s => s.id !== id) })
    if (expandedSvcId === id) setExpandedSvcId(null)
  }

  function handleResourceConnect(result: ConnectResult) {
    if (!resourceConnectTarget) return
    const { envId, targetId } = resourceConnectTarget
    cfg(d => {
      d.services.push(...result.services)
      for (const env of d.environments) {
        if (env.id === envId) {
          const target = env.targets.find(t => t.id === targetId)
          if (target) {
            target.type = 'kubernetes'
            target.connection = result.connection
            if (!target.name && result.targetName) {
              target.name = result.targetName.toLowerCase().replace(/[^a-z0-9-]/g, '-')
            }
            const existing = new Set(target.service_names)
            for (const name of result.serviceNames) {
              if (!existing.has(name)) target.service_names.push(name)
            }
          }
          break
        }
      }
    })
    setResourceConnectTarget(null)
  }

  function cloneService(id: string) {
    const source = config.services.find(s => s.id === id)
    if (!source) return
    const newId = createId()
    cfg(d => {
      const idx = d.services.findIndex(s => s.id === id)
      d.services.splice(idx + 1, 0, {
        ...structuredClone(source),
        id: newId,
        name: source.name ? `${source.name}-copy` : '',
      })
    })
    setExpandedSvcId(newId)
  }

  function addEnvironment() {
    const newId = createId()
    cfg(d => d.environments.push({
      id: newId,
      name: '',
      targets: [],
    }))
    setExpandedEnvId(newId)
  }

  function updateEnvironment(id: string, env: EnvironmentDef) {
    cfg(d => {
      const idx = d.environments.findIndex(e => e.id === id)
      if (idx >= 0) d.environments[idx] = env
    })
  }

  function removeEnvironment(id: string) {
    cfg(d => { d.environments = d.environments.filter(e => e.id !== id) })
    if (expandedEnvId === id) setExpandedEnvId(null)
  }

  function cloneEnvironment(id: string) {
    const source = config.environments.find(e => e.id === id)
    if (!source) return
    const newId = createId()
    const cloned: EnvironmentDef = {
      ...structuredClone(source),
      id: newId,
      name: source.name ? `${source.name}-copy` : '',
      targets: source.targets.map(t => ({
        ...structuredClone(t),
        id: createId(),
      })),
    }
    cfg(d => {
      const idx = d.environments.findIndex(e => e.id === id)
      d.environments.splice(idx + 1, 0, cloned)
    })
    setExpandedEnvId(newId)
  }

  if (editLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-canvas">
        <div className="flex flex-col items-center gap-3">
          <div className="size-8 animate-spin rounded-full border-2 border-line-strong border-t-accent" />
          <span className="text-sm text-fg-secondary">Loading workspace...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-screen flex-col bg-canvas">
      {/* Header */}
      <header className="flex h-14 shrink-0 items-center gap-4 border-b border-line bg-surface px-5">
        {onBack ? (
          <Button variant="ghost" size="sm" onClick={onBack} leftIcon={<ChevronLeft />} className="-ml-2">
            Back
          </Button>
        ) : (
          <AvalokWordmark height={22} />
        )}
        <span className="hidden text-2xs italic text-fg-muted sm:inline">observe with clarity</span>
        <div className="h-5 w-px bg-line" />
        <span className="truncate text-sm font-medium text-fg">
          {editWorkspace ? 'Edit Workspace' : editService ? 'Edit Service' : editEnvironment ? 'Edit Environment' : onImportToServer ? (mode === 'service' ? 'Create Service' : mode === 'environment' ? 'Create Environment' : 'Create Workspace') : 'Config Builder'}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => setShowImport(true)} leftIcon={<Upload />}>
            Import
          </Button>
          <div className="h-5 w-px bg-line" />
          <SegmentedControl
            label="Theme"
            size="sm"
            value={theme}
            onChange={setTheme}
            options={themeOptions.map(opt => {
              const Icon = opt.icon
              return { value: opt.value, icon: <Icon />, title: THEME_LABELS[opt.value] }
            })}
          />
        </div>
      </header>

      {/* Body */}
      <div className="flex min-h-0 flex-1">
        {/* Left: Form */}
        <div className="min-w-0 flex-1 overflow-y-auto">
          <div className="space-y-4 px-6 py-6">

            {mode === 'service' ? (
              <>
                {/* Service mode: single service definition */}
                <Section title="Service" icon={Box} defaultOpen>
                  <div className="grid grid-cols-2 gap-4">
                    <TextField
                      label="Service Name"
                      value={config.name}
                      onChange={v => {
                        cfg(d => {
                          d.name = v.toLowerCase().replace(/[^a-z0-9-]/g, '-')
                          if (d.services[0]) d.services[0].name = d.name
                        })
                      }}
                      placeholder="api-logs"
                      required
                    />
                    <TextField
                      label="Description"
                      value={config.description}
                      onChange={v => cfg(d => { d.description = v })}
                      placeholder="REST API log stream"
                    />
                  </div>
                  {config.services[0] && (() => {
                    const svc = config.services[0]
                    const fields = PROVIDER_FIELDS[svc.provider] ?? []
                    return (
                      <>
                        <div className="grid grid-cols-2 gap-4">
                          <TextField
                            label="Friendly Name"
                            value={svc.friendly_name}
                            onChange={v => cfg(d => { if (d.services[0]) d.services[0].friendly_name = v })}
                            placeholder="REST API"
                          />
                          <IconSelect
                            label="Provider"
                            required
                            value={svc.provider}
                            onChange={v => cfg(d => { if (d.services[0]) { d.services[0].provider = v; d.services[0].config = {} } })}
                            options={PROVIDERS}
                          />
                        </div>
                        {fields.length > 0 && (
                          <div className="space-y-4 border-t border-line pt-4">
                            <span className="block font-mono text-2xs font-medium uppercase tracking-wider text-fg-muted">Provider Config</span>
                            <div className="grid grid-cols-2 gap-4">
                              {fields.map(field => (
                                <div key={field.key} className={field.type === 'toggle' ? 'col-span-2' : ''}>
                                  <ConfigField
                                    field={field}
                                    value={svc.config[field.key] ?? ''}
                                    onChange={v => cfg(d => { if (d.services[0]) d.services[0].config[field.key] = v })}
                                  />
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </>
                    )
                  })()}
                </Section>

                {/* Service mode: single target */}
                {config.environments[0]?.targets[0] && (() => {
                  const target = config.environments[0].targets[0]
                  const fields = TARGET_FIELDS[target.type] ?? []
                  return (
                    <Section title="Target" icon={Server} defaultOpen>
                      <div className="grid grid-cols-2 gap-4">
                        <TextField
                          label="Target Name"
                          value={target.name}
                          onChange={v => cfg(d => { if (d.environments[0]?.targets[0]) d.environments[0].targets[0].name = v.toLowerCase().replace(/[^a-z0-9-]/g, '-') })}
                          placeholder="prod-server"
                          required
                        />
                        <IconSelect
                          label="Type"
                          required
                          value={target.type}
                          onChange={v => cfg(d => { if (d.environments[0]?.targets[0]) { d.environments[0].targets[0].type = v; d.environments[0].targets[0].connection = {}; d.environments[0].targets[0].credential_profile = '' } })}
                          options={TARGET_TYPES}
                        />
                      </div>
                      {serverMode && credentials.length > 0 ? (
                        <CredentialSelector
                          targetType={target.type}
                          credentials={credentials}
                          credentialProfile={target.credential_profile}
                          connection={target.connection}
                          fields={fields}
                          onSelectProfile={(name, kept) => cfg(d => { if (d.environments[0]?.targets[0]) { d.environments[0].targets[0].credential_profile = name; d.environments[0].targets[0].connection = kept } })}
                          onClearProfile={() => cfg(d => { if (d.environments[0]?.targets[0]) d.environments[0].targets[0].credential_profile = '' })}
                          onConnectionChange={(key, v) => cfg(d => { if (d.environments[0]?.targets[0]) d.environments[0].targets[0].connection[key] = v })}
                        />
                      ) : fields.length > 0 ? (
                        <div className="grid grid-cols-2 gap-4">
                          {fields.map(field => (
                            <div key={field.key} className={field.type === 'toggle' ? 'col-span-2' : ''}>
                              <ConfigField
                                field={field}
                                value={target.connection[field.key] ?? ''}
                                onChange={v => cfg(d => { if (d.environments[0]?.targets[0]) d.environments[0].targets[0].connection[field.key] = v })}
                              />
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </Section>
                  )
                })()}
              </>
            ) : (
              <>
                {/* Workspace / Environment header section */}
                <Section title={mode === 'environment' ? 'Environment' : 'Workspace'} icon={mode === 'environment' ? FolderTree : Layers} defaultOpen>
                  <div className="grid grid-cols-2 gap-4">
                    <TextField
                      label={mode === 'environment' ? 'Environment Name' : 'Workspace Name'}
                      value={config.name}
                      onChange={v => cfg(d => { d.name = v.toLowerCase().replace(/[^a-z0-9-]/g, '-') })}
                      placeholder={mode === 'environment' ? 'production' : 'payments'}
                      required
                    />
                    <TextField
                      label="Description"
                      value={config.description}
                      onChange={v => cfg(d => { d.description = v })}
                      placeholder={mode === 'environment' ? 'Production Environment' : 'Payments Platform'}
                    />
                  </div>
                  {mode === 'workspace' && (
                    <HierarchyPicker
                      value={config.settings.hierarchy}
                      onChange={v => cfg(d => { d.settings.hierarchy = v })}
                    />
                  )}
                </Section>

                {/* Services */}
                <Section
                  title="Services"
                  icon={Box}
                  count={config.services.length}
                  defaultOpen
                  actions={
                    <Button variant="ghost" size="sm" onClick={addService} leftIcon={<Plus />}>
                      Add
                    </Button>
                  }
                >
                  {config.services.length === 0 ? (
                    <EmptyState
                      compact
                      icon={<Box />}
                      tone="neutral"
                      title="No services defined yet"
                      action={
                        <Button size="sm" onClick={addService} leftIcon={<Plus />}>
                          Add Service
                        </Button>
                      }
                    />
                  ) : (
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
                        {config.services.map(svc => {
                          const SvcIcon = ProviderIconWrapper(svc.provider)
                          return (
                            <Card
                              key={svc.id}
                              interactive
                              selected={expandedSvcId === svc.id}
                              padding="sm"
                              onClick={() => setExpandedSvcId(prev => prev === svc.id ? null : svc.id)}
                            >
                              <div className="flex items-center gap-2">
                                <SvcIcon className="size-4 shrink-0 text-accent" />
                                <div className="min-w-0 flex-1">
                                  <p className="truncate text-xs font-medium text-fg">
                                    {svc.friendly_name || svc.name || 'New Service'}
                                  </p>
                                  <p className="text-2xs text-fg-muted">{svc.provider}</p>
                                </div>
                              </div>
                            </Card>
                          )
                        })}
                      </div>
                      {expandedSvcId && config.services.find(s => s.id === expandedSvcId) && (
                        <ServiceDetailForm
                          svc={config.services.find(s => s.id === expandedSvcId)!}
                          onChange={s => updateService(expandedSvcId, s)}
                          onRemove={() => { removeService(expandedSvcId); setExpandedSvcId(null) }}
                          onClone={() => cloneService(expandedSvcId)}
                          onClose={() => setExpandedSvcId(null)}
                          resources={serverMode ? resources : undefined}
                        />
                      )}
                    </div>
                  )}
                </Section>

                {mode === 'environment' ? (
                  /* Environment mode: flat targets without environment wrapper */
                  <Section
                    title="Targets"
                    icon={Server}
                    count={config.environments[0]?.targets.length ?? 0}
                    defaultOpen
                    actions={
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          const newId = createId()
                          cfg(d => {
                            if (!d.environments[0]) d.environments.push({ id: createId(), name: '', targets: [] })
                            d.environments[0].targets.push({
                              id: newId, name: '', type: 'kubernetes',
                              connection: {}, credential_profile: '', service_names: [], service_overrides: [],
                            })
                          })
                          setExpandedTargetId(newId)
                        }}
                        leftIcon={<Plus />}
                      >
                        Add
                      </Button>
                    }
                  >
                    {(config.environments[0]?.targets ?? []).length === 0 ? (
                      <EmptyState
                        compact
                        icon={<Server />}
                        tone="neutral"
                        title="No targets defined yet"
                        action={
                        <Button
                          size="sm"
                          leftIcon={<Plus />}
                          onClick={() => {
                            const newId = createId()
                            cfg(d => {
                              if (!d.environments[0]) d.environments.push({ id: createId(), name: '', targets: [] })
                              d.environments[0].targets.push({
                                id: newId, name: '', type: 'kubernetes',
                                connection: {}, credential_profile: '', service_names: [], service_overrides: [],
                              })
                            })
                            setExpandedTargetId(newId)
                          }}
                        >
                          Add Target
                        </Button>
                        }
                      />
                    ) : (
                      <div className="space-y-3">
                        {config.environments[0].targets.map(target => (
                          <TargetCard
                            key={target.id}
                            target={target}
                            services={config.services}
                            expanded={expandedTargetId === target.id}
                            onToggle={() => setExpandedTargetId(prev => prev === target.id ? null : target.id)}
                            onChange={t => cfg(d => {
                              const idx = d.environments[0].targets.findIndex(x => x.id === target.id)
                              if (idx >= 0) d.environments[0].targets[idx] = t
                            })}
                            onRemove={() => cfg(d => {
                              d.environments[0].targets = d.environments[0].targets.filter(x => x.id !== target.id)
                            })}
                            onClone={() => {
                              const newId = createId()
                              cfg(d => {
                                const idx = d.environments[0].targets.findIndex(x => x.id === target.id)
                                d.environments[0].targets.splice(idx + 1, 0, {
                                  ...structuredClone(target),
                                  id: newId,
                                  name: target.name ? `${target.name}-copy` : '',
                                })
                              })
                              setExpandedTargetId(newId)
                            }}
                            onConnectFromResource={serverMode && isAdmin ? () => setResourceConnectTarget({ envId: config.environments[0]?.id || '', targetId: target.id }) : undefined}
                            credentials={serverMode ? credentials : undefined}
                          />
                        ))}
                      </div>
                    )}
                  </Section>
                ) : (
                  <>
                    {/* Workspace mode: Environments with nested targets */}
                    <Section
                      title="Environments"
                      icon={FolderTree}
                      count={config.environments.length}
                      defaultOpen
                      actions={
                        <Button variant="ghost" size="sm" onClick={addEnvironment} leftIcon={<Plus />}>
                          Add
                        </Button>
                      }
                    >
                      {config.environments.length === 0 ? (
                        <EmptyState
                          compact
                          icon={<FolderTree />}
                          tone="neutral"
                          title="No environments defined yet"
                          action={
                            <Button size="sm" onClick={addEnvironment} leftIcon={<Plus />}>
                              Add Environment
                            </Button>
                          }
                        />
                      ) : (
                        <div className="space-y-4">
                          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
                            {config.environments.map(env => (
                              <Card
                                key={env.id}
                                interactive
                                selected={expandedEnvId === env.id}
                                padding="sm"
                                onClick={() => setExpandedEnvId(prev => prev === env.id ? null : env.id)}
                              >
                                <div className="flex items-center gap-2">
                                  <FolderTree className="size-4 shrink-0 text-accent" />
                                  <div className="min-w-0 flex-1">
                                    <p className="truncate text-xs font-medium text-fg">
                                      {env.name || 'New Environment'}
                                    </p>
                                    <p className="text-2xs text-fg-muted tabular-nums">
                                      {env.targets.length} target{env.targets.length !== 1 ? 's' : ''}
                                    </p>
                                  </div>
                                </div>
                              </Card>
                            ))}
                          </div>
                          {expandedEnvId && config.environments.find(e => e.id === expandedEnvId) && (
                            <EnvironmentDetailForm
                              env={config.environments.find(e => e.id === expandedEnvId)!}
                              services={config.services}
                              expandedTargetId={expandedTargetId}
                              onToggleTarget={id => setExpandedTargetId(prev => prev === id ? null : id)}
                              onChange={e => updateEnvironment(expandedEnvId, e)}
                              onRemove={() => { removeEnvironment(expandedEnvId); setExpandedEnvId(null) }}
                              onClone={() => cloneEnvironment(expandedEnvId)}
                              onClose={() => setExpandedEnvId(null)}
                              onConnectFromResource={serverMode && isAdmin ? (targetId) => setResourceConnectTarget({ envId: expandedEnvId, targetId }) : undefined}
                              credentials={serverMode ? credentials : undefined}
                            />
                          )}
                        </div>
                      )}
                    </Section>

                    {/* Settings (workspace mode only) */}
                    <Section title="Settings" icon={Settings} defaultOpen={false}>
                      <div className="grid grid-cols-2 gap-4">
                        <FormField label="SSH Timeout" help="SSH connection timeout in seconds">
                          <Input
                            type="number"
                            value={config.settings.ssh_timeout || ''}
                            onChange={e => cfg(d => { d.settings.ssh_timeout = parseInt(e.target.value) || 0 })}
                            placeholder="30"
                          />
                        </FormField>
                      </div>
                    </Section>
                  </>
                )}
              </>
            )}

          </div>
        </div>

        {/* Right: YAML Preview (collapsible) */}
        <div className={cn(
          'flex min-w-0 shrink-0 flex-col border-l border-line bg-surface transition-[width] duration-200',
          yamlOpen ? 'w-[480px]' : 'w-10'
        )}>
          {yamlOpen ? (
            <YamlPreview
              yaml={yaml}
              redactedYaml={redactedYaml}
              filename={filename}
              defaultRedact={adminRedact}
              onImportToServer={onImportToServer ? async (y) => {
                setServerError('')
                setServerImporting(true)
                try {
                  await onImportToServer(y, config)
                } catch (err: unknown) {
                  setServerError(err instanceof Error ? err.message : 'Failed to save')
                } finally {
                  setServerImporting(false)
                }
              } : undefined}
              importing={serverImporting}
              importError={serverError}
              saveLabel={(editWorkspace || editService || editEnvironment) ? 'Save Changes' : undefined}
              onCollapse={() => setYamlOpen(false)}
            />
          ) : (
            <button
              type="button"
              onClick={() => setYamlOpen(true)}
              className="flex w-full cursor-pointer flex-col items-center gap-2 py-4 text-fg-muted transition-colors hover:bg-hover hover:text-fg"
              title="Show YAML preview"
              aria-label="Show YAML preview"
            >
              <ChevronLeft className="size-4" />
              <span className="rotate-180 text-2xs font-medium [writing-mode:vertical-lr]">YAML</span>
            </button>
          )}
        </div>
      </div>

      {showImport && (
        <ImportModal
          onImport={imported => {
            setConfig(imported)
            setShowImport(false)
            setExpandedSvcId(null)
            setExpandedEnvId(null)
            setExpandedTargetId(null)
          }}
          onClose={() => setShowImport(false)}
        />
      )}

      {resourceConnectTarget && (
        <ResourceImporter
          onConnect={handleResourceConnect}
          onClose={() => setResourceConnectTarget(null)}
          existingServices={config.services}
        />
      )}
    </div>
  )
}
