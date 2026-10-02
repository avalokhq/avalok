import { cn } from '../../lib/cn'

export type DotStatus = 'live' | 'ok' | 'warn' | 'error' | 'idle'

const COLORS: Record<DotStatus, string> = {
  live: 'bg-success',
  ok: 'bg-success',
  warn: 'bg-warning',
  error: 'bg-danger',
  idle: 'bg-fg-faint',
}

interface StatusDotProps {
  status: DotStatus
  label?: React.ReactNode
  size?: 'sm' | 'md'
  className?: string
}

/** Small status indicator. `live` adds a soft ping ring. */
export default function StatusDot({ status, label, size = 'sm', className }: StatusDotProps) {
  const dot = (
    <span className={cn('relative inline-flex shrink-0', size === 'sm' ? 'size-2' : 'size-2.5')}>
      {status === 'live' && (
        <span aria-hidden className={cn('absolute inset-0 rounded-full opacity-60 motion-safe:animate-ping', COLORS[status])} />
      )}
      <span className={cn('relative inline-flex size-full rounded-full', COLORS[status])} />
    </span>
  )
  if (!label) return <span className={cn('inline-flex', className)} role="img" aria-label={status}>{dot}</span>
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-xs font-medium text-fg-secondary', className)}>
      {dot}
      {label}
    </span>
  )
}
