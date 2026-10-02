import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { Search, Server, Monitor, Settings, Folders, Users, KeyRound, CornerDownLeft, SlidersHorizontal } from 'lucide-react'
import { EntityIconRaw, entityStyle } from './EntityIcon'
import type { EntityKind } from './EntityIcon'
import Kbd from './Kbd'
import { cn } from '../../lib/cn'
import { listWorkspaces, listStandaloneEnvs, listStandaloneServices, adminListResources } from '../../lib/api'
import type { AdminResource } from '../../lib/api'
import type { Workspace, StandaloneEnvironment, StandaloneService } from '../../lib/types'
import ProviderIcon, { providerDisplayName } from './ProviderIcon'

interface SearchItem {
  kind: 'workspace' | 'environment' | 'service' | 'resource' | 'page' | 'setting'
  id: string
  name: string
  description?: string
  meta?: string
  icon: React.ReactNode
  data?: unknown
}

interface Props {
  open: boolean
  onClose: () => void
  onSelectWorkspace: (ws: Workspace) => void
  onSelectEnvironment: (env: StandaloneEnvironment) => void
  onSelectService: (svc: StandaloneService) => void
  onSelectResource?: (name: string, description: string, type: string) => void
  onNavigate: (page: string) => void
  isAdmin?: boolean
  serverMode?: boolean
}

const KIND_ORDER: SearchItem['kind'][] = ['page', 'setting', 'workspace', 'environment', 'service', 'resource']
const KIND_LABELS: Record<string, string> = {
  page: 'Pages',
  setting: 'Settings',
  workspace: 'Workspaces',
  environment: 'Environments',
  service: 'Services',
  resource: 'Resources',
}

function fuzzyMatch(query: string, target: string): number {
  const q = query.toLowerCase()
  const t = target.toLowerCase()

  if (!q) return 1
  if (t === q) return 100
  if (t.startsWith(q)) return 90

  let qi = 0
  let score = 0
  let consecutive = 0
  let lastMatchIdx = -2

  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      qi++
      score += 10

      if (ti === lastMatchIdx + 1) {
        consecutive++
        score += consecutive * 5
      } else {
        consecutive = 0
      }

      if (ti === 0 || t[ti - 1] === ' ' || t[ti - 1] === '-' || t[ti - 1] === '_') {
        score += 15
      }

      lastMatchIdx = ti
    }
  }

  if (qi < q.length) return 0
  return score
}

function fuzzyFilter(items: SearchItem[], query: string): SearchItem[] {
  if (!query) return items

  const scored = items
    .map(item => {
      const nameScore = fuzzyMatch(query, item.name)
      const descScore = item.description ? fuzzyMatch(query, item.description) * 0.6 : 0
      const metaScore = item.meta ? fuzzyMatch(query, item.meta) * 0.4 : 0
      const kindScore = fuzzyMatch(query, item.kind) * 0.3
      const best = Math.max(nameScore, descScore, metaScore, kindScore)
      return { item, score: best }
    })
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)

  return scored.map(s => s.item)
}

export default function SearchDialog({ open, onClose, onSelectWorkspace, onSelectEnvironment, onSelectService, onSelectResource, onNavigate, isAdmin, serverMode }: Props) {
  const [query, setQuery] = useState('')
  const [items, setItems] = useState<SearchItem[]>([])
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden'
    }
    return () => { document.body.style.overflow = '' }
  }, [open])

  useEffect(() => {
    if (!open) return
    setQuery('')
    setActiveIndex(0)
    setTimeout(() => inputRef.current?.focus(), 50)

    const pages: SearchItem[] = [
      { kind: 'page', id: 'page-dashboard', name: 'Dashboard', description: 'Home overview', icon: <EntityIconRaw kind="workspace" className="w-4 h-4" />, data: 'workspaces' },
      { kind: 'page', id: 'page-logs', name: 'Log Dashboard', description: 'Stream and browse logs', icon: <Monitor className="w-4 h-4" />, data: 'logs' },
    ]

    if (isAdmin) {
      pages.push(
        { kind: 'page', id: 'page-manage-ws', name: 'Manage Workspaces', description: 'Create, edit, delete workspaces', icon: <Folders className="w-4 h-4" />, data: 'manage-workspaces' },
        { kind: 'page', id: 'page-manage-svc', name: 'Manage Services', description: 'Create, edit, delete services', icon: <Server className="w-4 h-4" />, data: 'manage-services' },
        { kind: 'page', id: 'page-manage-env', name: 'Manage Environments', description: 'Create, edit, delete environments', icon: <EntityIconRaw kind="environment" className="w-4 h-4" />, data: 'manage-environments' },
        { kind: 'page', id: 'page-manage-res', name: 'Manage Resources', description: 'Add and configure resources', icon: <EntityIconRaw kind="resource" className="w-4 h-4" />, data: 'manage-resources' },
        { kind: 'page', id: 'page-admin', name: 'Administration', description: 'Users, credentials, server settings', icon: <Settings className="w-4 h-4" />, data: 'admin:users' },
        { kind: 'page', id: 'page-admin-users', name: 'User Management', description: 'Manage user accounts and roles', icon: <Users className="w-4 h-4" />, data: 'admin:users' },
        { kind: 'page', id: 'page-admin-creds', name: 'Credential Profiles', description: 'Manage authentication credentials', icon: <KeyRound className="w-4 h-4" />, data: 'admin:credentials' },
      )

      pages.push(
        { kind: 'setting', id: 'setting-ws-toggle', name: 'Enable Workspaces', description: 'Show Workspaces section on homepage', icon: <SlidersHorizontal className="w-4 h-4" />, data: 'admin:settings:enable_workspaces' },
        { kind: 'setting', id: 'setting-env-toggle', name: 'Enable Environments', description: 'Show standalone Environments on homepage', icon: <SlidersHorizontal className="w-4 h-4" />, data: 'admin:settings:enable_environments' },
        { kind: 'setting', id: 'setting-svc-toggle', name: 'Enable Services', description: 'Show standalone Services on homepage', icon: <SlidersHorizontal className="w-4 h-4" />, data: 'admin:settings:enable_services' },
        { kind: 'setting', id: 'setting-redact', name: 'Redact Credentials', description: 'Hide passwords in YAML preview', icon: <SlidersHorizontal className="w-4 h-4" />, data: 'admin:settings:redact_credentials' },
        { kind: 'setting', id: 'setting-filebrowser', name: 'File Browser Page Size', description: 'Lines per page when viewing log files', icon: <SlidersHorizontal className="w-4 h-4" />, data: 'admin:settings:file_browser_page_size' },
        { kind: 'setting', id: 'setting-tail', name: 'Initial Log Tail Lines', description: 'Historical lines loaded when opening a stream', icon: <SlidersHorizontal className="w-4 h-4" />, data: 'admin:settings:stream_tail_lines' },
        { kind: 'setting', id: 'setting-buffer', name: 'Log Buffer Size', description: 'Max log lines kept in browser per stream', icon: <SlidersHorizontal className="w-4 h-4" />, data: 'admin:settings:log_buffer_lines' },
        { kind: 'setting', id: 'setting-ws-conns', name: 'Max Concurrent Connections', description: 'Simultaneous WebSocket connections limit', icon: <SlidersHorizontal className="w-4 h-4" />, data: 'admin:settings:ws_max_connections' },
        { kind: 'setting', id: 'setting-ws-msg', name: 'Max Message Size', description: 'Maximum WebSocket message size from clients', icon: <SlidersHorizontal className="w-4 h-4" />, data: 'admin:settings:ws_max_message_kb' },
      )
    }

    setItems(pages)

    const hasResourceScope = isAdmin || serverMode
    Promise.all([
      listWorkspaces().catch(() => []),
      listStandaloneEnvs().catch(() => []),
      listStandaloneServices().catch(() => []),
      hasResourceScope ? adminListResources().catch(() => []) : Promise.resolve([]),
    ]).then(([ws, envs, svcs, res]) => {
      const all: SearchItem[] = [...pages]
      for (const w of (ws || [])) {
        all.push({ kind: 'workspace', id: `ws-${w.name}`, name: w.name, description: w.description, meta: `${w.environments} envs · ${w.services} services`, icon: <EntityIconRaw kind="workspace" className="w-4 h-4" />, data: w })
      }
      for (const e of (envs || [])) {
        all.push({ kind: 'environment', id: `env-${e.name}`, name: e.name, description: e.description, meta: `${e.services} services`, icon: <EntityIconRaw kind="environment" className="w-4 h-4" />, data: e })
      }
      for (const s of (svcs || [])) {
        all.push({ kind: 'service', id: `svc-${s.name}`, name: s.name, description: s.description, meta: providerDisplayName(s.provider), icon: <ProviderIcon provider={s.provider} className="w-4 h-4" />, data: s })
      }
      for (const r of (res || [])) {
        all.push({ kind: 'resource', id: `res-${r.name}`, name: r.name, description: r.description, meta: providerDisplayName(r.type), icon: <ProviderIcon provider={r.type} className="w-4 h-4" />, data: r })
      }
      setItems(all)
    })
  }, [open, isAdmin, serverMode])

  const filtered = fuzzyFilter(items, query)

  const grouped = KIND_ORDER
    .map(kind => ({ kind, items: filtered.filter(i => i.kind === kind) }))
    .filter(g => g.items.length > 0)

  const flatFiltered = grouped.flatMap(g => g.items)

  useEffect(() => {
    setActiveIndex(0)
  }, [query])

  const select = useCallback((item: SearchItem) => {
    onClose()
    switch (item.kind) {
      case 'page':
      case 'setting':
        onNavigate(item.data as string)
        break
      case 'workspace':
        onSelectWorkspace(item.data as Workspace)
        break
      case 'environment':
        onSelectEnvironment(item.data as StandaloneEnvironment)
        break
      case 'service':
        onSelectService(item.data as StandaloneService)
        break
      case 'resource': {
        const r = item.data as AdminResource
        onSelectResource?.(r.name, r.description || '', r.type)
        break
      }
    }
  }, [onClose, onNavigate, onSelectWorkspace, onSelectEnvironment, onSelectService, onSelectResource])

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex(i => Math.min(i + 1, flatFiltered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex(i => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (flatFiltered[activeIndex]) select(flatFiltered[activeIndex])
    } else if (e.key === 'Escape') {
      onClose()
    }
  }

  useEffect(() => {
    const el = listRef.current?.querySelector('[data-active="true"]')
    el?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex])

  if (!open) return null

  let itemIdx = -1

  return createPortal(
    <div
      className="fixed inset-0 z-[95] flex items-start justify-center bg-overlay px-4 pt-[14vh] backdrop-blur-xl animate-fade-in"
      onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search"
        className="w-full max-w-xl overflow-hidden rounded-overlay border border-line bg-surface-raised shadow-lg animate-scale-in"
        onKeyDown={handleKeyDown}
      >
        <div className="flex items-center gap-3 border-b border-line px-4">
          <Search className="size-4 shrink-0 text-fg-muted" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search workspaces, services, settings…"
            role="combobox"
            aria-expanded="true"
            aria-controls="search-results"
            aria-activedescendant={flatFiltered[activeIndex] ? `search-${flatFiltered[activeIndex].id}` : undefined}
            className="h-12 flex-1 bg-transparent text-base text-fg placeholder:text-fg-faint focus-visible:outline-none"
          />
          <Kbd>Esc</Kbd>
        </div>

        <div ref={listRef} id="search-results" role="listbox" className="max-h-[52vh] overflow-auto p-2">
          {flatFiltered.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-fg-muted">
              No results for &ldquo;<span className="text-fg">{query}</span>&rdquo;
            </div>
          ) : (
            grouped.map(group => (
              <div key={group.kind} className="mb-1 last:mb-0">
                <div className="px-2 pb-1 pt-2 text-2xs font-semibold uppercase tracking-wider text-fg-faint">
                  {KIND_LABELS[group.kind]}
                </div>
                {group.items.map(item => {
                  itemIdx++
                  const idx = itemIdx
                  const active = idx === activeIndex
                  const entity = item.kind === 'workspace' || item.kind === 'environment' || item.kind === 'service' || item.kind === 'resource'
                  return (
                    <button
                      key={item.id}
                      id={`search-${item.id}`}
                      type="button"
                      role="option"
                      aria-selected={active}
                      data-active={active}
                      tabIndex={-1}
                      onClick={() => select(item)}
                      onMouseMove={() => { if (!active) setActiveIndex(idx) }}
                      className={cn(
                        'flex w-full cursor-pointer items-center gap-3 rounded-control px-2 py-2 text-left transition-colors',
                        active ? 'bg-selected' : 'hover:bg-hover',
                      )}
                    >
                      <div className={cn(
                        'flex size-7 shrink-0 items-center justify-center rounded-control [&_svg]:size-4',
                        entity ? cn(entityStyle(item.kind as EntityKind).bg, entityStyle(item.kind as EntityKind).color) : 'border border-line bg-surface-sunken text-fg-muted',
                      )}>
                        {item.icon}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm text-fg">{item.name}</div>
                        {item.description && <div className="truncate text-xs text-fg-muted">{item.description}</div>}
                      </div>
                      {item.meta && <span className="shrink-0 text-xs text-fg-muted">{item.meta}</span>}
                      <CornerDownLeft className={cn('size-3.5 shrink-0 text-fg-muted', !active && 'invisible')} />
                    </button>
                  )
                })}
              </div>
            ))
          )}
        </div>

        <div className="flex items-center gap-4 border-t border-line bg-surface-sunken px-4 py-2 text-xs text-fg-muted">
          <span className="flex items-center gap-1.5"><Kbd>↑</Kbd><Kbd>↓</Kbd> Navigate</span>
          <span className="flex items-center gap-1.5"><Kbd>↵</Kbd> Open</span>
          <span className="flex items-center gap-1.5"><Kbd>Esc</Kbd> Close</span>
        </div>
      </div>
    </div>,
    document.body,
  )
}
