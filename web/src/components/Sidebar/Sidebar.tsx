import { useState, useEffect } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { cn } from '../../lib/cn'
import { listWorkspaces, listEnvironments, listServices } from '../../lib/api'
import type { Workspace, Environment, Service } from '../../lib/types'
import ProviderIcon from '../ui/ProviderIcon'
import { AvalokWordmark } from '../ui/AvalokLogo'

interface Props {
  activeId?: string
  onSelect: (workspace: Workspace, env: Environment, service: Service) => void
  onNavigateWorkspace: (workspace: Workspace) => void
  onNavigateEnv: (workspace: Workspace, env: Environment) => void
  onLogoClick?: () => void
}

interface TreeWorkspace {
  data: Workspace
  expanded: boolean
  environments: TreeEnv[]
}

interface TreeEnv {
  data: Environment
  expanded: boolean
  services: Service[]
}

export default function Sidebar({ activeId, onSelect, onNavigateWorkspace, onNavigateEnv, onLogoClick }: Props) {
  const [tree, setTree] = useState<TreeWorkspace[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadTree()
  }, [])

  async function loadTree() {
    try {
      const workspaces = await listWorkspaces()
      const nodes: TreeWorkspace[] = []

      for (const ws of workspaces) {
        const envs = await listEnvironments(ws.name)
        const envNodes: TreeEnv[] = []

        for (const env of envs) {
          const services = await listServices(ws.name, env.name)
          envNodes.push({ data: env, expanded: false, services })
        }

        nodes.push({ data: ws, expanded: nodes.length === 0, environments: envNodes })
      }

      setTree(nodes)
    } catch (err) {
      console.error('Failed to load sidebar tree:', err)
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

  return (
    <div className="flex flex-col h-full bg-[var(--bg-surface)] border-r border-[var(--border-default)]">
      {/* Header */}
      <div className="h-14 shrink-0 flex items-center px-4 border-b border-[var(--border-default)] glass-header">
        <button onClick={onLogoClick} className="cursor-pointer hover:opacity-70 transition-opacity" title="Toggle sidebar">
          <AvalokWordmark height={22} />
        </button>
      </div>

      {/* Tree */}
      <div className="flex-1 overflow-y-auto py-1 text-[13px] select-none">
        {loading && (
          <div className="px-4 py-3 text-xs text-[var(--text-muted)]">Loading...</div>
        )}

        {tree.map((wsNode, wsIdx) => (
          <div key={wsNode.data.name}>
            {/* Workspace header */}
            <button
              onClick={() => toggleWorkspace(wsIdx)}
              onDoubleClick={() => onNavigateWorkspace(wsNode.data)}
              className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-[var(--bg-hover)] transition-colors"
            >
              <span className="text-[var(--text-primary)] font-medium text-sm">{wsNode.data.name}</span>
              <span className="ml-auto text-[11px] text-[var(--text-muted)] truncate max-w-[140px]">
                {wsNode.data.description}
              </span>
            </button>

            {/* Environments */}
            {wsNode.expanded && wsNode.environments.map((envNode, envIdx) => (
              <div key={envNode.data.name}>
                <button
                  onClick={() => toggleEnv(wsIdx, envIdx)}
                  onDoubleClick={() => onNavigateEnv(wsNode.data, envNode.data)}
                  className="w-full flex items-center gap-1.5 pl-3 pr-3 py-1.5 text-left hover:bg-[var(--bg-hover)] transition-colors"
                >
                  {envNode.expanded
                    ? <ChevronDown className="w-3 h-3 text-[var(--text-muted)] shrink-0" />
                    : <ChevronRight className="w-3 h-3 text-[var(--text-muted)] shrink-0" />
                  }
                  <span className="text-[var(--text-secondary)] font-medium">{envNode.data.name}</span>
                </button>

                {/* Services */}
                {envNode.expanded && envNode.services.map(svc => {
                  const id = `${wsNode.data.name}/${envNode.data.name}/${svc.name}`
                  const isActive = activeId === id

                  return (
                    <button
                      key={svc.name}
                      onClick={() => onSelect(wsNode.data, envNode.data, svc)}
                      className={cn(
                        'w-full flex items-center gap-2 pl-8 pr-3 py-1.5 text-left transition-colors',
                        isActive
                          ? 'bg-[var(--bg-active)] text-[var(--text-accent)]'
                          : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
                      )}
                    >
                      <ProviderIcon
                        provider={svc.provider}
                        className={cn('w-3.5 h-3.5 shrink-0', isActive ? 'text-[var(--text-accent)]' : 'text-[var(--text-muted)]')}
                      />
                      <span className="flex-1 truncate">{svc.friendly_name || svc.name}</span>
                      <span className={cn(
                        'text-[11px] shrink-0',
                        isActive ? 'text-[var(--text-accent)]' : 'text-[var(--text-muted)]'
                      )}>
                        {svc.provider}
                      </span>
                    </button>
                  )
                })}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
