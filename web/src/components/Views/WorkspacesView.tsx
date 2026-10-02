import { useState, useEffect } from 'react'
import { ArrowRight, Pencil, Plus, RefreshCw, Server, Trash2, Upload, X } from 'lucide-react'

import { cn } from '../../lib/cn'
import { plural } from '../../lib/format'
import { listWorkspaces, fetchStats, fetchConfig, listStandaloneEnvs, listStandaloneServices, adminDeleteWorkspace, adminDeleteStandaloneEnv, adminDeleteStandaloneService, adminListResources } from '../../lib/api'
import type { AdminResource } from '../../lib/api'
import type { Workspace, StandaloneEnvironment, StandaloneService, GroupedStats, AppConfig } from '../../lib/types'
import ProviderIcon, { providerDisplayName } from '../ui/ProviderIcon'
import { EntityIconRaw, entityLabel, entityStyle, type EntityKind } from '../ui/EntityIcon'
import EntityCollection from '../ui/EntityCollection'
import Badge from '../ui/Badge'
import Button from '../ui/Button'
import IconButton from '../ui/IconButton'
import StatsGrid, { type StatItem } from '../ui/StatsGrid'
import { type Column } from '../ui/DataTable'
import EmptyState from '../ui/EmptyState'
import Alert from '../ui/Alert'
import PageHeader from '../ui/PageHeader'
import Skeleton from '../ui/Skeleton'
import FilterChip from '../ui/FilterChip'
import Dropdown, { DropdownButton, type MenuItem } from '../ui/Dropdown'
import { useConfirm, useToast } from '../ui/Feedback'
import Page from '../Layout/Page'
import ImportYAMLCard from './ImportYAMLCard'

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
  kind: EntityKind
  name: string
  description: string
  data: Workspace | StandaloneEnvironment | StandaloneService | AdminResource
}

type KindFilter = EntityKind | 'all'

const KIND_ORDER: EntityKind[] = ['workspace', 'environment', 'service', 'resource']
const ACTION_LABEL: Record<EntityKind, string> = { workspace: 'Open', environment: 'Open', service: 'View logs', resource: 'Explore' }
const DEFAULT_CONFIG: AppConfig = { enable_workspaces: true, enable_environments: false, enable_services: false, log_buffer_lines: 10000 }

const itemKey = (item: DashboardItem) => `${item.kind}-${item.name}`

/** Provider (services) or resource type; null for workspaces and environments. */
function itemProvider(item: DashboardItem): string | null {
  if (item.kind === 'service') return (item.data as StandaloneService).provider
  if (item.kind === 'resource') return (item.data as AdminResource).type
  return null
}

export default function WorkspacesView({ onSelect, onSelectEnv, onSelectService, onSelectResource, userRole, userScope, serverMode, onCreateWorkspace, onCreateEnvironment, onCreateService, onEditWorkspace, onEditService, onEditEnvironment }: Props) {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [standaloneEnvs, setStandaloneEnvs] = useState<StandaloneEnvironment[]>([])
  const [standaloneServices, setStandaloneServices] = useState<StandaloneService[]>([])
  const [resources, setResources] = useState<AdminResource[]>([])
  const [stats, setStats] = useState<GroupedStats | null>(null)
  const [config, setConfig] = useState<AppConfig>(DEFAULT_CONFIG)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showImport, setShowImport] = useState(false)
  const [kindFilter, setKindFilter] = useState<KindFilter>('all')
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const confirm = useConfirm()
  const toast = useToast()

  function loadData() {
    setRefreshing(true)
    const hasResourceScope = userRole === 'admin' || (userScope || []).some(s => s.startsWith('res:'))
    const fetchResources = (serverMode && hasResourceScope)
      ? adminListResources().catch(() => [])
      : Promise.resolve([])
    Promise.all([
      listWorkspaces(),
      fetchStats().catch(() => null),
      fetchConfig().catch(() => DEFAULT_CONFIG),
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
      setError(null)
    }).catch(err => {
      setError(err instanceof Error ? err.message : 'Failed to load the dashboard')
    }).finally(() => { setLoading(false); setRefreshing(false) })
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadData() }, [])

  const showWs = config.enable_workspaces
  const showEnv = config.enable_environments
  const showSvc = config.enable_services
  const isAdmin = userRole === 'admin'

  /* ── Items and counts ── */
  const allItems: DashboardItem[] = [
    ...(showWs ? workspaces.map(ws => ({ kind: 'workspace' as const, name: ws.name, description: ws.description || '', data: ws })) : []),
    ...(showEnv ? standaloneEnvs.map(env => ({ kind: 'environment' as const, name: env.name, description: env.description || '', data: env })) : []),
    ...(showSvc ? standaloneServices.map(svc => ({ kind: 'service' as const, name: svc.name, description: svc.description || '', data: svc })) : []),
    ...resources.map(res => ({ kind: 'resource' as const, name: res.name, description: res.description || '', data: res })),
  ]

  const counts = Object.fromEntries(KIND_ORDER.map(k => [k, allItems.filter(i => i.kind === k).length])) as Record<EntityKind, number>

  function toggleKind(kind: EntityKind) {
    setKindFilter(f => (f === kind ? 'all' : kind))
  }

  /* ── Actions ── */
  function openHandler(item: DashboardItem): (() => void) | undefined {
    switch (item.kind) {
      case 'workspace': return () => onSelect(item.data as Workspace)
      case 'environment': return onSelectEnv && (() => onSelectEnv(item.data as StandaloneEnvironment))
      case 'service': return onSelectService && (() => onSelectService(item.data as StandaloneService))
      case 'resource': {
        const r = item.data as AdminResource
        return onSelectResource && (() => onSelectResource(r.name, r.description || '', r.type))
      }
    }
  }

  function editHandler(item: DashboardItem): (() => void) | undefined {
    switch (item.kind) {
      case 'workspace': return onEditWorkspace && (() => onEditWorkspace(item.name))
      case 'environment': return onEditEnvironment && (() => onEditEnvironment(item.name))
      case 'service': return onEditService && (() => onEditService(item.name))
      default: return undefined
    }
  }

  async function handleDelete(item: DashboardItem) {
    const remove = item.kind === 'workspace' ? adminDeleteWorkspace
      : item.kind === 'environment' ? adminDeleteStandaloneEnv
        : item.kind === 'service' ? adminDeleteStandaloneService
          : null
    if (!remove) return
    const label = entityLabel(item.kind).toLowerCase()
    const ok = await confirm({
      title: `Delete ${label} "${item.name}"?`,
      description: 'Its configuration will be removed from Avalok. This cannot be undone.',
      confirmLabel: `Delete ${label}`,
      danger: true,
    })
    if (!ok) return
    setBusyKey(itemKey(item))
    try {
      await remove(item.name)
      toast.success(`Deleted ${item.name}`)
      loadData()
    } catch (err) {
      toast.error(`Couldn't delete ${item.name}`, err instanceof Error ? err.message : undefined)
    } finally {
      setBusyKey(null)
    }
  }

  function menuItems(item: DashboardItem): MenuItem[] | undefined {
    if (!isAdmin) return undefined
    const items: MenuItem[] = []
    const open = openHandler(item)
    const edit = editHandler(item)
    if (open) items.push({ label: ACTION_LABEL[item.kind], icon: <ArrowRight />, onClick: open })
    if (edit) items.push({ label: 'Edit', icon: <Pencil />, onClick: edit })
    if (item.kind !== 'resource') {
      if (items.length > 0) items.push({ separator: true })
      items.push({ label: 'Delete', icon: <Trash2 />, danger: true, onClick: () => handleDelete(item) })
    }
    // A menu holding only the primary action adds nothing: the card/row already does that.
    return items.length > 1 ? items : undefined
  }

  /* ── Stats (click to filter) ── */
  const statsItems: StatItem[] = []
  const statFor = (kind: EntityKind, value: number, sub: StatItem['sub']): StatItem => ({
    label: `${entityLabel(kind)}s`,
    value,
    icon: <EntityIconRaw kind={kind} />,
    tone: entityStyle(kind).tone,
    sub,
    onClick: () => toggleKind(kind),
    active: kindFilter === kind,
  })
  if (stats) {
    if (showWs) {
      statsItems.push(statFor('workspace', stats.workspace_stats.count, [
        { label: 'Environments', value: stats.workspace_stats.environments ?? 0 },
        { label: 'Services', value: stats.workspace_stats.services },
        { label: 'Up', value: stats.workspace_stats.up, tone: 'success' },
        ...(stats.workspace_stats.down > 0 ? [{ label: 'Down', value: stats.workspace_stats.down, tone: 'danger' as const }] : []),
      ]))
    }
    if (showEnv) {
      statsItems.push(statFor('environment', stats.environment_stats.count, [
        { label: 'Services', value: stats.environment_stats.services },
        { label: 'Up', value: stats.environment_stats.up, tone: 'success' },
        ...(stats.environment_stats.down > 0 ? [{ label: 'Down', value: stats.environment_stats.down, tone: 'danger' as const }] : []),
      ]))
    }
    if (showSvc) {
      statsItems.push(statFor('service', stats.service_stats.count, [
        { label: 'Up', value: stats.service_stats.up, tone: 'success' },
        ...(stats.service_stats.down > 0 ? [{ label: 'Down', value: stats.service_stats.down, tone: 'danger' as const }] : []),
      ]))
    }
  }
  if (resources.length > 0) statsItems.push(statFor('resource', resources.length, []))

  /* ── Create menu ── */
  const createMenuItems: MenuItem[] = [
    ...(showWs && onCreateWorkspace ? [{ label: 'Workspace', icon: <EntityIconRaw kind="workspace" className={entityStyle('workspace').color} />, onClick: onCreateWorkspace }] : []),
    ...(showEnv && onCreateEnvironment ? [{ label: 'Environment', icon: <EntityIconRaw kind="environment" className={entityStyle('environment').color} />, onClick: onCreateEnvironment }] : []),
    ...(showSvc && onCreateService ? [{ label: 'Service', icon: <EntityIconRaw kind="service" className={entityStyle('service').color} />, onClick: onCreateService }] : []),
  ]

  /* ── Renderers ── */
  function renderMeta(item: DashboardItem) {
    switch (item.kind) {
      case 'workspace': {
        const ws = item.data as Workspace
        return (
          <>
            <span className="flex items-center gap-1.5"><EntityIconRaw kind="environment" className="size-3.5" />{plural(ws.environments, 'env')}</span>
            <span className="flex items-center gap-1.5"><Server className="size-3.5" />{plural(ws.services, 'service')}</span>
          </>
        )
      }
      case 'environment': {
        const env = item.data as StandaloneEnvironment
        return <span className="flex items-center gap-1.5"><Server className="size-3.5" />{plural(env.services, 'service')}</span>
      }
      default: {
        const provider = itemProvider(item) || ''
        return (
          <span className="flex min-w-0 items-center gap-1.5">
            <ProviderIcon provider={provider} className="size-3.5 shrink-0" />
            <span className="truncate">{providerDisplayName(provider) || provider}</span>
          </span>
        )
      }
    }
  }

  function renderBadges(item: DashboardItem) {
    const ws = item.kind === 'workspace' ? item.data as Workspace : null
    return ws?.hierarchy?.name === 'service-first' ? <Badge size="sm" tone="info">service-first</Badge> : null
  }

  const typeColumn: Column<DashboardItem> = {
    key: 'type',
    header: 'Type',
    className: 'w-36',
    sortValue: item => KIND_ORDER.indexOf(item.kind),
    render: item => <Badge tone={entityStyle(item.kind).tone}>{entityLabel(item.kind)}</Badge>,
  }

  return (
    <Page>
      <PageHeader
        eyebrow="Overview"
        title="Dashboard"
        description="Everything Avalok can stream logs from. Pick one to dive in."
        actions={
          <>
            <IconButton label="Refresh" size="md" onClick={loadData} disabled={refreshing}>
              <RefreshCw className={cn('size-4', refreshing && 'animate-spin')} />
            </IconButton>
            {isAdmin && (
              <Button variant="secondary" leftIcon={showImport ? <X /> : <Upload />} onClick={() => setShowImport(s => !s)}>
                {showImport ? 'Cancel import' : 'Import YAML'}
              </Button>
            )}
            {isAdmin && createMenuItems.length > 0 && (
              <Dropdown
                trigger={<DropdownButton><Plus className="size-3.5" />Create</DropdownButton>}
                items={createMenuItems}
              />
            )}
          </>
        }
      />

      {showImport && (
        <ImportYAMLCard onDone={() => { setShowImport(false); toast.success('Import complete'); loadData() }} />
      )}

      {error && (
        <Alert
          tone="danger"
          title="Couldn't load the dashboard"
          action={<Button size="sm" variant="secondary" onClick={loadData} loading={refreshing}>Retry</Button>}
          className="mb-6"
        >
          {error}
        </Alert>
      )}

      {/* Stats: each card filters the list to its kind */}
      {loading ? (
        <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-32" />)}
        </div>
      ) : statsItems.length > 0 && <StatsGrid items={statsItems} />}

      <EntityCollection
        items={allItems}
        keyFn={itemKey}
        kind={item => item.kind}
        name={item => item.name}
        description={item => item.description}
        icon={item => {
          const provider = itemProvider(item)
          return provider ? <ProviderIcon provider={provider} /> : undefined
        }}
        badges={renderBadges}
        meta={renderMeta}
        columns={[typeColumn]}
        searchText={item => {
          const provider = itemProvider(item)
          return [item.name, item.description, entityLabel(item.kind), provider, provider && providerDisplayName(provider)]
        }}
        searchPlaceholder="Filter by name, description or provider…"
        actionLabel={item => ACTION_LABEL[item.kind]}
        onOpen={openHandler}
        menuItems={menuItems}
        busyKey={busyKey}
        layoutKey="avalok-home-layout"
        loading={loading}
        filters={
          <>
            <FilterChip label="All" count={allItems.length} active={kindFilter === 'all'} onToggle={() => setKindFilter('all')} />
            {KIND_ORDER.filter(k => counts[k] > 0).map(k => (
              <FilterChip
                key={k}
                label={`${entityLabel(k)}s`}
                count={counts[k]}
                active={kindFilter === k}
                onToggle={() => toggleKind(k)}
                leading={<EntityIconRaw kind={k} className={cn('size-3.5 shrink-0', entityStyle(k).color)} />}
              />
            ))}
          </>
        }
        filter={item => kindFilter === 'all' || item.kind === kindFilter}
        filterActive={kindFilter !== 'all'}
        onClearFilters={() => setKindFilter('all')}
        empty={!error && (
          <EmptyState
            icon={<EntityIconRaw kind="workspace" />}
            title="Nothing here yet"
            description="Create a workspace, environment or service to start streaming logs."
            action={isAdmin && onCreateWorkspace ? (
              <Button leftIcon={<Plus />} onClick={onCreateWorkspace}>Create workspace</Button>
            ) : undefined}
          />
        )}
      />
    </Page>
  )
}
