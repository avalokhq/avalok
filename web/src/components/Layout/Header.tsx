import { Sun, Moon, Monitor, ChevronRight, LogOut } from 'lucide-react'
import { cn } from '../../lib/cn'
import { AvalokWordmark } from '../ui/AvalokLogo'
import type { AuthUser } from '../../lib/api'

type Theme = 'dark' | 'light' | 'auto'

interface Props {
  theme: Theme
  onThemeChange: (t: Theme) => void
  breadcrumbs?: { label: string; onClick?: () => void }[]
  connected?: boolean
  onNavigateHome?: () => void
  onLogout?: () => void
  currentUser?: AuthUser | null
}

const themeOptions: { value: Theme; icon: React.FC<{ className?: string }> }[] = [
  { value: 'dark', icon: Moon },
  { value: 'light', icon: Sun },
  { value: 'auto', icon: Monitor },
]

export default function Header({ theme, onThemeChange, breadcrumbs, connected, onNavigateHome, onLogout, currentUser }: Props) {
  return (
    <header className="h-14 shrink-0 flex items-center px-5 gap-4 border-b border-[var(--border-default)] glass-header">
      {/* Logo */}
      <button onClick={onNavigateHome} className="cursor-pointer hover:opacity-70 transition-opacity shrink-0">
        <AvalokWordmark height={22} />
      </button>

      {/* Breadcrumbs */}
      {breadcrumbs && breadcrumbs.length > 0 && (
        <>
          <div className="w-px h-5 bg-[var(--border-default)]" />
          <nav className="flex items-center gap-1 text-sm">
            {breadcrumbs.map((crumb, i) => (
              <span key={i} className="flex items-center gap-1">
                {i > 0 && <ChevronRight className="w-3.5 h-3.5 text-[var(--text-muted)]" />}
                {crumb.onClick ? (
                  <button
                    onClick={crumb.onClick}
                    className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
                  >
                    {crumb.label}
                  </button>
                ) : (
                  <span className="text-[var(--text-primary)] font-medium">{crumb.label}</span>
                )}
              </span>
            ))}
          </nav>
        </>
      )}

      <div className="ml-auto flex items-center gap-3">
        {/* Connection status */}
        {connected !== undefined && (
          <div className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)]">
            <span className={cn(
              'w-1.5 h-1.5 rounded-full',
              connected ? 'bg-[var(--accent-bright)] status-pulse' : 'bg-red-400'
            )} />
            {connected ? 'Connected' : 'Disconnected'}
          </div>
        )}

        {/* Current user info */}
        {currentUser && (
          <div className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)]">
            <span className="font-medium text-[var(--text-primary)]">{currentUser.username}</span>
            <span className="px-1.5 py-0.5 rounded bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-[var(--text-muted)]">
              {currentUser.role}
            </span>
          </div>
        )}

        {/* Theme toggle */}
        <div className="flex items-center bg-[var(--bg-elevated)] rounded-lg p-0.5 border border-[var(--border-subtle)]">
          {themeOptions.map(opt => {
            const Icon = opt.icon
            return (
              <button
                key={opt.value}
                onClick={() => onThemeChange(opt.value)}
                className={cn(
                  'p-1.5 rounded-md transition-all',
                  theme === opt.value
                    ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-sm'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                )}
                title={opt.value.charAt(0).toUpperCase() + opt.value.slice(1)}
              >
                <Icon className="w-3.5 h-3.5" />
              </button>
            )
          })}
        </div>

        {/* Logout */}
        {onLogout && (
          <button
            onClick={onLogout}
            className="p-1.5 rounded-md text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] transition-all"
            title="Sign out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        )}
      </div>
    </header>
  )
}
