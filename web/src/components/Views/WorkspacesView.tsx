import { useState, useEffect } from 'react'
import { Layers, ChevronRight, Server, Boxes, Plus, Upload, X, Trash2, Pencil, RefreshCw, Globe } from 'lucide-react'

const KUBERNETES_LOGO = 'https://cdn.jsdelivr.net/gh/selfhst/icons@main/webp/kubernetes.webp'
import { cn } from '../../lib/cn'
import { listWorkspaces, fetchStats, fetchConfig, listStandaloneEnvs, listStandaloneServices, adminImportWorkspace, adminDeleteWorkspace, adminDeleteStandaloneEnv, adminDeleteStandaloneService, adminListResources } from '../../lib/api'
import type { AdminResource } from '../../lib/api'
import type { Workspace, StandaloneEnvironment, StandaloneService, GroupedStats, AppConfig } from '../../lib/types'
import LayoutToggle from '../ui/LayoutToggle'
import CollectionGrid from '../ui/CollectionGrid'
import { useLayoutToggle } from '../../lib/useLayoutToggle'
import ProviderIcon from '../ui/ProviderIcon'
import Badge, { providerVariant } from '../ui/Badge'
import Button from '../ui/Button'
import IconButton from '../ui/IconButton'
import Card from '../ui/Card'
import Section from '../ui/Section'
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
  onSelectResource?: (name: string, description: string) => void
  userRole?: string
  userScope?: string[]
  serverMode?: boolean
  onCreateWorkspace?: () => void
  onCreateEnvironment?: () => void
  onCreateService?: () => void
  onEditWorkspace?: (name: string) => void
}

export default function WorkspacesView({ onSelect, onSelectEnv, onSelectService, onSelectResource, userRole, userScope, serverMode, onCreateWorkspace, onCreateEnvironment, onCreateService, onEditWorkspace }: Props) {
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
          <div className="grid gap-4 mb-6 grid-cols-1 sm:grid-cols-3">
            {[1,2,3].map(i => <div key={i} className="skeleton h-24" />)}
          </div>
          <div className="skeleton h-6 w-40 mb-6 !rounded-lg" />
          <div className="grid gap-4">
            {[1,2,3].map(i => <div key={i} className="skeleton h-20" />)}
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
        icon: <Layers className="w-4 h-4" />,
        accent: 'text-[var(--text-accent)]',
        bg: 'bg-accent-500/10',
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
        icon: <Boxes className="w-4 h-4" />,
        accent: 'text-blue-400',
        bg: 'bg-blue-500/10',
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
        icon: <Server className="w-4 h-4" />,
        accent: 'text-emerald-400',
        bg: 'bg-emerald-500/10',
        sub: [
          { label: 'Up', value: stats.service_stats.up, color: 'text-emerald-400' },
          ...(stats.service_stats.down > 0 ? [{ label: 'Down', value: stats.service_stats.down, color: 'text-red-400' }] : []),
        ],
      })
    }
  }

  /* ── Create-menu items ── */
  const createMenuItems = [
    ...(showWs && onCreateWorkspace ? [{ label: 'Workspace', icon: <Layers className="w-4 h-4 text-[var(--text-accent)]" />, onClick: onCreateWorkspace }] : []),
    ...(showEnv && onCreateEnvironment ? [{ label: 'Environment', icon: <Globe className="w-4 h-4 text-blue-400" />, onClick: onCreateEnvironment }] : []),
    ...(showSvc && onCreateService ? [{ label: 'Service', icon: <Server className="w-4 h-4 text-emerald-400" />, onClick: onCreateService }] : []),
  ]

  /* ── Workspace columns (list view) ── */
  const wsColumns = [
    {
      key: 'name',
      header: 'Name',
      render: (ws: Workspace) => (
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-accent-500/10 flex items-center justify-center shrink-0">
            <Layers className="w-4 h-4 text-[var(--text-accent)]" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-[var(--text-primary)]">{ws.name}</span>
              {ws.hierarchy?.name === 'service-first' && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20 font-medium">service-first</span>
              )}
            </div>
            {ws.description && <div className="text-xs text-[var(--text-secondary)] mt-0.5 line-clamp-1">{ws.description}</div>}
          </div>
        </div>
      ),
    },
    {
      key: 'details',
      header: 'Details',
      className: 'w-48',
      render: (ws: Workspace) => (
        <div className="flex items-center gap-3 text-xs text-[var(--text-secondary)]">
          <span>{ws.environments} env{ws.environments !== 1 ? 's' : ''}</span>
          <span className="flex items-center gap-1"><Server className="w-3 h-3" />{ws.services} service{ws.services !== 1 ? 's' : ''}</span>
        </div>
      ),
    },
    ...(isAdmin ? [{
      key: 'actions',
      header: '',
      className: 'w-24',
      render: (ws: Workspace) => (
        <div className="flex items-center gap-0.5 justify-end">
          <IconButton variant={'accent' as const} onClick={(e: React.MouseEvent<HTMLButtonElement>) => { e.stopPropagation(); onEditWorkspace?.(ws.name) }} title="Edit workspace">
            <Pencil className="w-4 h-4" />
          </IconButton>
          <IconButton variant={'danger' as const} onClick={(e: React.MouseEvent<HTMLButtonElement>) => handleDeleteWs(e, ws.name)} title="Delete workspace">
            <Trash2 className="w-4 h-4" />
          </IconButton>
        </div>
      ),
    }] : []),
    {
      key: 'arrow',
      header: '',
      className: 'w-8',
      render: () => <ChevronRight className="w-4 h-4 text-[var(--text-muted)]" />,
    },
  ]

  /* ── Environment columns (list view) ── */
  const envColumns = [
    {
      key: 'name',
      header: 'Name',
      render: (env: StandaloneEnvironment) => (
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0">
            <Globe className="w-4 h-4 text-blue-400" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-medium text-[var(--text-primary)]">{env.name}</div>
            {env.description && <div className="text-xs text-[var(--text-secondary)] mt-0.5 line-clamp-1">{env.description}</div>}
          </div>
        </div>
      ),
    },
    {
      key: 'details',
      header: 'Details',
      className: 'w-48',
      render: (env: StandaloneEnvironment) => (
        <div className="flex items-center gap-1 text-xs text-[var(--text-secondary)]">
          <Server className="w-3 h-3" />{env.services} service{env.services !== 1 ? 's' : ''}
        </div>
      ),
    },
    ...(isAdmin ? [{
      key: 'actions',
      header: '',
      className: 'w-16',
      render: (env: StandaloneEnvironment) => (
        <div className="flex items-center justify-end">
          <IconButton variant={'danger' as const} onClick={(e: React.MouseEvent<HTMLButtonElement>) => handleDeleteEnv(e, env.name)} title="Delete">
            <Trash2 className="w-4 h-4" />
          </IconButton>
        </div>
      ),
    }] : []),
    {
      key: 'arrow',
      header: '',
      className: 'w-8',
      render: () => <ChevronRight className="w-4 h-4 text-[var(--text-muted)]" />,
    },
  ]

  /* ── Service columns (list view) ── */
  const svcColumns = [
    {
      key: 'name',
      header: 'Name',
      render: (svc: StandaloneService) => (
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center shrink-0">
            <Server className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-medium text-[var(--text-primary)]">{svc.name}</div>
            {svc.description && <div className="text-xs text-[var(--text-secondary)] mt-0.5 line-clamp-1">{svc.description}</div>}
          </div>
        </div>
      ),
    },
    {
      key: 'provider',
      header: 'Provider',
      className: 'w-40',
      render: (svc: StandaloneService) => (
        <Badge variant={providerVariant(svc.provider)}>
          <ProviderIcon provider={svc.provider} className="w-3 h-3" />
          {svc.provider}
        </Badge>
      ),
    },
    ...(isAdmin ? [{
      key: 'actions',
      header: '',
      className: 'w-16',
      render: (svc: StandaloneService) => (
        <div className="flex items-center justify-end">
          <IconButton variant={'danger' as const} onClick={(e: React.MouseEvent<HTMLButtonElement>) => handleDeleteSvc(e, svc.name)} title="Delete">
            <Trash2 className="w-4 h-4" />
          </IconButton>
        </div>
      ),
    }] : []),
    {
      key: 'arrow',
      header: '',
      className: 'w-8',
      render: () => <ChevronRight className="w-4 h-4 text-[var(--text-muted)]" />,
    },
  ]

  /* ── Resource columns (list view) ── */
  const resColumns = [
    {
      key: 'name',
      header: 'Name',
      render: (res: AdminResource) => (
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-accent-500/10 flex items-center justify-center shrink-0">
            <img src={KUBERNETES_LOGO} alt="Kubernetes" className="w-5 h-5" />
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
      className: 'w-32',
      render: (res: AdminResource) => (
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent-500/10 text-accent-400 border border-accent-500/20 font-medium">{res.type}</span>
      ),
    },
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
        {stats && statsItems.length > 0 && <StatsGrid items={statsItems} />}

        {/* Workspaces section */}
        {showWs && (
          <Section title="Workspaces" description="Manage grouped environments and services." className="mb-8">
            {workspaces.length > 0 ? (
              layout === 'list' ? (
                <DataTable columns={wsColumns} data={workspaces} keyFn={ws => ws.name} onRowClick={onSelect} />
              ) : (
                <CollectionGrid>
                  {workspaces.map(ws => (
                    <Card key={ws.name} hover padding="lg" onClick={() => onSelect(ws)} className="cursor-pointer text-left group">
                      <div className="flex items-center gap-2 mb-3 w-full">
                        <div className="w-8 h-8 rounded-lg bg-accent-500/10 flex items-center justify-center">
                          <Layers className="w-4 h-4 text-[var(--text-accent)]" />
                        </div>
                        {ws.hierarchy?.name === 'service-first' && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20 font-medium">service-first</span>
                        )}
                      </div>
                      <div className="text-base text-[var(--text-primary)]">{ws.name}</div>
                      <div className="text-xs text-[var(--text-secondary)] mt-1 line-clamp-2">{ws.description}</div>
                      <div className="flex items-center gap-3 mt-4 pt-3 border-t border-[var(--border-subtle)] w-full text-xs text-[var(--text-secondary)]">
                        <span>{ws.environments} env{ws.environments !== 1 ? 's' : ''}</span>
                        <span className="flex items-center gap-1"><Server className="w-3 h-3" />{ws.services}</span>
                        {isAdmin && (
                          <div className="ml-auto flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-all">
                            <IconButton variant="accent" onClick={e => { e.stopPropagation(); onEditWorkspace?.(ws.name) }} title="Edit">
                              <Pencil className="w-3.5 h-3.5" />
                            </IconButton>
                            <IconButton variant="danger" onClick={e => handleDeleteWs(e, ws.name)} title="Delete">
                              <Trash2 className="w-3.5 h-3.5" />
                            </IconButton>
                          </div>
                        )}
                      </div>
                    </Card>
                  ))}
                </CollectionGrid>
              )
            ) : (
              <EmptyState
                icon={<Layers className="w-7 h-7 text-[var(--text-accent)] opacity-60" />}
                iconBg="bg-accent-500/10"
                title="No workspaces yet"
                description="Create a workspace to organize your environments and services."
                action={isAdmin && onCreateWorkspace ? (
                  <Button onClick={onCreateWorkspace}><Plus className="w-3.5 h-3.5" />Create Workspace</Button>
                ) : undefined}
              />
            )}
          </Section>
        )}

        {/* Environments section */}
        {showEnv && (
          <Section title="Environments" description="Standalone environments with their own services." className="mb-8">
            {standaloneEnvs.length > 0 ? (
              layout === 'list' ? (
                <DataTable columns={envColumns} data={standaloneEnvs} keyFn={env => env.name} onRowClick={env => onSelectEnv?.(env)} />
              ) : (
                <CollectionGrid>
                  {standaloneEnvs.map(env => (
                    <Card key={env.name} hover padding="lg" onClick={() => onSelectEnv?.(env)} className="cursor-pointer text-left group">
                      <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center mb-3">
                        <Globe className="w-4 h-4 text-blue-400" />
                      </div>
                      <div className="text-base text-[var(--text-primary)]">{env.name}</div>
                      {env.description && <div className="text-xs text-[var(--text-secondary)] mt-1 line-clamp-2">{env.description}</div>}
                      <div className="flex items-center gap-1.5 mt-4 pt-3 border-t border-[var(--border-subtle)] w-full text-xs text-[var(--text-secondary)]">
                        <Server className="w-3 h-3" />{env.services} service{env.services !== 1 ? 's' : ''}
                        {isAdmin && (
                          <IconButton variant="danger" onClick={e => handleDeleteEnv(e, env.name)} title="Delete" className="ml-auto opacity-0 group-hover:opacity-100">
                            <Trash2 className="w-3.5 h-3.5" />
                          </IconButton>
                        )}
                      </div>
                    </Card>
                  ))}
                </CollectionGrid>
              )
            ) : (
              <EmptyState
                icon={<Globe className="w-7 h-7 text-blue-400 opacity-60" />}
                iconBg="bg-blue-500/10"
                title="No environments"
                description="Create an environment to group services together."
                action={isAdmin && onCreateEnvironment ? (
                  <Button onClick={onCreateEnvironment}><Plus className="w-3.5 h-3.5" />Create Environment</Button>
                ) : undefined}
              />
            )}
          </Section>
        )}

        {/* Services section */}
        {showSvc && (
          <Section title="Services" description="Standalone services with direct connections." className="mb-8">
            {standaloneServices.length > 0 ? (
              layout === 'list' ? (
                <DataTable columns={svcColumns} data={standaloneServices} keyFn={svc => svc.name} onRowClick={svc => onSelectService?.(svc)} />
              ) : (
                <CollectionGrid>
                  {standaloneServices.map(svc => (
                    <Card key={svc.name} hover padding="lg" onClick={() => onSelectService?.(svc)} className="cursor-pointer text-left group">
                      <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center mb-3">
                        <Server className="w-4 h-4 text-emerald-400" />
                      </div>
                      <div className="text-base text-[var(--text-primary)]">{svc.name}</div>
                      {svc.description && <div className="text-xs text-[var(--text-secondary)] mt-1 line-clamp-2">{svc.description}</div>}
                      <div className="flex items-center gap-1.5 mt-4 pt-3 border-t border-[var(--border-subtle)] w-full text-xs text-[var(--text-secondary)]">
                        <Badge variant={providerVariant(svc.provider)} className="text-[10px]"><ProviderIcon provider={svc.provider} className="w-3 h-3" />{svc.provider}</Badge>
                        {isAdmin && (
                          <IconButton variant="danger" onClick={e => handleDeleteSvc(e, svc.name)} title="Delete" className="ml-auto opacity-0 group-hover:opacity-100">
                            <Trash2 className="w-3.5 h-3.5" />
                          </IconButton>
                        )}
                      </div>
                    </Card>
                  ))}
                </CollectionGrid>
              )
            ) : (
              <EmptyState
                icon={<Server className="w-7 h-7 text-emerald-400 opacity-60" />}
                iconBg="bg-emerald-500/10"
                title="No services"
                description="Add a standalone service to start streaming logs."
                action={isAdmin && onCreateService ? (
                  <Button onClick={onCreateService}><Plus className="w-3.5 h-3.5" />Create Service</Button>
                ) : undefined}
              />
            )}
          </Section>
        )}

        {/* Resources section */}
        {resources.length > 0 && (
          <Section title="Resources" description="Connected clusters — browse namespaces and stream logs." className="mb-8">
            {layout === 'list' ? (
              <DataTable columns={resColumns} data={resources} keyFn={res => res.name} onRowClick={res => onSelectResource?.(res.name, res.description || '')} />
            ) : (
              <CollectionGrid>
                {resources.map(res => (
                  <Card key={res.name} hover padding="lg" onClick={() => onSelectResource?.(res.name, res.description || '')} className="cursor-pointer text-left">
                    <div className="w-8 h-8 rounded-lg bg-accent-500/10 flex items-center justify-center mb-3">
                      <img src={KUBERNETES_LOGO} alt="Kubernetes" className="w-5 h-5" />
                    </div>
                    <div className="text-base text-[var(--text-primary)]">{res.name}</div>
                    {res.description && <div className="text-xs text-[var(--text-secondary)] mt-1 line-clamp-2">{res.description}</div>}
                    <div className="flex items-center gap-1.5 mt-4 pt-3 border-t border-[var(--border-subtle)] w-full text-xs text-[var(--text-secondary)]">
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent-500/10 text-accent-400 border border-accent-500/20 font-medium">{res.type}</span>
                    </div>
                  </Card>
                ))}
              </CollectionGrid>
            )}
          </Section>
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
