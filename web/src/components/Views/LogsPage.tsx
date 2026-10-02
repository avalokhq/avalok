import { useState, useEffect, useCallback, useRef } from 'react'
import { Terminal, LayoutGrid, Rows3, Merge, X, Loader2, Folder, FileText } from 'lucide-react'

import { cn } from '../../lib/cn'
import { listWorkspaces, listEnvironments, listServices, listWorkspaceServices, listServiceEnvironments, adminListResources, adminListResourceNamespaces, adminListResourceWorkloads, resourceStreamURL, adminListStorageDirectory, storageObjectStreamURL, listServiceStorageObjects, serviceStorageStreamURL, fetchConfig, listStandaloneEnvs, listStandaloneEnvServices, standaloneEnvStreamURL, listStandaloneServices, standaloneServiceStreamURL } from '../../lib/api'
import type { ResourceWorkloads } from '../../lib/api'
import type { Workspace, Environment, Service, StandaloneService } from '../../lib/types'
import ProviderIcon from '../ui/ProviderIcon'
import SourceDot from '../ui/SourceDot'
import TreeItem from '../ui/TreeItem'
import IconButton from '../ui/IconButton'
import ResizeHandle from '../ui/ResizeHandle'
import EmptyState from '../ui/EmptyState'
import SegmentedControl from '../ui/SegmentedControl'
import LogPanel from '../LogConsole/LogPanel'
import MergedLogPanel from '../LogConsole/MergedLogPanel'

export interface LogSession {
  id: string
  workspace: string
  environment: string
  service: string
  label: string
  streamUrl?: string
  resourceName?: string
  objectKey?: string
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

/** Standalone environment (outside any workspace); services load on first expand. */
interface TreeStandaloneEnv {
  name: string
  expanded: boolean
  loading: boolean
  services: Service[] | null
}

interface TreeStorageNode {
  name: string
  path: string
  isDirectory: boolean
  expanded: boolean
  loading: boolean
  children: TreeStorageNode[]
}

interface TreeResource {
  name: string
  type: string
  description: string
  expanded: boolean
  loading: boolean
  namespaces: TreeResourceNs[]
  storageTree: TreeStorageNode[]
}

interface TreeResourceNs {
  name: string
  expanded: boolean
  loading: boolean
  workloads: { name: string; kind: string; kindLabel: string }[]
}

type LayoutMode = 'grid' | 'tabs' | 'merged'

const LIMITS: Record<LayoutMode, number> = { grid: 6, tabs: 10, merged: 10 }

const LAYOUT_OPTIONS = [
  { value: 'grid' as const, label: 'Grid', icon: <LayoutGrid />, title: 'Grid: split view with up to 6 panes' },
  { value: 'tabs' as const, label: 'Tabs', icon: <Rows3 />, title: 'Tabs: one pane at a time' },
  { value: 'merged' as const, label: 'Merged', icon: <Merge />, title: 'Merged: all sources in one stream' },
]

const SIDEBAR_MIN = 200
const SIDEBAR_MAX = 480

const spinner = <Loader2 className="size-3.5 shrink-0 animate-spin text-fg-muted" />

/** Leaf row that opens or closes a log pane. */
function SourceRow({ id, label, depth, icon, meta, active, full, onToggle }: {
  id: string
  label: string
  depth: number
  icon?: React.ReactNode
  meta?: string
  active: boolean
  full: boolean
  onToggle: () => void
}) {
  const blocked = !active && full
  return (
    <TreeItem
      depth={depth}
      label={label}
      title={blocked ? 'Pane limit reached for this layout' : active ? `Close ${label}` : `Open ${label}`}
      icon={<span className="flex items-center gap-1.5"><SourceDot name={id} />{icon}</span>}
      selected={active}
      onSelect={blocked ? undefined : onToggle}
      className={cn(blocked && 'cursor-not-allowed opacity-50 hover:bg-transparent')}
      status={
        <>
          {meta && <span className="shrink-0 text-2xs text-fg-muted">{meta}</span>}
          {active && <Terminal className="size-3.5 shrink-0 text-accent" />}
        </>
      }
    />
  )
}

function StorageTreeNodes({ nodes, resName, resIdx, depth, parentPath, activeIds, isFull, onToggleDir, onSelect }: {
  nodes: TreeStorageNode[]
  resName: string
  resIdx: number
  depth: number
  parentPath: number[]
  activeIds: Set<string>
  isFull: boolean
  onToggleDir: (resIdx: number, path: string[]) => void
  onSelect: (key: string, name: string) => void
}) {
  return (
    <>
      {nodes.map((node, nodeIdx) => {
        const currentPath = [...parentPath, nodeIdx]
        const pathKey = currentPath.join('.')

        if (node.isDirectory) {
          return (
            <div key={pathKey}>
              <TreeItem
                depth={depth}
                label={node.name}
                icon={<Folder />}
                expanded={node.expanded}
                onToggle={() => onToggleDir(resIdx, currentPath.map(String))}
                status={node.loading ? spinner : undefined}
              />
              {node.expanded && node.children.length > 0 && (
                <StorageTreeNodes
                  nodes={node.children}
                  resName={resName}
                  resIdx={resIdx}
                  depth={depth + 1}
                  parentPath={currentPath}
                  activeIds={activeIds}
                  isFull={isFull}
                  onToggleDir={onToggleDir}
                  onSelect={onSelect}
                />
              )}
            </div>
          )
        }

        const id = `res:${resName}/obj/${node.path}`
        return (
          <SourceRow
            key={pathKey}
            id={id}
            label={node.name}
            depth={depth}
            icon={<FileText />}
            active={activeIds.has(id)}
            full={isFull}
            onToggle={() => onSelect(node.path, node.name)}
          />
        )
      })}
    </>
  )
}

export default function LogsPage({ onBack: _onBack, userRole, userScope, serverMode, logBufferLines }: { onBack: () => void; userRole?: string; userScope?: string[]; serverMode?: boolean; logBufferLines?: number }) {
  const [sessions, setSessions] = useState<LogSession[]>([])
  const [tree, setTree] = useState<TreeWorkspace[]>([])
  const [resourceTree, setResourceTree] = useState<TreeResource[]>([])
  const [svcStorageTrees, setSvcStorageTrees] = useState<Record<string, { expanded: boolean; loading: boolean; tree: TreeStorageNode[] }>>({})
  const [loading, setLoading] = useState(true)
  // Standalone environments and services appear only when enabled in Settings (off by default).
  const [standaloneEnvs, setStandaloneEnvs] = useState<TreeStandaloneEnv[]>([])
  const [standaloneSvcs, setStandaloneSvcs] = useState<StandaloneService[]>([])
  const [layout, setLayout] = useState<LayoutMode>(() =>
    (localStorage.getItem('avalok-logs-layout') as LayoutMode) || 'grid'
  )
  const [activeTab, setActiveTab] = useState<string | null>(null)
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const stored = localStorage.getItem('avalok-logs-sidebar-w')
    return stored ? parseInt(stored, 10) : 260
  })
  const isAdmin = serverMode && userRole === 'admin'
  const hasResourceScope = isAdmin || (userScope || []).some(s => s === '*' || s.startsWith('res:'))

  useEffect(() => {
    loadTree()
    loadStandalone()
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

  async function loadStandalone() {
    try {
      const config = await fetchConfig()
      const [envs, svcs] = await Promise.all([
        config.enable_environments ? listStandaloneEnvs().catch(() => []) : [],
        config.enable_services ? listStandaloneServices().catch(() => []) : [],
      ])
      setStandaloneEnvs((envs || []).map(e => ({ name: e.name, expanded: false, loading: false, services: null })))
      setStandaloneSvcs(svcs || [])
    } catch { /* config unavailable: keep workspaces only */ }
  }

  async function toggleStandaloneEnv(name: string) {
    const node = standaloneEnvs.find(e => e.name === name)
    if (!node) return
    const patch = (p: Partial<TreeStandaloneEnv>) => setStandaloneEnvs(prev => prev.map(e => e.name === name ? { ...e, ...p } : e))
    if (node.expanded || node.services) {
      patch({ expanded: !node.expanded })
      return
    }
    patch({ expanded: true, loading: true })
    try {
      patch({ loading: false, services: await listStandaloneEnvServices(name) })
    } catch {
      patch({ loading: false, services: [] })
    }
  }

  async function loadResources() {
    try {
      const resources = await adminListResources()
      setResourceTree((resources || []).map(r => ({
        name: r.name,
        type: r.type,
        description: r.description || '',
        expanded: false,
        loading: false,
        namespaces: [],
        storageTree: [],
      })))
    } catch { /* ignore */ }
  }

  function isCloudType(type: string) {
    return type === 's3' || type === 'azure-blob' || type === 'azure-file' || type === 'gcs'
  }

  async function toggleResource(idx: number) {
    const node = resourceTree[idx]
    setResourceTree(prev => {
      const n = prev[idx]
      if (n.expanded) {
        return prev.map((x, i) => i === idx ? { ...x, expanded: false } : x)
      }
      const hasChildren = isCloudType(n.type) ? n.storageTree.length > 0 : n.namespaces.length > 0
      if (hasChildren) {
        return prev.map((x, i) => i === idx ? { ...x, expanded: true } : x)
      }
      return prev.map((x, i) => i === idx ? { ...x, expanded: true, loading: true } : x)
    })
    const hasChildren = isCloudType(node.type) ? node.storageTree.length > 0 : node.namespaces.length > 0
    if (!node.expanded && !hasChildren) {
      try {
        if (isCloudType(node.type)) {
          const result = await adminListStorageDirectory(node.name)
          const children: TreeStorageNode[] = [
            ...(result.directories || []).map(d => ({
              name: d.name, path: d.path, isDirectory: true, expanded: false, loading: false, children: [],
            })),
            ...(result.objects || []).map(o => ({
              name: o.name, path: o.key, isDirectory: false, expanded: false, loading: false, children: [],
            })),
          ]
          setResourceTree(prev => prev.map((n, i) => i === idx ? {
            ...n, loading: false, storageTree: children,
          } : n))
        } else {
          const nsList = await adminListResourceNamespaces(node.name)
          setResourceTree(prev => prev.map((n, i) => i === idx ? {
            ...n, loading: false,
            namespaces: (nsList || []).map(ns => ({ name: ns.name, expanded: false, loading: false, workloads: [] })),
          } : n))
        }
      } catch {
        setResourceTree(prev => prev.map((n, i) => i === idx ? { ...n, loading: false } : n))
      }
    }
  }

  async function toggleStorageDir(resIdx: number, nodePath: string[]) {
    const resNode = resourceTree[resIdx]
    if (!resNode) return

    function findNode(nodes: TreeStorageNode[], path: number[]): TreeStorageNode | null {
      if (path.length === 0) return null
      const node = nodes[path[0]]
      if (!node) return null
      if (path.length === 1) return node
      return findNode(node.children, path.slice(1))
    }

    function updateNode(nodes: TreeStorageNode[], path: number[], updater: (n: TreeStorageNode) => TreeStorageNode): TreeStorageNode[] {
      return nodes.map((n, i) => {
        if (i !== path[0]) return n
        if (path.length === 1) return updater(n)
        return { ...n, children: updateNode(n.children, path.slice(1), updater) }
      })
    }

    const indices = nodePath.map(Number)
    const node = findNode(resNode.storageTree, indices)
    if (!node || !node.isDirectory) return

    if (node.expanded) {
      setResourceTree(prev => prev.map((r, ri) => ri !== resIdx ? r : {
        ...r, storageTree: updateNode(r.storageTree, indices, n => ({ ...n, expanded: false })),
      }))
      return
    }

    if (node.children.length > 0) {
      setResourceTree(prev => prev.map((r, ri) => ri !== resIdx ? r : {
        ...r, storageTree: updateNode(r.storageTree, indices, n => ({ ...n, expanded: true })),
      }))
      return
    }

    setResourceTree(prev => prev.map((r, ri) => ri !== resIdx ? r : {
      ...r, storageTree: updateNode(r.storageTree, indices, n => ({ ...n, expanded: true, loading: true })),
    }))

    try {
      const result = await adminListStorageDirectory(resNode.name, node.path)
      const children: TreeStorageNode[] = [
        ...(result.directories || []).map(d => ({
          name: d.name, path: d.path, isDirectory: true, expanded: false, loading: false, children: [],
        })),
        ...(result.objects || []).map(o => ({
          name: o.name, path: o.key, isDirectory: false, expanded: false, loading: false, children: [],
        })),
      ]
      setResourceTree(prev => prev.map((r, ri) => ri !== resIdx ? r : {
        ...r, storageTree: updateNode(r.storageTree, indices, n => ({ ...n, loading: false, children })),
      }))
    } catch {
      setResourceTree(prev => prev.map((r, ri) => ri !== resIdx ? r : {
        ...r, storageTree: updateNode(r.storageTree, indices, n => ({ ...n, loading: false })),
      }))
    }
  }

  async function toggleServiceStorage(wsName: string, svcName: string) {
    const key = `${wsName}/${svcName}`
    const current = svcStorageTrees[key]

    if (current?.expanded) {
      setSvcStorageTrees(prev => ({ ...prev, [key]: { ...prev[key], expanded: false } }))
      return
    }

    if (current?.tree.length) {
      setSvcStorageTrees(prev => ({ ...prev, [key]: { ...prev[key], expanded: true } }))
      return
    }

    setSvcStorageTrees(prev => ({ ...prev, [key]: { expanded: true, loading: true, tree: [] } }))
    try {
      const result = await listServiceStorageObjects(wsName, svcName)
      const children: TreeStorageNode[] = [
        ...(result.directories || []).map(d => ({
          name: d.name, path: d.path, isDirectory: true, expanded: false, loading: false, children: [],
        })),
        ...(result.objects || []).map(o => ({
          name: o.name, path: o.key, isDirectory: false, expanded: false, loading: false, children: [],
        })),
      ]
      setSvcStorageTrees(prev => ({ ...prev, [key]: { expanded: true, loading: false, tree: children } }))
    } catch {
      setSvcStorageTrees(prev => ({ ...prev, [key]: { expanded: true, loading: false, tree: [] } }))
    }
  }

  async function toggleServiceStorageDir(wsName: string, svcName: string, nodePath: string[]) {
    const key = `${wsName}/${svcName}`
    const state = svcStorageTrees[key]
    if (!state) return

    function findNode(nodes: TreeStorageNode[], path: number[]): TreeStorageNode | null {
      if (path.length === 0) return null
      const node = nodes[path[0]]
      if (!node) return null
      if (path.length === 1) return node
      return findNode(node.children, path.slice(1))
    }

    function updateNode(nodes: TreeStorageNode[], path: number[], updater: (n: TreeStorageNode) => TreeStorageNode): TreeStorageNode[] {
      return nodes.map((n, i) => {
        if (i !== path[0]) return n
        if (path.length === 1) return updater(n)
        return { ...n, children: updateNode(n.children, path.slice(1), updater) }
      })
    }

    const indices = nodePath.map(Number)
    const node = findNode(state.tree, indices)
    if (!node || !node.isDirectory) return

    if (node.expanded) {
      setSvcStorageTrees(prev => ({ ...prev, [key]: { ...prev[key], tree: updateNode(prev[key].tree, indices, n => ({ ...n, expanded: false })) } }))
      return
    }

    if (node.children.length > 0) {
      setSvcStorageTrees(prev => ({ ...prev, [key]: { ...prev[key], tree: updateNode(prev[key].tree, indices, n => ({ ...n, expanded: true })) } }))
      return
    }

    setSvcStorageTrees(prev => ({ ...prev, [key]: { ...prev[key], tree: updateNode(prev[key].tree, indices, n => ({ ...n, expanded: true, loading: true })) } }))

    try {
      const result = await listServiceStorageObjects(wsName, svcName, node.path)
      const children: TreeStorageNode[] = [
        ...(result.directories || []).map(d => ({
          name: d.name, path: d.path, isDirectory: true, expanded: false, loading: false, children: [],
        })),
        ...(result.objects || []).map(o => ({
          name: o.name, path: o.key, isDirectory: false, expanded: false, loading: false, children: [],
        })),
      ]
      setSvcStorageTrees(prev => ({ ...prev, [key]: { ...prev[key], tree: updateNode(prev[key].tree, indices, n => ({ ...n, loading: false, children })) } }))
    } catch {
      setSvcStorageTrees(prev => ({ ...prev, [key]: { ...prev[key], tree: updateNode(prev[key].tree, indices, n => ({ ...n, loading: false })) } }))
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

  const addSession = useCallback((wsName: string, envName: string, svcName: string, label: string, streamUrl?: string, resName?: string, objKey?: string) => {
    const id = streamUrl ? `res:${wsName}/${envName}/${svcName}` : `${wsName}/${envName}/${svcName}`
    setSessions(prev => {
      if (prev.some(s => s.id === id)) return prev
      if (prev.length >= LIMITS[layout]) return prev
      return [...prev, { id, workspace: wsName, environment: envName, service: svcName, label, streamUrl, resourceName: resName, objectKey: objKey }]
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

  const sidebarWRef = useRef(sidebarWidth)
  useEffect(() => { sidebarWRef.current = sidebarWidth }, [sidebarWidth])

  function resizeSidebar(delta: number) {
    setSidebarWidth(w => Math.max(SIDEBAR_MIN, Math.min(SIDEBAR_MAX, w + delta)))
  }

  function focusTab(idx: number) {
    const next = sessions[(idx + sessions.length) % sessions.length]
    setActiveTab(next.id)
    requestAnimationFrame(() => document.getElementById(`log-tab-${next.id}`)?.focus())
  }

  const gridClass = (() => {
    const n = sessions.length
    if (n <= 3) return 'grid-cols-1 auto-rows-fr'
    if (n <= 4) return 'grid-cols-2 grid-rows-2'
    return 'grid-cols-3 grid-rows-2'
  })()

  const activeIds = new Set(sessions.map(s => s.id))
  const isFull = sessions.length >= maxForLayout
  const toggleSession = (id: string, open: () => void) => activeIds.has(id) ? removeSession(id) : open()

  const panelFor = (session: LogSession) => (
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
      resourceName={session.resourceName}
      objectKey={session.objectKey}
    />
  )

  const serviceStorage = (wsName: string, svcName: string, depth: number) => {
    const state = svcStorageTrees[`${wsName}/${svcName}`]
    if (!state?.expanded || state.tree.length === 0) return null
    const resPrefix = `svc-storage:${wsName}/${svcName}`
    return (
      <StorageTreeNodes
        nodes={state.tree}
        resName={resPrefix}
        resIdx={0}
        depth={depth}
        parentPath={[]}
        activeIds={activeIds}
        isFull={isFull}
        onToggleDir={(_idx, path) => toggleServiceStorageDir(wsName, svcName, path)}
        onSelect={(key, name) => toggleSession(`res:${resPrefix}/obj/${key}`, () =>
          addSession(resPrefix, 'obj', key, name, serviceStorageStreamURL(wsName, svcName, key)))}
      />
    )
  }

  const sectionLabel = 'px-2 pt-3 pb-1 text-2xs font-medium uppercase tracking-wider text-fg-muted'

  return (
    <div className="flex h-full overflow-hidden">
      {/* Source tree */}
      <aside className="flex h-full shrink-0 flex-col border-r border-line bg-surface" style={{ width: sidebarWidth }}>
        <div className="shrink-0 space-y-2 border-b border-line p-3">
          <div className="flex items-center justify-between">
            <span className="text-2xs font-medium uppercase tracking-wider text-fg-muted">Sources</span>
            <span className="text-2xs tabular-nums text-fg-muted" title="Open panes / limit for this layout">
              {sessions.length}/{maxForLayout} open
            </span>
          </div>
          <SegmentedControl size="sm" label="Layout" options={LAYOUT_OPTIONS} value={layout} onChange={changeLayout} />
        </div>

        <div role="tree" aria-label="Log sources" className="min-h-0 flex-1 overflow-y-auto p-2">
          {loading && (
            <div className="space-y-1.5 p-1" aria-busy>
              {[70, 55, 80, 60, 45].map(w => <div key={w} className="skeleton h-6 rounded-control" style={{ width: `${w}%` }} />)}
            </div>
          )}

          {!loading && tree.length === 0 && standaloneEnvs.length === 0 && standaloneSvcs.length === 0 && resourceTree.length === 0 && (
            <p className="px-2 py-3 text-xs text-fg-muted">No sources yet. Create a workspace to stream its logs here.</p>
          )}

          {tree.length > 0 && (standaloneEnvs.length > 0 || standaloneSvcs.length > 0 || (hasResourceScope && resourceTree.length > 0)) && (
            <div className={sectionLabel}>Workspaces</div>
          )}

          {tree.map((wsNode, wsIdx) => {
            const wsName = wsNode.data.name
            return (
              <div key={wsName}>
                <TreeItem
                  label={<span className="font-medium text-fg">{wsName}</span>}
                  expanded={wsNode.expanded}
                  onToggle={() => toggleWorkspace(wsIdx)}
                />

                {wsNode.expanded && wsNode.isServiceFirst && wsNode.sfServices.map((svcNode, svcIdx) => {
                  if (isCloudType(svcNode.provider)) {
                    const st = svcStorageTrees[`${wsName}/${svcNode.name}`]
                    return (
                      <div key={svcNode.name}>
                        <TreeItem
                          depth={1}
                          label={svcNode.friendlyName}
                          icon={<ProviderIcon provider={svcNode.provider} />}
                          expanded={!!st?.expanded}
                          onToggle={() => toggleServiceStorage(wsName, svcNode.name)}
                          status={st?.loading ? spinner : undefined}
                        />
                        {serviceStorage(wsName, svcNode.name, 2)}
                      </div>
                    )
                  }

                  return (
                    <div key={svcNode.name}>
                      <TreeItem
                        depth={1}
                        label={svcNode.friendlyName}
                        icon={<ProviderIcon provider={svcNode.provider} />}
                        expanded={svcNode.expanded}
                        onToggle={() => toggleSfService(wsIdx, svcIdx)}
                      />
                      {svcNode.expanded && svcNode.environments.map(env => {
                        const id = `${wsName}/${env.name}/${svcNode.name}`
                        return (
                          <SourceRow
                            key={env.name}
                            id={id}
                            label={env.name}
                            depth={2}
                            active={activeIds.has(id)}
                            full={isFull}
                            onToggle={() => toggleSession(id, () => addSession(wsName, env.name, svcNode.name, svcNode.friendlyName))}
                          />
                        )
                      })}
                    </div>
                  )
                })}

                {wsNode.expanded && !wsNode.isServiceFirst && wsNode.environments.map((envNode, envIdx) => (
                  <div key={envNode.data.name}>
                    <TreeItem
                      depth={1}
                      label={envNode.data.name}
                      expanded={envNode.expanded}
                      onToggle={() => toggleEnv(wsIdx, envIdx)}
                    />

                    {envNode.expanded && envNode.services.map(svc => {
                      const svcLabel = svc.friendly_name || svc.name
                      if (isCloudType(svc.provider)) {
                        const st = svcStorageTrees[`${wsName}/${svc.name}`]
                        return (
                          <div key={svc.name}>
                            <TreeItem
                              depth={2}
                              label={svcLabel}
                              icon={<ProviderIcon provider={svc.provider} />}
                              expanded={!!st?.expanded}
                              onToggle={() => toggleServiceStorage(wsName, svc.name)}
                              status={st?.loading ? spinner : undefined}
                            />
                            {serviceStorage(wsName, svc.name, 3)}
                          </div>
                        )
                      }

                      const id = `${wsName}/${envNode.data.name}/${svc.name}`
                      return (
                        <SourceRow
                          key={svc.name}
                          id={id}
                          label={svcLabel}
                          depth={2}
                          icon={<ProviderIcon provider={svc.provider} />}
                          active={activeIds.has(id)}
                          full={isFull}
                          onToggle={() => toggleSession(id, () => addSession(wsName, envNode.data.name, svc.name, svcLabel))}
                        />
                      )
                    })}
                  </div>
                ))}
              </div>
            )
          })}

          {standaloneEnvs.length > 0 && (
            <>
              <div className={sectionLabel}>Environments</div>
              {standaloneEnvs.map(env => (
                <div key={env.name}>
                  <TreeItem
                    label={<span className="font-medium text-fg">{env.name}</span>}
                    expanded={env.expanded}
                    onToggle={() => toggleStandaloneEnv(env.name)}
                    status={env.loading ? spinner : undefined}
                  />
                  {env.expanded && env.services?.length === 0 && (
                    <p className="py-1 pl-10 text-xs text-fg-muted">No services</p>
                  )}
                  {env.expanded && env.services?.map(svc => {
                    const svcLabel = svc.friendly_name || svc.name
                    const scope = `env:${env.name}`
                    const id = `res:${scope}/${env.name}/${svc.name}`
                    return (
                      <SourceRow
                        key={svc.name}
                        id={id}
                        label={svcLabel}
                        depth={1}
                        icon={<ProviderIcon provider={svc.provider} />}
                        active={activeIds.has(id)}
                        full={isFull}
                        onToggle={() => toggleSession(id, () =>
                          addSession(scope, env.name, svc.name, svcLabel, standaloneEnvStreamURL(env.name, svc.name)))}
                      />
                    )
                  })}
                </div>
              ))}
            </>
          )}

          {standaloneSvcs.length > 0 && (
            <>
              <div className={sectionLabel}>Services</div>
              {standaloneSvcs.map(svc => {
                const id = `res:svc:${svc.name}/standalone/${svc.name}`
                return (
                  <SourceRow
                    key={svc.name}
                    id={id}
                    label={svc.name}
                    depth={0}
                    icon={<ProviderIcon provider={svc.provider} />}
                    active={activeIds.has(id)}
                    full={isFull}
                    onToggle={() => toggleSession(id, () =>
                      addSession(`svc:${svc.name}`, 'standalone', svc.name, svc.name, standaloneServiceStreamURL(svc.name)))}
                  />
                )
              })}
            </>
          )}

          {hasResourceScope && resourceTree.length > 0 && (
            <>
              <div className={sectionLabel}>Resources</div>
              {resourceTree.map((resNode, resIdx) => (
                <div key={resNode.name}>
                  <TreeItem
                    label={<span className="font-medium text-fg">{resNode.name}</span>}
                    icon={<ProviderIcon provider={resNode.type} />}
                    expanded={resNode.expanded}
                    onToggle={() => toggleResource(resIdx)}
                    status={resNode.loading ? spinner : undefined}
                    title={resNode.description || undefined}
                  />

                  {resNode.expanded && isCloudType(resNode.type) && (
                    <StorageTreeNodes
                      nodes={resNode.storageTree}
                      resName={resNode.name}
                      resIdx={resIdx}
                      depth={1}
                      parentPath={[]}
                      activeIds={activeIds}
                      isFull={isFull}
                      onToggleDir={toggleStorageDir}
                      onSelect={(key, name) => toggleSession(`res:${resNode.name}/obj/${key}`, () =>
                        addSession(resNode.name, 'storage', key, name, storageObjectStreamURL(resNode.name, key), resNode.name, key))}
                    />
                  )}

                  {resNode.expanded && !isCloudType(resNode.type) && resNode.namespaces.map((nsNode, nsIdx) => (
                    <div key={nsNode.name}>
                      <TreeItem
                        depth={1}
                        label={nsNode.name}
                        expanded={nsNode.expanded}
                        onToggle={() => toggleResourceNs(resIdx, nsIdx)}
                        status={nsNode.loading ? spinner : undefined}
                      />

                      {nsNode.expanded && nsNode.workloads.map(wl => {
                        const id = `res:${resNode.name}/${nsNode.name}/${wl.name}`
                        const url = resourceStreamURL(resNode.name, nsNode.name, wl.kind, wl.name)
                        return (
                          <SourceRow
                            key={`${wl.kind}:${wl.name}`}
                            id={id}
                            label={wl.name}
                            depth={2}
                            meta={wl.kindLabel}
                            active={activeIds.has(id)}
                            full={isFull}
                            onToggle={() => toggleSession(id, () => addSession(resNode.name, nsNode.name, wl.name, wl.name, url))}
                          />
                        )
                      })}
                    </div>
                  ))}
                </div>
              ))}
            </>
          )}
        </div>
      </aside>

      <ResizeHandle
        label="Resize sources panel"
        onResize={resizeSidebar}
        onResizeEnd={() => localStorage.setItem('avalok-logs-sidebar-w', String(sidebarWRef.current))}
      />

      {/* Panes */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-canvas">
        {sessions.length === 0 ? (
          <div className="flex h-full items-center justify-center p-6">
            <EmptyState
              icon={<Terminal />}
              title="Pick a source from the left"
              description={`Click a service, workload or file to stream its logs. Up to ${maxForLayout} panes in ${layout} layout; click a source again to close it.`}
            />
          </div>
        ) : layout === 'grid' ? (
          <div className={cn('grid h-full gap-2 p-2', gridClass)}>
            {sessions.map(panelFor)}
          </div>
        ) : layout === 'tabs' ? (
          <div className="flex h-full flex-col">
            <div role="tablist" aria-label="Open sources" className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-line bg-surface px-2">
              {sessions.map((session, idx) => {
                const isActive = activeTab === session.id
                return (
                  <div
                    key={session.id}
                    className={cn(
                      '-mb-px flex h-10 shrink-0 items-center gap-1 border-b-2 pr-1 pl-2 transition-colors',
                      isActive ? 'border-accent text-fg' : 'border-transparent text-fg-muted hover:text-fg',
                    )}
                  >
                    <button
                      id={`log-tab-${session.id}`}
                      type="button"
                      role="tab"
                      aria-selected={isActive}
                      tabIndex={isActive ? 0 : -1}
                      onClick={() => setActiveTab(session.id)}
                      onKeyDown={e => {
                        if (e.key === 'ArrowRight') { e.preventDefault(); focusTab(idx + 1) }
                        else if (e.key === 'ArrowLeft') { e.preventDefault(); focusTab(idx - 1) }
                        else if (e.key === 'Delete') { e.preventDefault(); removeSession(session.id) }
                      }}
                      className="flex min-w-0 cursor-pointer items-center gap-2 rounded-control px-1 py-1 text-xs font-medium"
                    >
                      <SourceDot name={session.id} />
                      <span className="max-w-40 truncate">{session.label}</span>
                      {session.environment && <span className="max-w-24 truncate text-2xs font-normal text-fg-muted">{session.environment}</span>}
                    </button>
                    <IconButton size="xs" label={`Close ${session.label}`} onClick={() => removeSession(session.id)}>
                      <X className="size-3" />
                    </IconButton>
                  </div>
                )
              })}
            </div>

            <div className="min-h-0 flex-1 p-2">
              {sessions.filter(s => s.id === activeTab).map(panelFor)}
            </div>
          </div>
        ) : (
          <div className="h-full p-2">
            <MergedLogPanel sessions={sessions} maxLines={logBufferLines} onRemoveSession={removeSession} />
          </div>
        )}
      </div>
    </div>
  )
}
