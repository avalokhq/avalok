import { Sun, Moon, Monitor, ChevronRight, LogOut, Search } from 'lucide-react'
import { AvalokWordmark } from '../ui/AvalokLogo'
import SegmentedControl from '../ui/SegmentedControl'
import Dropdown from '../ui/Dropdown'
import Badge from '../ui/Badge'
import Kbd from '../ui/Kbd'
import type { AuthUser } from '../../lib/api'
import type { Theme } from '../../lib/useTheme'

interface Props {
  theme: Theme
  onThemeChange: (t: Theme) => void
  breadcrumbs?: { label: string; onClick?: () => void }[]
  onNavigateHome?: () => void
  onLogout?: () => void
  currentUser?: AuthUser | null
  onSearchOpen?: () => void
}

function initials(name: string) {
  const parts = name.split(/[\s._-]+/).filter(Boolean)
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?'
}

export default function Header({ theme, onThemeChange, breadcrumbs, onNavigateHome, onLogout, currentUser, onSearchOpen }: Props) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-4 border-b border-line bg-surface px-4">
      <button
        type="button"
        onClick={onNavigateHome}
        aria-label="Avalok home"
        className="flex shrink-0 cursor-pointer items-center rounded-control px-1 py-1 transition-opacity hover:opacity-80"
      >
        <AvalokWordmark height={18} />
      </button>

      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1 border-l border-line pl-4 text-sm">
          {breadcrumbs.map((crumb, i) => {
            const last = i === breadcrumbs.length - 1
            return (
              <span key={i} className="flex min-w-0 items-center gap-1">
                {i > 0 && <ChevronRight aria-hidden className="size-3.5 shrink-0 text-fg-faint" />}
                {crumb.onClick && !last ? (
                  <button
                    type="button"
                    onClick={crumb.onClick}
                    className="cursor-pointer truncate rounded-control px-1 text-fg-muted transition-colors hover:text-fg"
                  >
                    {crumb.label}
                  </button>
                ) : (
                  <span aria-current={last ? 'page' : undefined} className="truncate px-1 font-medium text-fg">{crumb.label}</span>
                )}
              </span>
            )
          })}
        </nav>
      )}

      <div className="ml-auto flex shrink-0 items-center gap-2">
        {onSearchOpen && (
          <button
            type="button"
            onClick={onSearchOpen}
            className="hidden h-8 w-60 cursor-pointer items-center gap-2 rounded-control border border-line bg-surface-sunken pl-2.5 pr-1.5 text-sm text-fg-faint transition-colors hover:border-line-strong hover:text-fg-muted md:flex"
          >
            <Search className="size-4 shrink-0" />
            <span className="flex-1 text-left">Search…</span>
            <Kbd>Ctrl K</Kbd>
          </button>
        )}

        <SegmentedControl
          label="Theme"
          size="sm"
          value={theme}
          onChange={onThemeChange}
          options={[
            { value: 'light', icon: <Sun />, title: 'Light' },
            { value: 'dark', icon: <Moon />, title: 'Dark' },
            { value: 'auto', icon: <Monitor />, title: 'Match system' },
          ]}
        />

        {currentUser && (
          <Dropdown
            width={224}
            header={
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-fg">{currentUser.username}</div>
                {currentUser.email && <div className="truncate text-xs text-fg-muted">{currentUser.email}</div>}
                <Badge tone={currentUser.role === 'admin' ? 'accent' : 'neutral'} size="sm" className="mt-2 capitalize">
                  {currentUser.role}
                </Badge>
              </div>
            }
            items={onLogout ? [{ label: 'Sign out', icon: <LogOut />, onClick: onLogout }] : []}
            trigger={
              <button
                type="button"
                aria-label={`Account: ${currentUser.username}`}
                className="flex size-8 cursor-pointer items-center justify-center rounded-full border border-accent-line bg-accent-soft text-xs font-semibold text-accent transition-shadow hover:shadow-sm"
              >
                {initials(currentUser.username)}
              </button>
            }
          />
        )}
      </div>
    </header>
  )
}
