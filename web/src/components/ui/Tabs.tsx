import { cn } from '../../lib/cn'

interface Tab {
  id: string
  label: string
  icon?: React.FC<{ className?: string }>
  count?: number
}

interface TabsProps {
  tabs: Tab[]
  active: string
  onChange: (id: string) => void
  /** `underline` for page-level navigation, `pill` for compact in-card switching. */
  variant?: 'underline' | 'pill'
  className?: string
}

export default function Tabs({ tabs, active, onChange, variant = 'underline', className }: TabsProps) {
  function onKey(e: React.KeyboardEvent, idx: number) {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
    e.preventDefault()
    const next = tabs[(idx + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length]
    onChange(next.id)
    const list = (e.currentTarget as HTMLElement).parentElement
    requestAnimationFrame(() => list?.querySelector<HTMLElement>('[aria-selected="true"]')?.focus())
  }

  const underline = variant === 'underline'

  return (
    <div
      role="tablist"
      className={cn(
        underline
          ? 'flex items-center gap-1 border-b border-line'
          : 'inline-flex items-center gap-0.5 rounded-control border border-line bg-surface-sunken p-0.5',
        className,
      )}
    >
      {tabs.map((t, idx) => {
        const Icon = t.icon
        const isActive = active === t.id
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            tabIndex={isActive ? 0 : -1}
            onClick={() => onChange(t.id)}
            onKeyDown={e => onKey(e, idx)}
            className={cn(
              'relative inline-flex cursor-pointer items-center gap-2 text-sm font-medium whitespace-nowrap transition-colors',
              underline
                ? cn(
                    'h-9 px-3 -mb-px border-b-2',
                    isActive ? 'border-accent text-fg' : 'border-transparent text-fg-muted hover:text-fg hover:border-line-strong',
                  )
                : cn(
                    'h-7 px-3 rounded-[4px]',
                    isActive ? 'bg-surface text-fg shadow-xs' : 'text-fg-muted hover:text-fg',
                  ),
            )}
          >
            {Icon && <Icon className={cn('size-4', isActive && underline && 'text-accent')} />}
            {t.label}
            {t.count != null && (
              <span className={cn(
                'rounded-full px-1.5 text-2xs tabular-nums',
                isActive ? 'bg-accent-soft text-accent' : 'bg-surface-sunken text-fg-muted',
              )}>
                {t.count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
