import { cn } from '../../lib/cn'

interface SpinnerProps {
  label?: string
  className?: string
}

export default function Spinner({ label, className }: SpinnerProps) {
  return (
    <div className={cn('flex-1 flex items-center justify-center', className)}>
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-[var(--text-muted)] border-t-[var(--text-accent)] rounded-full animate-spin" />
        {label && <span className="text-sm text-[var(--text-secondary)]">{label}</span>}
      </div>
    </div>
  )
}
