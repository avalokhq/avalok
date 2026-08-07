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
    <header className="h-14 shrink-0 flex items-center px-5 gap-4 brand-header">
      {/* Logo */}
      <button onClick={onNavigateHome} className="cursor-pointer hover:opacity-70 transition-opacity shrink-0">
        <AvalokWordmark height={22} forceInvert />
      </button>

      {/* Breadcrumbs */}
      {breadcrumbs && breadcrumbs.length > 0 && (
        <>
          <div className="w-px h-5 bg-white/20" />
          <nav className="flex items-center gap-1 text-sm">
            {breadcrumbs.map((crumb, i) => (
              <span key={i} className="flex items-center gap-1">
                {i > 0 && <ChevronRight className="w-3.5 h-3.5 text-white/40" />}
                {crumb.onClick ? (
                  <button
                    onClick={crumb.onClick}
                    className="text-white/70 hover:text-white transition-colors"
                  >
                    {crumb.label}
                  </button>
                ) : (
                  <span className="text-white font-medium">{crumb.label}</span>
                )}
              </span>
            ))}
          </nav>
        </>
      )}

      <div className="ml-auto flex items-center gap-3">
        {/* Connection status */}
        {connected !== undefined && (
          <div className="flex items-center gap-1.5 text-xs text-white/70">
            <span className={cn(
              'w-1.5 h-1.5 rounded-full',
              connected ? 'bg-white status-pulse' : 'bg-red-400'
            )} />
            {connected ? 'Connected' : 'Disconnected'}
          </div>
        )}

        {/* Current user info */}
        {currentUser && (
          <div className="flex items-center gap-1.5 text-xs text-white/70">
            <span className="font-medium text-white">{currentUser.username}</span>
            <span className="px-1.5 py-0.5 rounded bg-white/10 border border-white/15 text-white/60">
              {currentUser.role}
            </span>
          </div>
        )}

        {/* Theme toggle */}
        <div className="flex items-center bg-white/10 rounded-lg p-0.5 border border-white/15">
          {themeOptions.map(opt => {
            const Icon = opt.icon
            return (
              <button
                key={opt.value}
                onClick={() => onThemeChange(opt.value)}
                className={cn(
                  'p-1.5 rounded-md transition-all',
                  theme === opt.value
                    ? 'bg-white/20 text-white shadow-sm'
                    : 'text-white/40 hover:text-white/70'
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
            className="p-1.5 rounded-md text-white/40 hover:text-white hover:bg-white/10 transition-all"
            title="Sign out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        )}
      </div>
    </header>
  )
}
