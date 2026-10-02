import { cn } from '../../lib/cn'
import Tooltip from './Tooltip'

export interface Segment<V extends string> {
  value: V
  label?: React.ReactNode
  icon?: React.ReactNode
  /** Tooltip + aria-label; required for icon-only segments. */
  title?: string
  disabled?: boolean
}

interface SegmentedControlProps<V extends string> {
  options: Segment<V>[]
  value: V
  onChange: (value: V) => void
  size?: 'sm' | 'md'
  /** Accessible name for the group. */
  label?: string
  className?: string
}

/** Pill switch for 2–4 mutually exclusive options (view mode, theme, input mode). */
export default function SegmentedControl<V extends string>({
  options,
  value,
  onChange,
  size = 'md',
  label,
  className,
}: SegmentedControlProps<V>) {
  function onKey(e: React.KeyboardEvent, idx: number) {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
    e.preventDefault()
    const enabled = options.filter(o => !o.disabled)
    const cur = enabled.findIndex(o => o.value === options[idx].value)
    const next = enabled[(cur + (e.key === 'ArrowRight' ? 1 : -1) + enabled.length) % enabled.length]
    onChange(next.value)
    const group = (e.currentTarget as HTMLElement).closest('[role="radiogroup"]')
    requestAnimationFrame(() => group?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus())
  }

  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn('inline-flex items-center gap-0.5 rounded-control border border-line bg-surface-sunken p-0.5', className)}
    >
      {options.map((o, idx) => {
        const active = o.value === value
        const iconOnly = !o.label
        const btn = (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={o.title}
            tabIndex={active ? 0 : -1}
            disabled={o.disabled}
            onClick={() => onChange(o.value)}
            onKeyDown={e => onKey(e, idx)}
            className={cn(
              'inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-[4px] font-medium transition-colors',
              'disabled:pointer-events-none disabled:opacity-40 [&_svg]:size-3.5 [&_svg]:shrink-0',
              size === 'sm' ? 'h-6 text-xs' : 'h-7 text-sm',
              iconOnly ? (size === 'sm' ? 'w-6' : 'w-7') : 'px-2.5',
              active ? 'bg-surface text-fg shadow-xs' : 'text-fg-muted hover:text-fg',
            )}
          >
            {o.icon}
            {o.label}
          </button>
        )
        return o.title && iconOnly ? <Tooltip key={o.value} content={o.title}>{btn}</Tooltip> : btn
      })}
    </div>
  )
}
