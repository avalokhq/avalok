import { ChevronRight } from 'lucide-react'
import { cn } from '../../lib/cn'

interface TreeItemProps {
  label: React.ReactNode
  icon?: React.ReactNode
  /** Nesting level, 0-based; indents 12px per level. */
  depth?: number
  /** Omit for leaf rows; true/false shows a chevron. */
  expanded?: boolean
  onToggle?: () => void
  onSelect?: () => void
  selected?: boolean
  count?: number
  /** Trailing status, e.g. <StatusDot />. */
  status?: React.ReactNode
  /** Trailing actions shown on hover/focus. */
  actions?: React.ReactNode
  title?: string
  className?: string
}

/** Row in a navigation tree (sources, files, resources). */
export default function TreeItem({
  label,
  icon,
  depth = 0,
  expanded,
  onToggle,
  onSelect,
  selected,
  count,
  status,
  actions,
  title,
  className,
}: TreeItemProps) {
  const branch = expanded !== undefined
  function activate() {
    if (onSelect) onSelect()
    else onToggle?.()
  }
  return (
    <div
      role="treeitem"
      aria-expanded={branch ? expanded : undefined}
      aria-selected={selected || undefined}
      tabIndex={0}
      title={title}
      onClick={activate}
      onKeyDown={e => {
        if (e.target !== e.currentTarget) return
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate() }
        else if (e.key === 'ArrowRight' && branch && !expanded) { e.preventDefault(); onToggle?.() }
        else if (e.key === 'ArrowLeft' && branch && expanded) { e.preventDefault(); onToggle?.() }
      }}
      style={{ paddingLeft: 8 + depth * 12 }}
      className={cn(
        'group relative flex h-8 cursor-pointer select-none items-center gap-1.5 rounded-control pr-2 text-sm transition-colors',
        selected ? 'bg-selected text-fg' : 'text-fg-secondary hover:bg-hover hover:text-fg',
        className,
      )}
    >
      {selected && <span aria-hidden className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-accent" />}
      {branch ? (
        <button
          type="button"
          tabIndex={-1}
          aria-label={expanded ? 'Collapse' : 'Expand'}
          onClick={e => { e.stopPropagation(); onToggle?.() }}
          className="-ml-1 flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-[4px] text-fg-muted hover:text-fg"
        >
          <ChevronRight className={cn('size-3.5 transition-transform duration-150', expanded && 'rotate-90')} />
        </button>
      ) : (
        <span aria-hidden className="w-4 shrink-0" />
      )}
      {icon && <span className="flex shrink-0 items-center text-fg-muted [&_svg]:size-4">{icon}</span>}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {actions && (
        <span className="hidden shrink-0 items-center gap-0.5 group-focus-within:flex group-hover:flex" onClick={e => e.stopPropagation()}>
          {actions}
        </span>
      )}
      {count != null && <span className="shrink-0 text-2xs tabular-nums text-fg-muted">{count}</span>}
      {status}
    </div>
  )
}
