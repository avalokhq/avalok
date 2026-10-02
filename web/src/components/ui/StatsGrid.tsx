import { cn } from '../../lib/cn'
import { toneSoft, toneText, type Tone } from '../../lib/statusTone'

export interface StatItem {
  label: string
  value: number | string
  icon: React.ReactNode
  tone?: Tone
  /** @deprecated use `tone` */
  accent?: string
  /** @deprecated use `tone` */
  bg?: string
  sub?: { label: string; value: number; color?: string; tone?: Tone }[]
  onClick?: () => void
  /** Pressed state when the card acts as a filter. */
  active?: boolean
}

export function StatCard({ label, value, icon, tone = 'accent', sub, onClick, active }: StatItem) {
  const Comp = onClick ? 'button' : 'div'
  return (
    <Comp
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      aria-pressed={onClick ? !!active : undefined}
      className={cn(
        'rounded-card border bg-surface p-5 text-left shadow-sm',
        active ? 'border-accent-line bg-selected ring-3 ring-accent-soft' : 'border-line',
        onClick && 'cursor-pointer transition-[box-shadow,border-color,transform] duration-150 hover:-translate-y-px hover:border-line-strong hover:shadow-md',
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-fg-secondary">{label}</span>
        <span className={cn('flex size-8 items-center justify-center rounded-control [&_svg]:size-4', toneSoft[tone], toneText[tone])}>
          {icon}
        </span>
      </div>
      <div className="mt-2 text-display font-semibold tracking-tight text-fg tabular-nums">{value}</div>
      {sub && sub.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-line pt-3">
          {sub.map(s => (
            <div key={s.label} className="flex items-center gap-1.5 text-xs">
              <span className="text-fg-muted">{s.label}</span>
              <span className={cn('font-medium tabular-nums', s.tone ? toneText[s.tone] : s.color || 'text-fg')}>{s.value}</span>
            </div>
          ))}
        </div>
      )}
    </Comp>
  )
}

function legacyTone(accent?: string): Tone {
  if (!accent) return 'accent'
  if (accent.includes('blue') || accent.includes('sky')) return 'info'
  if (accent.includes('emerald') || accent.includes('green')) return 'success'
  if (accent.includes('amber') || accent.includes('yellow')) return 'warning'
  if (accent.includes('red')) return 'danger'
  return 'accent'
}

export default function StatsGrid({ items, className }: { items: StatItem[]; className?: string }) {
  return (
    <div className={cn(
      'mb-8 grid gap-4',
      items.length >= 4 ? 'grid-cols-2 lg:grid-cols-4'
        : items.length === 3 ? 'grid-cols-1 sm:grid-cols-3'
          : items.length === 2 ? 'grid-cols-1 sm:grid-cols-2'
            : 'grid-cols-1 max-w-sm',
      className,
    )}>
      {items.map(item => (
        <StatCard key={item.label} {...item} tone={item.tone ?? legacyTone(item.accent)} />
      ))}
    </div>
  )
}
