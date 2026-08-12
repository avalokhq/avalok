import { useState } from 'react'
import { LayoutDashboard, Monitor, Settings, PanelLeftClose, PanelLeft } from 'lucide-react'
import { entityStyle } from '../ui/EntityIcon'
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

const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, page: 'workspaces' },
  { id: 'logs', label: 'Log Dashboard', icon: Monitor, page: 'logs' },
]

const ADMIN_ITEMS: NavItem[] = [
  { id: 'manage-workspaces', label: 'Workspaces', icon: entityStyle('workspace').Icon, page: 'manage-workspaces' },
  { id: 'manage-services', label: 'Services', icon: entityStyle('service').Icon, page: 'manage-services' },
  { id: 'manage-environments', label: 'Environments', icon: entityStyle('environment').Icon, page: 'manage-environments' },
  { id: 'manage-resources', label: 'Resources', icon: entityStyle('resource').Icon, page: 'manage-resources' },
  { id: 'admin', label: 'Administration', icon: Settings, page: 'admin' },
]

function getCollapsed(): boolean {
  return localStorage.getItem('avalok-sidebar-collapsed') === 'true'
}

export default function AppSidebar({ currentPage, onNavigate, showAdmin }: Props) {
  const [collapsed, setCollapsed] = useState(getCollapsed)

  function toggleCollapse() {
    const next = !collapsed
    setCollapsed(next)
    localStorage.setItem('avalok-sidebar-collapsed', String(next))
  }

  const items = showAdmin ? [...NAV_ITEMS, ...ADMIN_ITEMS] : NAV_ITEMS

  function isActive(item: NavItem) {
    if (item.id === 'dashboard') return currentPage === 'workspaces'
    return currentPage === item.page
  }

  return (
    <div
      className={cn(
        'flex flex-col shrink-0 h-full border-r border-[var(--border-default)] bg-[var(--bg-surface)] transition-[width] duration-200 ease-in-out',
        collapsed ? 'w-12' : 'w-[220px]'
      )}
    >
      <nav className="flex-1 flex flex-col gap-0.5 py-2 px-1.5 overflow-hidden">
        {items.map((item, index) => {
          const Icon = item.icon
          const active = isActive(item)
          const showSeparator = showAdmin && index === NAV_ITEMS.length

          return (
            <div key={item.id}>
              {showSeparator && (
                <div className="h-px bg-[var(--border-subtle)] my-1.5 mx-2" />
              )}
              <button
                onClick={() => onNavigate(item.page)}
                title={collapsed ? item.label : undefined}
                className={cn(
                  'flex items-center gap-2.5 rounded-md transition-colors text-[13px] font-medium w-full',
                  collapsed ? 'justify-center px-0 py-2' : 'px-2.5 py-2',
                  active
                    ? 'bg-[var(--bg-active)] text-[var(--text-accent)]'
                    : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'
                )}
              >
                <Icon className={cn('w-4 h-4 shrink-0', active ? 'text-[var(--text-accent)]' : '')} />
                {!collapsed && <span className="truncate">{item.label}</span>}
              </button>
            </div>
          )
        })}
      </nav>

      <div className="shrink-0 px-1.5 py-2 border-t border-[var(--border-subtle)]">
        <button
          onClick={toggleCollapse}
          className={cn(
            'flex items-center gap-2.5 rounded-md py-2 text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition-colors text-[13px] w-full',
            collapsed ? 'justify-center px-0' : 'px-2.5'
          )}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <PanelLeft className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
          {!collapsed && <span>Collapse</span>}
        </button>
      </div>
    </div>
  )
}
