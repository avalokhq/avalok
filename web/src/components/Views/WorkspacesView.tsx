import { useState, useEffect } from 'react'
import { ChevronRight, Server, Plus, Upload, X, Trash2, Pencil, RefreshCw } from 'lucide-react'

import { cn } from '../../lib/cn'
import { listWorkspaces, fetchStats, fetchConfig, listStandaloneEnvs, listStandaloneServices, adminImportWorkspace, adminDeleteWorkspace, adminDeleteStandaloneEnv, adminDeleteStandaloneService, adminListResources } from '../../lib/api'
import type { AdminResource } from '../../lib/api'
import type { Workspace, StandaloneEnvironment, StandaloneService, GroupedStats, AppConfig } from '../../lib/types'
import LayoutToggle from '../ui/LayoutToggle'
import CollectionGrid from '../ui/CollectionGrid'
import { useLayoutToggle } from '../../lib/useLayoutToggle'
import ProviderIcon, { providerDisplayName } from '../ui/ProviderIcon'
import EntityIcon, { EntityIconRaw, entityStyle } from '../ui/EntityIcon'
import Badge, { providerVariant } from '../ui/Badge'
import Button from '../ui/Button'
import IconButton from '../ui/IconButton'
import Card from '../ui/Card'
import StatsGrid from '../ui/StatsGrid'
import DataTable from '../ui/DataTable'
import EmptyState from '../ui/EmptyState'
import Alert from '../ui/Alert'
import Dropdown, { DropdownButton } from '../ui/Dropdown'
import { Textarea } from '../ui/Input'

interface Props {
  onSelect: (workspace: Workspace) => void
  onSelectEnv?: (env: StandaloneEnvironment) => void
  onSelectService?: (svc: StandaloneService) => void
  onSelectResource?: (name: string, description: string, type: string) => void
  userRole?: string
  userScope?: string[]
  serverMode?: boolean
  onCreateWorkspace?: () => void
  onCreateEnvironment?: () => void
  onCreateService?: () => void
  onEditWorkspace?: (name: string) => void
  onEditService?: (name: string) => void
  onEditEnvironment?: (name: string) => void
}

type DashboardItem = {
  kind: 'workspace' | 'environment' | 'service' | 'resource'
  name: string
  description: string
  data: Workspace | StandaloneEnvironment | StandaloneService | AdminResource
}


export default function WorkspacesView({ onSelect, onSelectEnv, onSelectService, onSelectResource, userRole, userScope, serverMode, onCreateWorkspace, onCreateEnvironment, onCreateService, onEditWorkspace, onEditService, onEditEnvironment }: Props) {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [standaloneEnvs, setStandaloneEnvs] = useState<StandaloneEnvironment[]>([])
  const [standaloneServices, setStandaloneServices] = useState<StandaloneService[]>([])
  const [resources, setResources] = useState<AdminResource[]>([])
  const [stats, setStats] = useState<GroupedStats | null>(null)
  const [config, setConfig] = useState<AppConfig>({ enable_workspaces: true, enable_environments: true, enable_services: true, log_buffer_lines: 10000 })
  const [loading, setLoading] = useState(true)
  const [showImport, setShowImport] = useState(false)

  const { layout, changeLayout } = useLayoutToggle('avalok-home-layout')

  function loadData() {
    const hasResourceScope = userRole === 'admin' || (userScope || []).some(s => s.startsWith('res:'))
    const fetchResources = (serverMode && hasResourceScope)
      ? adminListResources().catch(() => [])
      : Promise.resolve([])
    Promise.all([
      listWorkspaces(),
      fetchStats().catch(() => null),
      fetchConfig().catch(() => ({ enable_workspaces: true, enable_environments: true, enable_services: true, log_buffer_lines: 10000 })),
      listStandaloneEnvs().catch(() => []),
      listStandaloneServices().catch(() => []),
      fetchResources,
    ]).then(([ws, st, cfg, envs, svcs, res]) => {
      setWorkspaces(ws || [])
      setStats(st)
      setConfig(cfg)
      setStandaloneEnvs(envs || [])
      setStandaloneServices(svcs || [])
      setResources(res || [])
    }).catch(err => {
      console.error('Failed to load dashboard:', err)
    }).finally(() => setLoading(false))
  }

  useEffect(() => { loadData() }, [])

  async function handleDeleteWs(e: React.MouseEvent, name: string) {
    e.stopPropagation()
    if (!confirm(`Delete workspace "${name}"? This cannot be undone.`)) return
    try { await adminDeleteWorkspace(name); loadData() } catch (err) { console.error('Failed to delete workspace:', err) }
  }

  async function handleDeleteEnv(e: React.MouseEvent, name: string) {
    e.stopPropagation()
    if (!confirm(`Delete environment "${name}"? This cannot be undone.`)) return
    try { await adminDeleteStandaloneEnv(name); loadData() } catch (err) { console.error('Failed to delete environment:', err) }
  }

  async function handleDeleteSvc(e: React.MouseEvent, name: string) {
    e.stopPropagation()
    if (!confirm(`Delete service "${name}"? This cannot be undone.`)) return
    try { await adminDeleteStandaloneService(name); loadData() } catch (err) { console.error('Failed to delete service:', err) }
  }

  if (loading) {
    return (
      <div className="flex-1 overflow-auto">
        <div className="px-8 lg:px-16 py-8">
          <div className="grid gap-4 mb-6 grid-cols-2 sm:grid-cols-4">
            {[1,2,3,4].map(i => <div key={i} className="skeleton h-24" />)}
          </div>
          <div className="skeleton h-6 w-40 mb-6 !rounded-lg" />
          <div className="grid gap-4">
            {[1,2,3].map(i => <div key={i} className="skeleton h-16" />)}
          </div>
        </div>
      </div>
    )
  }

  const showWs = config.enable_workspaces
  const showEnv = config.enable_environments
  const showSvc = config.enable_services
  const isAdmin = userRole === 'admin'

  /* ── Stats ── */
  const statsItems = []
  if (stats) {
    if (showWs) {
      statsItems.push({
        label: 'Workspaces',
        value: stats.workspace_stats.count,
        icon: <EntityIconRaw kind="workspace" className="w-4 h-4" />,
        accent: entityStyle('workspace').color,
        bg: entityStyle('workspace').bg,
        sub: [
          { label: 'Environments', value: stats.workspace_stats.environments ?? 0 },
          { label: 'Services', value: stats.workspace_stats.services },
          { label: 'Up', value: stats.workspace_stats.up, color: 'text-emerald-400' },
          ...(stats.workspace_stats.down > 0 ? [{ label: 'Down', value: stats.workspace_stats.down, color: 'text-red-400' }] : []),
        ],
      })
    }
    if (showEnv) {
      statsItems.push({
        label: 'Environments',
        value: stats.environment_stats.count,
        icon: <EntityIconRaw kind="environment" className="w-4 h-4" />,
        accent: entityStyle('environment').color,
        bg: entityStyle('environment').bg,
        sub: [
          { label: 'Services', value: stats.environment_stats.services },
          { label: 'Up', value: stats.environment_stats.up, color: 'text-emerald-400' },
          ...(stats.environment_stats.down > 0 ? [{ label: 'Down', value: stats.environment_stats.down, color: 'text-red-400' }] : []),
        ],
      })
    }
    if (showSvc) {
      statsItems.push({
        label: 'Services',
        value: stats.service_stats.count,
        icon: <EntityIconRaw kind="service" className="w-4 h-4" />,
        accent: entityStyle('service').color,
        bg: entityStyle('service').bg,
        sub: [
          { label: 'Up', value: stats.service_stats.up, color: 'text-emerald-400' },
          ...(stats.service_stats.down > 0 ? [{ label: 'Down', value: stats.service_stats.down, color: 'text-red-400' }] : []),
        ],
      })
    }
  }
  if (resources.length > 0) {
    statsItems.push({
      label: 'Resources',
      value: resources.length,
      icon: <EntityIconRaw kind="resource" className="w-4 h-4" />,
      accent: entityStyle('resource').color,
      bg: entityStyle('resource').bg,
      sub: [],
    })
  }

  /* ── Create-menu items ── */
  const createMenuItems = [
    ...(showWs && onCreateWorkspace ? [{ label: 'Workspace', icon: <EntityIconRaw kind="workspace" className={cn('w-4 h-4', entityStyle('workspace').color)} />, onClick: onCreateWorkspace }] : []),
    ...(showEnv && onCreateEnvironment ? [{ label: 'Environment', icon: <EntityIconRaw kind="environment" className={cn('w-4 h-4', entityStyle('environment').color)} />, onClick: onCreateEnvironment }] : []),
    ...(showSvc && onCreateService ? [{ label: 'Service', icon: <EntityIconRaw kind="service" className={cn('w-4 h-4', entityStyle('service').color)} />, onClick: onCreateService }] : []),
  ]

  /* ── Build unified items list ── */
  const allItems: DashboardItem[] = [
    ...(showWs ? workspaces.map(ws => ({ kind: 'workspace' as const, name: ws.name, description: ws.description || '', data: ws })) : []),
    ...(showEnv ? standaloneEnvs.map(env => ({ kind: 'environment' as const, name: env.name, description: env.description || '', data: env })) : []),
    ...(showSvc ? standaloneServices.map(svc => ({ kind: 'service' as const, name: svc.name, description: svc.description || '', data: svc })) : []),
    ...resources.map(res => ({ kind: 'resource' as const, name: res.name, description: res.description || '', data: res })),
  ]

  function handleItemClick(item: DashboardItem) {
    switch (item.kind) {
      case 'workspace': onSelect(item.data as Workspace); break
      case 'environment': onSelectEnv?.(item.data as StandaloneEnvironment); break
      case 'service': onSelectService?.(item.data as StandaloneService); break
      case 'resource': {
        const r = item.data as AdminResource
        onSelectResource?.(r.name, r.description || '', r.type)
        break
      }
    }
  }

  function handleItemEdit(e: React.MouseEvent, item: DashboardItem) {
    e.stopPropagation()
    switch (item.kind) {
      case 'workspace': onEditWorkspace?.(item.name); break
      case 'environment': onEditEnvironment?.(item.name); break
      case 'service': onEditService?.(item.name); break
    }
  }

  function handleItemDelete(e: React.MouseEvent, item: DashboardItem) {
    switch (item.kind) {
      case 'workspace': handleDeleteWs(e, item.name); break
      case 'environment': handleDeleteEnv(e, item.name); break
      case 'service': handleDeleteSvc(e, item.name); break
    }
  }

  function renderDetails(item: DashboardItem) {
    switch (item.kind) {
      case 'workspace': {
        const ws = item.data as Workspace
        return (
          <div className="flex items-center justify-end gap-3 text-xs text-[var(--text-secondary)]">
            <span>{ws.environments} env{ws.environments !== 1 ? 's' : ''}</span>
            <span className="flex items-center gap-1"><Server className="w-3 h-3" />{ws.services} svc{ws.services !== 1 ? 's' : ''}</span>
          </div>
        )
      }
      case 'environment': {
        const env = item.data as StandaloneEnvironment
        return (
          <div className="flex items-center justify-end gap-1 text-xs text-[var(--text-secondary)]">
            <Server className="w-3 h-3" />{env.services} service{env.services !== 1 ? 's' : ''}
          </div>
        )
      }
      case 'service': {
        const svc = item.data as StandaloneService
        return (
          <Badge variant={providerVariant(svc.provider)}>
            <ProviderIcon provider={svc.provider} className="w-3 h-3" />
            {providerDisplayName(svc.provider)}
          </Badge>
        )
      }
      case 'resource': {
        const res = item.data as AdminResource
        return (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 font-medium">
            {providerDisplayName(res.type) || res.type}
          </span>
        )
      }
    }
  }

  /* ── Unified columns ── */
  const columns = [
    {
      key: 'name',
      header: 'Name',
      render: (item: DashboardItem) => {
        const style = entityStyle(item.kind)
        const ws = item.kind === 'workspace' ? item.data as Workspace : null
        return (
          <div className="flex items-center gap-3">
            {item.kind === 'service' || item.kind === 'resource'
              ? <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center shrink-0', style.bg, style.color)}>
                  <ProviderIcon provider={item.kind === 'service' ? (item.data as StandaloneService).provider : (item.data as AdminResource).type} className="w-5 h-5" />
                </div>
              : <EntityIcon kind={item.kind} />}
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-[var(--text-primary)]">{item.name}</span>
                {ws?.hierarchy?.name === 'service-first' && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20 font-medium">service-first</span>
                )}
              </div>
              {item.description && <div className="text-xs text-[var(--text-secondary)] mt-0.5 line-clamp-1">{item.description}</div>}
            </div>
          </div>
        )
      },
    },
    {
      key: 'type',
      header: 'Type',
      render: (item: DashboardItem) => {
        const style = entityStyle(item.kind)
        return (
          <span className={cn('text-[10px] px-1.5 py-0.5 rounded border font-medium', style.badge)}>
            {style.label}
          </span>
        )
      },
    },
    {
      key: 'details',
      header: 'Details',
      align: 'right' as const,
      render: (item: DashboardItem) => renderDetails(item),
    },
    ...(isAdmin ? [{
      key: 'actions',
      header: '',
      className: 'w-24',
      render: (item: DashboardItem) => {
        if (item.kind === 'resource') return null
        return (
          <div className="flex items-center gap-0.5 justify-end">
            <IconButton variant={'accent' as const} onClick={(e: React.MouseEvent<HTMLButtonElement>) => handleItemEdit(e, item)} title={`Edit ${item.kind}`}>
              <Pencil className="w-4 h-4" />
            </IconButton>
            <IconButton variant={'danger' as const} onClick={(e: React.MouseEvent<HTMLButtonElement>) => handleItemDelete(e, item)} title="Delete">
              <Trash2 className="w-4 h-4" />
            </IconButton>
          </div>
        )
      },
    }] : []),
    {
      key: 'arrow',
      header: '',
      className: 'w-8',
      render: () => <ChevronRight className="w-4 h-4 text-[var(--text-muted)]" />,
    },
  ]

  return (
    <div className="flex-1 overflow-auto">
      <div className="px-8 lg:px-16 py-8">
        {/* Top bar: actions + layout toggle */}
        <div className="flex items-center justify-between mb-6">
          <div />
          <div className="flex items-center gap-2">
            <IconButton onClick={loadData} title="Refresh">
              <RefreshCw className="w-4 h-4" />
            </IconButton>
            {isAdmin && createMenuItems.length > 0 && (
              <Dropdown
                trigger={
                  <DropdownButton>
                    <Plus className="w-3.5 h-3.5" />
                    Create
                  </DropdownButton>
                }
                items={createMenuItems}
              />
            )}
            {isAdmin && (
              <Button
                variant={showImport ? 'primary' : 'secondary'}
                size="md"
                onClick={() => setShowImport(!showImport)}
              >
                {showImport ? <X className="w-3.5 h-3.5" /> : <Upload className="w-3.5 h-3.5" />}
                {showImport ? 'Cancel' : 'Import YAML'}
              </Button>
            )}
            <LayoutToggle layout={layout} onChange={changeLayout} />
          </div>
        </div>

        {showImport && (
          <ImportYAMLInline onDone={() => { setShowImport(false); loadData() }} />
        )}

        {/* Stats */}
        {statsItems.length > 0 && <StatsGrid items={statsItems} />}

        {/* Unified table / grid */}
        {allItems.length > 0 ? (
          layout === 'list' ? (
            <DataTable columns={columns} data={allItems} keyFn={item => `${item.kind}-${item.name}`} onRowClick={handleItemClick} />
          ) : (
            <CollectionGrid>
              {allItems.map(item => {
                const style = entityStyle(item.kind)
                const ws = item.kind === 'workspace' ? item.data as Workspace : null
                return (
                  <Card key={`${item.kind}-${item.name}`} hover padding="lg" onClick={() => handleItemClick(item)} className="cursor-pointer text-left group">
                    <div className="flex items-center gap-2 mb-3 w-full">
                      {item.kind === 'service' || item.kind === 'resource'
                        ? <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center', style.bg, style.color)}>
                            <ProviderIcon provider={item.kind === 'service' ? (item.data as StandaloneService).provider : (item.data as AdminResource).type} className="w-5 h-5" />
                          </div>
                        : <EntityIcon kind={item.kind} />}
                      <span className={cn('text-[10px] px-1.5 py-0.5 rounded border font-medium', style.badge)}>
                        {style.label}
                      </span>
                      {ws?.hierarchy?.name === 'service-first' && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20 font-medium">service-first</span>
                      )}
                    </div>
                    <div className="text-base text-[var(--text-primary)]">{item.name}</div>
                    {item.description && <div className="text-xs text-[var(--text-secondary)] mt-1 line-clamp-2">{item.description}</div>}
                    <div className="flex items-center gap-3 mt-4 pt-3 border-t border-[var(--border-subtle)] w-full text-xs text-[var(--text-secondary)]">
                      {renderDetails(item)}
                      {isAdmin && item.kind !== 'resource' && (
                        <div className="ml-auto flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-all">
                          <IconButton variant="accent" onClick={e => handleItemEdit(e, item)} title="Edit">
                            <Pencil className="w-3.5 h-3.5" />
                          </IconButton>
                          <IconButton variant="danger" onClick={e => handleItemDelete(e, item)} title="Delete">
                            <Trash2 className="w-3.5 h-3.5" />
                          </IconButton>
                        </div>
                      )}
                    </div>
                  </Card>
                )
              })}
            </CollectionGrid>
          )
        ) : (
          <EmptyState
            icon={<EntityIconRaw kind="workspace" className="w-7 h-7 text-[var(--text-accent)] opacity-60" />}
            iconBg="bg-accent-500/10"
            title="Nothing here yet"
            description="Create a workspace, environment, or service to get started."
            action={isAdmin && onCreateWorkspace ? (
              <Button onClick={onCreateWorkspace}><Plus className="w-3.5 h-3.5" />Create Workspace</Button>
            ) : undefined}
          />
        )}
      </div>
    </div>
  )
}

/* ── Import YAML ── */

function ImportYAMLInline({ onDone }: { onDone: () => void }) {
  const [yaml, setYaml] = useState('')
  const [error, setError] = useState('')
  const [importing, setImporting] = useState(false)
  const [detectedType, setDetectedType] = useState<'workspace' | 'environment' | 'service' | null>(null)
  const [confirmType, setConfirmType] = useState(false)

  function detectType(content: string): 'workspace' | 'environment' | 'service' {
    const hasEnvironments = /^environments:/m.test(content)
    const hasServices = /^services:/m.test(content)
    const hasProvider = /^provider:/m.test(content)
    if (hasEnvironments) return 'workspace'
    if (hasServices) return 'environment'
    if (hasProvider) return 'service'
    return 'workspace'
  }

  function handleYamlChange(content: string) {
    setYaml(content)
    if (content.trim()) {
      const type = detectType(content)
      setDetectedType(type)
      setConfirmType(type !== 'workspace')
    } else {
      setDetectedType(null)
      setConfirmType(false)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!detectedType) return
    if (confirmType) return
    setImporting(true)
    setError('')
    try {
      await adminImportWorkspace(yaml)
      onDone()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to import')
    } finally { setImporting(false) }
  }

  async function handleConfirmedImport() {
    setImporting(true)
    setError('')
    try {
      await adminImportWorkspace(yaml)
      onDone()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to import')
    } finally { setImporting(false) }
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => handleYamlChange(reader.result as string)
    reader.readAsText(file)
  }

  const typeLabel = detectedType === 'workspace' ? 'Workspace' : detectedType === 'environment' ? 'Environment' : 'Service'
  const typeColor = detectedType === 'workspace' ? 'text-[var(--text-accent)]' : detectedType === 'environment' ? 'text-blue-400' : 'text-emerald-400'

  return (
    <Card padding="lg" className="mb-6">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-medium text-[var(--text-primary)]">Import YAML</h3>
          {detectedType && yaml.trim() && (
            <span className={cn('text-xs font-medium', typeColor)}>
              Detected: {typeLabel}
            </span>
          )}
        </div>
        <label className="flex items-center gap-1.5 text-xs text-[var(--text-accent)] hover:underline cursor-pointer">
          <Upload className="w-3.5 h-3.5" />
          Upload file
          <input type="file" accept=".yaml,.yml" onChange={handleFile} className="hidden" />
        </label>
      </div>

      {error && <Alert variant="error" className="mb-3">{error}</Alert>}

      {confirmType && detectedType && detectedType !== 'workspace' && (
        <Alert variant="warning" className="mb-3">
          This looks like a standalone <strong>{typeLabel.toLowerCase()}</strong> (no {detectedType === 'environment' ? 'environments' : 'services/provider'} block found).
          <div className="flex items-center gap-2 mt-2">
            <Button variant="ghost" size="sm" className="bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 hover:text-amber-300"
              onClick={() => { setConfirmType(false); handleConfirmedImport() }}>
              Import as {typeLabel}
            </Button>
            <Button variant="ghost" size="sm"
              onClick={() => { setConfirmType(false); setDetectedType('workspace') }}>
              Import as Workspace instead
            </Button>
          </div>
        </Alert>
      )}

      <form onSubmit={handleSubmit}>
        <Textarea
          value={yaml}
          onChange={e => handleYamlChange(e.target.value)}
          className="h-48 font-mono"
          placeholder="Paste YAML here or upload a file..."
          required
        />
        <div className="flex justify-end mt-3">
          {(!confirmType || detectedType === 'workspace') && (
            <Button type="submit" loading={importing} disabled={!yaml.trim()}>
              Import {detectedType ? typeLabel : ''}
            </Button>
          )}
        </div>
      </form>
    </Card>
  )
}
