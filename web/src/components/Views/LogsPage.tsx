import { useState, useEffect, useCallback } from 'react'
import { ChevronDown, ChevronRight, Terminal, LayoutGrid, Rows3, Merge, X, Loader2 } from 'lucide-react'

const KUBERNETES_LOGO = 'https://cdn.jsdelivr.net/gh/selfhst/icons@main/webp/kubernetes.webp'
import { cn } from '../../lib/cn'
import { listWorkspaces, listEnvironments, listServices, listWorkspaceServices, listServiceEnvironments, adminListResources, adminListResourceNamespaces, adminListResourceWorkloads, resourceStreamURL } from '../../lib/api'
import type { ResourceWorkloads } from '../../lib/api'
import type { Workspace, Environment, Service } from '../../lib/types'
import ProviderIcon from '../ui/ProviderIcon'
import SourceDot from '../ui/SourceDot'
import LogPanel from '../LogConsole/LogPanel'
import MergedLogPanel from '../LogConsole/MergedLogPanel'

export interface LogSession {
  id: string
  workspace: string
  environment: string
  service: string
  label: string
  streamUrl?: string
}

interface TreeWorkspace {
  data: Workspace
  expanded: boolean
  isServiceFirst: boolean
  environments: TreeEnv[]
  sfServices: TreeSfService[]
}

interface TreeEnv {
  data: Environment
  expanded: boolean
  services: Service[]
  workspaceName: string
}

interface TreeSfService {
  name: string
  friendlyName: string
  provider: string
  expanded: boolean
  environments: TreeSfEnv[]
  workspaceName: string
}

interface TreeSfEnv {
  name: string
  targets: number
}

interface TreeResource {
  name: string
  description: string
  expanded: boolean
  loading: boolean
  namespaces: TreeResourceNs[]
}

interface TreeResourceNs {
  name: string
  expanded: boolean
  loading: boolean
  workloads: { name: string; kind: string; kindLabel: string }[]
}

type LayoutMode = 'grid' | 'tabs' | 'merged'

const LIMITS: Record<LayoutMode, number> = { grid: 6, tabs: 10, merged: 10 }

export default function LogsPage({ onBack: _onBack, userRole, userScope, serverMode, logBufferLines }: { onBack: () => void; userRole?: string; userScope?: string[]; serverMode?: boolean; logBufferLines?: number }) {
  const [sessions, setSessions] = useState<LogSession[]>([])
  const [tree, setTree] = useState<TreeWorkspace[]>([])
  const [resourceTree, setResourceTree] = useState<TreeResource[]>([])
  const [loading, setLoading] = useState(true)
  const [layout, setLayout] = useState<LayoutMode>(() =>
    (localStorage.getItem('avalok-logs-layout') as LayoutMode) || 'grid'
  )
  const [activeTab, setActiveTab] = useState<string | null>(null)
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const stored = localStorage.getItem('avalok-logs-sidebar-w')
    return stored ? parseInt(stored, 10) : 260
  })
  const isAdmin = serverMode && userRole === 'admin'
  const hasResourceScope = isAdmin || (userScope || []).some(s => s.startsWith('res:'))

  useEffect(() => {
    loadTree()
    if (hasResourceScope) loadResources()
  }, [])

  useEffect(() => {
    if (sessions.length > 0 && (!activeTab || !sessions.some(s => s.id === activeTab))) {
      setActiveTab(sessions[0].id)
    }
    if (sessions.length === 0) setActiveTab(null)
  }, [sessions, activeTab])

  async function loadTree() {
    try {
      const workspaces = await listWorkspaces()
      const nodes: TreeWorkspace[] = []
      for (const ws of workspaces) {
        const isServiceFirst = ws.hierarchy?.name === 'service-first'

        if (isServiceFirst) {
          const wsSvcs = await listWorkspaceServices(ws.name)
          const sfServices: TreeSfService[] = []
          for (const svc of wsSvcs) {
            const svcEnvs = await listServiceEnvironments(ws.name, svc.name)
            sfServices.push({
              name: svc.name,
              friendlyName: svc.friendly_name || svc.name,
              provider: svc.provider,
              expanded: false,
              environments: svcEnvs.map(e => ({ name: e.name, targets: e.targets })),
              workspaceName: ws.name,
            })
          }
          nodes.push({ data: ws, expanded: nodes.length === 0, isServiceFirst: true, environments: [], sfServices })
        } else {
          const envs = await listEnvironments(ws.name)
          const envNodes: TreeEnv[] = []
          for (const env of envs) {
            const services = await listServices(ws.name, env.name)
            envNodes.push({ data: env, expanded: false, services, workspaceName: ws.name })
          }
          nodes.push({ data: ws, expanded: nodes.length === 0, isServiceFirst: false, environments: envNodes, sfServices: [] })
        }
      }
      setTree(nodes)
    } catch (err) {
      console.error('Failed to load tree:', err)
    } finally {
      setLoading(false)
    }
  }

  function toggleWorkspace(wsIdx: number) {
    setTree(prev => prev.map((node, i) =>
      i === wsIdx ? { ...node, expanded: !node.expanded } : node
    ))
  }

  function toggleEnv(wsIdx: number, envIdx: number) {
    setTree(prev => prev.map((node, i) =>
      i === wsIdx ? {
        ...node,
        environments: node.environments.map((envNode, j) =>
          j === envIdx ? { ...envNode, expanded: !envNode.expanded } : envNode
        )
      } : node
    ))
  }

  function toggleSfService(wsIdx: number, svcIdx: number) {
    setTree(prev => prev.map((node, i) =>
      i === wsIdx ? {
        ...node,
        sfServices: node.sfServices.map((svcNode, j) =>
          j === svcIdx ? { ...svcNode, expanded: !svcNode.expanded } : svcNode
        )
      } : node
    ))
  }

  async function loadResources() {
    try {
      const resources = await adminListResources()
      setResourceTree((resources || []).map(r => ({
        name: r.name,
        description: r.description || '',
        expanded: false,
        loading: false,
        namespaces: [],
      })))
    } catch { /* ignore */ }
  }

  async function toggleResource(idx: number) {
    setResourceTree(prev => {
      const node = prev[idx]
      if (node.expanded) {
        return prev.map((n, i) => i === idx ? { ...n, expanded: false } : n)
      }
      if (node.namespaces.length > 0) {
        return prev.map((n, i) => i === idx ? { ...n, expanded: true } : n)
      }
      return prev.map((n, i) => i === idx ? { ...n, expanded: true, loading: true } : n)
    })
    const node = resourceTree[idx]
    if (!node.expanded && node.namespaces.length === 0) {
      try {
        const nsList = await adminListResourceNamespaces(node.name)
        setResourceTree(prev => prev.map((n, i) => i === idx ? {
          ...n, loading: false,
          namespaces: (nsList || []).map(ns => ({ name: ns.name, expanded: false, loading: false, workloads: [] })),
        } : n))
      } catch {
        setResourceTree(prev => prev.map((n, i) => i === idx ? { ...n, loading: false } : n))
      }
    }
  }

  async function toggleResourceNs(resIdx: number, nsIdx: number) {
    setResourceTree(prev => prev.map((r, ri) => ri !== resIdx ? r : {
      ...r,
      namespaces: r.namespaces.map((ns, ni) => {
        if (ni !== nsIdx) return ns
        if (ns.expanded) return { ...ns, expanded: false }
        if (ns.workloads.length > 0) return { ...ns, expanded: true }
        return { ...ns, expanded: true, loading: true }
      }),
    }))
    const nsNode = resourceTree[resIdx]?.namespaces[nsIdx]
    if (nsNode && !nsNode.expanded && nsNode.workloads.length === 0) {
      try {
        const data: ResourceWorkloads = await adminListResourceWorkloads(resourceTree[resIdx].name, nsNode.name)
        const workloads = [
          ...(data.deployments || []).map(d => ({ name: d.name, kind: 'deployment', kindLabel: 'Deploy' })),
          ...(data.statefulsets || []).map(s => ({ name: s.name, kind: 'statefulset', kindLabel: 'STS' })),
          ...(data.daemonsets || []).map(d => ({ name: d.name, kind: 'daemonset', kindLabel: 'DS' })),
        ]
        setResourceTree(prev => prev.map((r, ri) => ri !== resIdx ? r : {
          ...r,
          namespaces: r.namespaces.map((ns, ni) => ni !== nsIdx ? ns : { ...ns, loading: false, workloads }),
        }))
      } catch {
        setResourceTree(prev => prev.map((r, ri) => ri !== resIdx ? r : {
          ...r,
          namespaces: r.namespaces.map((ns, ni) => ni !== nsIdx ? ns : { ...ns, loading: false }),
        }))
      }
    }
  }

  const maxForLayout = LIMITS[layout]

  const addSession = useCallback((wsName: string, envName: string, svcName: string, label: string, streamUrl?: string) => {
    const id = streamUrl ? `res:${wsName}/${envName}/${svcName}` : `${wsName}/${envName}/${svcName}`
    setSessions(prev => {
      if (prev.some(s => s.id === id)) return prev
      if (prev.length >= LIMITS[layout]) return prev
      return [...prev, { id, workspace: wsName, environment: envName, service: svcName, label, streamUrl }]
    })
    setActiveTab(id)
  }, [layout])

  const removeSession = useCallback((id: string) => {
    setSessions(prev => prev.filter(s => s.id !== id))
  }, [])

  function changeLayout(mode: LayoutMode) {
    setLayout(mode)
    localStorage.setItem('avalok-logs-layout', mode)
    const limit = LIMITS[mode]
    setSessions(prev => prev.length > limit ? prev.slice(0, limit) : prev)
  }

  function handleResize(e: React.MouseEvent) {
    e.preventDefault()
    const startX = e.clientX
    const startW = sidebarWidth
    function onMove(ev: MouseEvent) {
      const w = Math.max(200, Math.min(400, startW + ev.clientX - startX))
      setSidebarWidth(w)
    }
    function onUp() {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      localStorage.setItem('avalok-logs-sidebar-w', String(sidebarWidth))
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  const gridClass = (() => {
    const n = sessions.length
    if (n <= 3) return 'grid-cols-1'
    if (n <= 4) return 'grid-cols-2 grid-rows-2'
    return 'grid-cols-3 grid-rows-2'
  })()

  const activeIds = new Set(sessions.map(s => s.id))

  return (
    <div className="flex h-full overflow-hidden">
      {/* Sidebar */}
      <div className="shrink-0 flex flex-col h-full bg-[var(--bg-surface)] border-r border-[var(--border-default)]" style={{ width: sidebarWidth }}>
        {/* Sidebar header with layout toggle */}
        <div className="shrink-0 px-3 py-2.5 border-b border-[var(--border-default)]">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wider">Services</span>
            <span className="text-[10px] text-[var(--text-muted)]">{sessions.length}/{maxForLayout}</span>
          </div>
          {/* Layout mode toggle */}
          <div className="flex items-center bg-[var(--bg-elevated)] rounded-lg p-0.5 border border-[var(--border-subtle)]">
            <button
              onClick={() => changeLayout('grid')}
              className={cn(
                'flex-1 flex items-center justify-center gap-1 px-2 py-1 rounded-md text-[10px] transition-all',
                layout === 'grid'
                  ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-sm font-medium'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
              )}
              title="Grid: split view with up to 6 panels"
            >
              <LayoutGrid className="w-3 h-3" />
              Grid
            </button>
            <button
              onClick={() => changeLayout('tabs')}
              className={cn(
                'flex-1 flex items-center justify-center gap-1 px-2 py-1 rounded-md text-[10px] transition-all',
                layout === 'tabs'
                  ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-sm font-medium'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
              )}
              title="Tabs: one panel at a time, browser-style tabs"
            >
              <Rows3 className="w-3 h-3" />
              Tabs
            </button>
            <button
              onClick={() => changeLayout('merged')}
              className={cn(
                'flex-1 flex items-center justify-center gap-1 px-2 py-1 rounded-md text-[10px] transition-all',
                layout === 'merged'
                  ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-sm font-medium'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
              )}
              title="Merged: all logs in a single combined stream"
            >
              <Merge className="w-3 h-3" />
              Merged
            </button>
          </div>
        </div>

        {/* Tree */}
        <div className="flex-1 overflow-y-auto py-1 text-[13px] select-none">
          {loading && (
            <div className="px-4 py-3 text-xs text-[var(--text-muted)]">Loading...</div>
          )}

          {tree.map((wsNode, wsIdx) => (
            <div key={wsNode.data.name}>
              <button
                onClick={() => toggleWorkspace(wsIdx)}
                className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-[var(--bg-hover)] transition-colors"
              >
                {wsNode.expanded
                  ? <ChevronDown className="w-3 h-3 text-[var(--text-muted)] shrink-0" />
                  : <ChevronRight className="w-3 h-3 text-[var(--text-muted)] shrink-0" />
                }
                <span className="text-[var(--text-primary)] font-medium text-xs">{wsNode.data.name}</span>
              </button>

              {wsNode.expanded && wsNode.isServiceFirst && wsNode.sfServices.map((svcNode, svcIdx) => (
                <div key={svcNode.name}>
                  <button
                    onClick={() => toggleSfService(wsIdx, svcIdx)}
                    className="w-full flex items-center gap-1.5 pl-6 pr-3 py-1.5 text-left hover:bg-[var(--bg-hover)] transition-colors"
                  >
                    {svcNode.expanded
                      ? <ChevronDown className="w-3 h-3 text-[var(--text-muted)] shrink-0" />
                      : <ChevronRight className="w-3 h-3 text-[var(--text-muted)] shrink-0" />
                    }
                    <ProviderIcon provider={svcNode.provider} className="w-3 h-3 text-[var(--text-muted)] shrink-0" />
                    <span className="text-[var(--text-secondary)] font-medium text-xs">{svcNode.friendlyName}</span>
                  </button>

                  {svcNode.expanded && svcNode.environments.map(env => {
                    const id = `${svcNode.workspaceName}/${env.name}/${svcNode.name}`
                    const isActive = activeIds.has(id)
                    const isFull = sessions.length >= maxForLayout

                    return (
                      <button
                        key={env.name}
                        onClick={() => isActive ? removeSession(id) : addSession(svcNode.workspaceName, env.name, svcNode.name, svcNode.friendlyName)}
                        disabled={!isActive && isFull}
                        className={cn(
                          'w-full flex items-center gap-2 pl-10 pr-3 py-1.5 text-left transition-colors',
                          isActive
                            ? 'bg-[var(--bg-active)] text-[var(--text-accent)]'
                            : isFull
                              ? 'text-[var(--text-muted)] cursor-not-allowed opacity-50'
                              : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
                        )}
                      >
                        <SourceDot name={id} />
                        <span className="flex-1 truncate text-xs">{env.name}</span>
                        {isActive && (
                          <Terminal className="w-3 h-3 shrink-0 text-[var(--text-accent)]" />
                        )}
                      </button>
                    )
                  })}
                </div>
              ))}

              {wsNode.expanded && !wsNode.isServiceFirst && wsNode.environments.map((envNode, envIdx) => (
                <div key={envNode.data.name}>
                  <button
                    onClick={() => toggleEnv(wsIdx, envIdx)}
                    className="w-full flex items-center gap-1.5 pl-6 pr-3 py-1.5 text-left hover:bg-[var(--bg-hover)] transition-colors"
                  >
                    {envNode.expanded
                      ? <ChevronDown className="w-3 h-3 text-[var(--text-muted)] shrink-0" />
                      : <ChevronRight className="w-3 h-3 text-[var(--text-muted)] shrink-0" />
                    }
                    <span className="text-[var(--text-secondary)] font-medium text-xs">{envNode.data.name}</span>
                  </button>

                  {envNode.expanded && envNode.services.map(svc => {
                    const id = `${wsNode.data.name}/${envNode.data.name}/${svc.name}`
                    const isActive = activeIds.has(id)
                    const isFull = sessions.length >= maxForLayout

                    return (
                      <button
                        key={svc.name}
                        onClick={() => isActive ? removeSession(id) : addSession(wsNode.data.name, envNode.data.name, svc.name, svc.friendly_name || svc.name)}
                        disabled={!isActive && isFull}
                        className={cn(
                          'w-full flex items-center gap-2 pl-10 pr-3 py-1.5 text-left transition-colors',
                          isActive
                            ? 'bg-[var(--bg-active)] text-[var(--text-accent)]'
                            : isFull
                              ? 'text-[var(--text-muted)] cursor-not-allowed opacity-50'
                              : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
                        )}
                      >
                        <SourceDot name={id} />
                        <ProviderIcon
                          provider={svc.provider}
                          className={cn('w-3 h-3 shrink-0', isActive ? 'text-[var(--text-accent)]' : 'text-[var(--text-muted)]')}
                        />
                        <span className="flex-1 truncate text-xs">{svc.friendly_name || svc.name}</span>
                        {isActive && (
                          <Terminal className="w-3 h-3 shrink-0 text-[var(--text-accent)]" />
                        )}
                      </button>
                    )
                  })}
                </div>
              ))}
            </div>
          ))}

          {/* Resources section */}
          {hasResourceScope && resourceTree.length > 0 && (
            <>
              <div className="px-3 pt-3 pb-1">
                <span className="text-[10px] font-medium text-[var(--text-muted)] uppercase tracking-wider">Resources</span>
              </div>
              {resourceTree.map((resNode, resIdx) => (
                <div key={resNode.name}>
                  <button
                    onClick={() => toggleResource(resIdx)}
                    className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-[var(--bg-hover)] transition-colors"
                  >
                    {resNode.loading
                      ? <Loader2 className="w-3 h-3 text-[var(--text-muted)] shrink-0 animate-spin" />
                      : resNode.expanded
                        ? <ChevronDown className="w-3 h-3 text-[var(--text-muted)] shrink-0" />
                        : <ChevronRight className="w-3 h-3 text-[var(--text-muted)] shrink-0" />
                    }
                    <img src={KUBERNETES_LOGO} alt="Kubernetes" className="w-3.5 h-3.5 shrink-0" />
                    <span className="text-[var(--text-primary)] font-medium text-xs truncate">{resNode.name}</span>
                  </button>

                  {resNode.expanded && resNode.namespaces.map((nsNode, nsIdx) => (
                    <div key={nsNode.name}>
                      <button
                        onClick={() => toggleResourceNs(resIdx, nsIdx)}
                        className="w-full flex items-center gap-1.5 pl-6 pr-3 py-1.5 text-left hover:bg-[var(--bg-hover)] transition-colors"
                      >
                        {nsNode.loading
                          ? <Loader2 className="w-3 h-3 text-[var(--text-muted)] shrink-0 animate-spin" />
                          : nsNode.expanded
                            ? <ChevronDown className="w-3 h-3 text-[var(--text-muted)] shrink-0" />
                            : <ChevronRight className="w-3 h-3 text-[var(--text-muted)] shrink-0" />
                        }
                        <span className="text-[var(--text-secondary)] font-medium text-xs truncate">{nsNode.name}</span>
                      </button>

                      {nsNode.expanded && nsNode.workloads.map(wl => {
                        const url = resourceStreamURL(resNode.name, nsNode.name, wl.kind, wl.name)
                        const id = `res:${resNode.name}/${nsNode.name}/${wl.name}`
                        const isActive = activeIds.has(id)
                        const isFull = sessions.length >= maxForLayout

                        return (
                          <button
                            key={`${wl.kind}:${wl.name}`}
                            onClick={() => isActive ? removeSession(id) : addSession(resNode.name, nsNode.name, wl.name, wl.name, url)}
                            disabled={!isActive && isFull}
                            className={cn(
                              'w-full flex items-center gap-2 pl-10 pr-3 py-1.5 text-left transition-colors',
                              isActive
                                ? 'bg-[var(--bg-active)] text-[var(--text-accent)]'
                                : isFull
                                  ? 'text-[var(--text-muted)] cursor-not-allowed opacity-50'
                                  : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
                            )}
                          >
                            <SourceDot name={id} />
                            <span className="flex-1 truncate text-xs">{wl.name}</span>
                            <span className={cn(
                              'text-[9px] px-1 rounded shrink-0',
                              isActive ? 'text-[var(--text-accent)]' : 'text-[var(--text-muted)]'
                            )}>{wl.kindLabel}</span>
                            {isActive && (
                              <Terminal className="w-3 h-3 shrink-0 text-[var(--text-accent)]" />
                            )}
                          </button>
                        )
                      })}
                    </div>
                  ))}
                </div>
              ))}
            </>
          )}
        </div>
      </div>

      {/* Resize handle */}
      <div
        className="w-px shrink-0 cursor-col-resize bg-[var(--border-default)] hover:bg-[var(--text-accent)] active:bg-[var(--text-accent)] transition-colors"
        onMouseDown={handleResize}
      />

      {/* Main content area */}
      <div className="flex-1 min-w-0 overflow-hidden flex flex-col">
        {sessions.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center gap-3 text-[var(--text-muted)]">
            <Terminal className="w-10 h-10 opacity-30" />
            <p className="text-sm">Select services from the sidebar to open log panels</p>
            <p className="text-xs">Up to {maxForLayout} panels in {layout} mode</p>
          </div>
        ) : layout === 'grid' ? (
          /* ── Grid Mode ── */
          <div className={cn('grid gap-2 h-full p-2', gridClass)}>
            {sessions.map(session => (
              <LogPanel
                key={session.id}
                panelId={session.id}
                workspace={session.workspace}
                environment={session.environment}
                service={session.service}
                label={session.label}
                streamUrl={session.streamUrl}
                onClose={() => removeSession(session.id)}
                maxLines={logBufferLines}
              />
            ))}
          </div>
        ) : layout === 'tabs' ? (
          /* ── Tabs Mode ── */
          <div className="flex flex-col h-full">
            {/* Tab bar */}
            <div className="shrink-0 flex items-end gap-0 px-2 pt-2 bg-[var(--bg-app)] border-b border-[var(--border-default)] overflow-x-auto">
              {sessions.map(session => (
                <button
                  key={session.id}
                  onClick={() => setActiveTab(session.id)}
                  className={cn(
                    'group flex items-center gap-2 px-4 py-2 text-xs border border-b-0 rounded-t-lg transition-colors relative',
                    activeTab === session.id
                      ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] border-[var(--border-default)] font-medium -mb-px z-10'
                      : 'bg-[var(--bg-elevated)] text-[var(--text-secondary)] border-transparent hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'
                  )}
                >
                  <SourceDot name={session.id} />
                  <span className="truncate max-w-[120px]">{session.label}</span>
                  <span className="text-[10px] text-[var(--text-muted)] truncate max-w-[80px]">{session.environment}</span>
                  <span
                    onClick={(e) => { e.stopPropagation(); removeSession(session.id) }}
                    className="p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-[var(--bg-hover)] hover:text-red-400 transition-all cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                  </span>
                </button>
              ))}
            </div>

            {/* Active panel */}
            <div className="flex-1 min-h-0 p-2">
              {sessions.filter(s => s.id === activeTab).map(session => (
                <div key={session.id} className="h-full">
                  <LogPanel
                    panelId={session.id}
                    workspace={session.workspace}
                    environment={session.environment}
                    service={session.service}
                    label={session.label}
                    streamUrl={session.streamUrl}
                    onClose={() => removeSession(session.id)}
                    maxLines={logBufferLines}
                  />
                </div>
              ))}
            </div>
          </div>
        ) : (
          /* ── Merged Mode ── */
          <div className="h-full p-2">
            <MergedLogPanel sessions={sessions} maxLines={logBufferLines} />
          </div>
        )}
      </div>
    </div>
  )
}
