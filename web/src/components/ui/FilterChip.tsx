import { cn } from '../../lib/cn'
import { toneDot, type Tone } from '../../lib/statusTone'

interface FilterChipProps {
  label: React.ReactNode
  count?: number
  active: boolean
  onToggle: () => void
  /** Leading color dot (e.g. log level). */
  tone?: Tone
  /** Custom leading element, e.g. <SourceDot />. */
  leading?: React.ReactNode
  className?: string
}

/** Toggleable facet filter with a live count. */
export default function FilterChip({ label, count, active, onToggle, tone, leading, className }: FilterChipProps) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onToggle}
      className={cn(
        'inline-flex h-7 max-w-full cursor-pointer items-center gap-1.5 rounded-control border px-2 text-xs font-medium transition-colors',
        active
          ? 'border-accent-line bg-accent-soft text-fg'
          : 'border-line bg-surface text-fg-muted hover:bg-hover hover:text-fg',
        className,
      )}
    >
      {leading ?? (tone && <span aria-hidden className={cn('size-1.5 shrink-0 rounded-full', toneDot[tone])} />)}
      <span className="truncate">{label}</span>
      {count != null && <span className="ml-0.5 tabular-nums text-fg-muted">{count.toLocaleString()}</span>}
    </button>
  )
}
