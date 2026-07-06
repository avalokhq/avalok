import { cn } from '../../lib/cn'

interface StatItem {
  label: string
  value: number | string
  icon: React.ReactNode
  accent: string
  bg: string
  sub?: { label: string; value: number; color?: string }[]
}

interface StatsGridProps {
  items: StatItem[]
}

export default function StatsGrid({ items }: StatsGridProps) {
  return (
    <div className={cn(
      'grid gap-4 mb-8',
      items.length === 3 ? 'grid-cols-1 sm:grid-cols-3'
        : items.length === 2 ? 'grid-cols-1 sm:grid-cols-2'
          : 'grid-cols-1 max-w-sm',
    )}>
      {items.map(item => (
        <div key={item.label} className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4">
          <div className="flex items-center gap-3 mb-3">
            <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center shrink-0', item.bg, item.accent)}>
              {item.icon}
            </div>
            <span className={cn('text-sm font-medium', item.accent)}>{item.label}</span>
          </div>
          <div className="text-2xl font-semibold text-[var(--text-primary)] mb-2 tabular-nums">{item.value}</div>
          {item.sub && item.sub.length > 0 && (
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {item.sub.map(s => (
                <div key={s.label} className="flex items-center gap-1.5 text-xs">
                  <span className="text-[var(--text-muted)]">{s.label}</span>
                  <span className={cn('font-medium tabular-nums', s.color || 'text-[var(--text-primary)]')}>{s.value}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
