import { useState } from 'react'
import { LayoutDashboard, ScrollText, Settings, PanelLeftClose, PanelLeft } from 'lucide-react'
import { entityStyle } from '../ui/EntityIcon'
import Tooltip from '../ui/Tooltip'
import StatusIndicator from './StatusIndicator'
import { cn } from '../../lib/cn'

interface NavItem {
  id: string
  label: string
  icon: React.FC<{ className?: string }>
  page: string
}

interface Props {
  currentPage: string
  onNavigate: (page: string) => void
  showAdmin?: boolean
}

const OBSERVE: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, page: 'workspaces' },
  { id: 'logs', label: 'Log Dashboard', icon: ScrollText, page: 'logs' },
]

const MANAGE: NavItem[] = [
  { id: 'manage-workspaces', label: 'Workspaces', icon: entityStyle('workspace').Icon, page: 'manage-workspaces' },
  { id: 'manage-services', label: 'Services', icon: entityStyle('service').Icon, page: 'manage-services' },
  { id: 'manage-environments', label: 'Environments', icon: entityStyle('environment').Icon, page: 'manage-environments' },
  { id: 'manage-resources', label: 'Resources', icon: entityStyle('resource').Icon, page: 'manage-resources' },
  { id: 'admin', label: 'Administration', icon: Settings, page: 'admin' },
]

/** Which nav item a page belongs to (drill-down and edit pages highlight their parent). */
function activeId(page: string): string {
  if (page === 'logs') return 'logs'
  if (page === 'admin') return 'admin'
  const m = page.match(/^(manage|edit|create)-(workspace|service|environment|resource)s?$/)
  if (m) return `manage-${m[2]}s`
  return 'dashboard'
}

function getCollapsed(): boolean {
  return localStorage.getItem('avalok-sidebar-collapsed') === 'true'
}

export default function AppSidebar({ currentPage, onNavigate, showAdmin }: Props) {
  const [collapsed, setCollapsed] = useState(getCollapsed)
  const current = activeId(currentPage)

  function toggleCollapse() {
    const next = !collapsed
    setCollapsed(next)
    localStorage.setItem('avalok-sidebar-collapsed', String(next))
  }

  function renderItem(item: NavItem) {
    const Icon = item.icon
    const active = item.id === current
    const button = (
      <button
        type="button"
        onClick={() => onNavigate(item.page)}
        aria-current={active ? 'page' : undefined}
        aria-label={collapsed ? item.label : undefined}
        className={cn(
          'relative flex h-8 w-full cursor-pointer items-center gap-2.5 rounded-control text-sm font-medium transition-colors',
          collapsed ? 'justify-center' : 'px-2.5',
          active ? 'bg-selected text-fg' : 'text-fg-secondary hover:bg-hover hover:text-fg',
        )}
      >
        {active && <span aria-hidden className="absolute inset-y-1.5 -left-2 w-0.5 rounded-full bg-accent" />}
        <Icon className={cn('size-4 shrink-0', active ? 'text-accent' : 'text-fg-muted')} />
        {!collapsed && <span className="truncate">{item.label}</span>}
      </button>
    )
    return (
      <li key={item.id}>
        {collapsed ? <Tooltip content={item.label} side="right">{button}</Tooltip> : button}
      </li>
    )
  }

  function renderGroup(label: string, items: NavItem[]) {
    return (
      <div>
        {collapsed ? (
          <div aria-hidden className="mx-2 mb-2 h-px bg-line" />
        ) : (
          <div className="mb-1 px-2.5 text-2xs font-semibold uppercase tracking-wider text-fg-faint">{label}</div>
        )}
        <ul className="flex flex-col gap-0.5 [&>li>span]:w-full">{items.map(renderItem)}</ul>
      </div>
    )
  }

  return (
    <aside
      aria-label="Main navigation"
      className={cn(
        'flex h-full shrink-0 flex-col border-r border-line bg-surface transition-[width] duration-200 ease-out',
        collapsed ? 'w-14' : 'w-[232px]',
      )}
    >
      <nav className="flex flex-1 flex-col gap-5 overflow-y-auto overflow-x-hidden px-2 py-4">
        {renderGroup('Observe', OBSERVE)}
        {showAdmin && renderGroup('Manage', MANAGE)}
      </nav>

      <div className="flex shrink-0 flex-col gap-0.5 border-t border-line px-2 py-2 [&>span]:w-full">
        <StatusIndicator collapsed={collapsed} />
        {(() => {
          const btn = (
            <button
              type="button"
              onClick={toggleCollapse}
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              className={cn(
                'flex h-8 w-full cursor-pointer items-center gap-2.5 rounded-control text-xs text-fg-muted transition-colors hover:bg-hover hover:text-fg',
                collapsed ? 'justify-center' : 'px-2.5',
              )}
            >
              {collapsed ? <PanelLeft className="size-4" /> : <PanelLeftClose className="size-4" />}
              {!collapsed && <span>Collapse</span>}
            </button>
          )
          return collapsed ? <Tooltip content="Expand sidebar" side="right">{btn}</Tooltip> : btn
        })()}
      </div>
    </aside>
  )
}
