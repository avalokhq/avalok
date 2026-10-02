import { cn } from '../../lib/cn'

const ringSizes = {
  sm: 'size-4 border-2',
  md: 'size-6 border-2',
  lg: 'size-8 border-[2.5px]',
}

/** Inline spinning ring that inherits nothing; use inside buttons, rows, toolbars. */
export function SpinnerIcon({ size = 'sm', className }: { size?: keyof typeof ringSizes; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn('inline-block shrink-0 rounded-full border-line-strong border-t-accent animate-spin', ringSizes[size], className)}
    />
  )
}

interface SpinnerProps {
  label?: string
  size?: keyof typeof ringSizes
  className?: string
}

/** Centered spinner for short waits. Prefer Skeleton for page/content loading. */
export default function Spinner({ label, size = 'lg', className }: SpinnerProps) {
  return (
    <div role="status" className={cn('flex-1 flex items-center justify-center py-12', className)}>
      <div className="flex flex-col items-center gap-3">
        <SpinnerIcon size={size} />
        {label ? <span className="text-sm text-fg-muted">{label}</span> : <span className="sr-only">Loading</span>}
      </div>
    </div>
  )
}
