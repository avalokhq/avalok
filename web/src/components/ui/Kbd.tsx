import { cn } from '../../lib/cn'

export default function Kbd({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        'inline-flex h-5 min-w-5 items-center justify-center rounded-control border border-line bg-surface-sunken px-1.5 font-mono text-2xs text-fg-muted shadow-xs',
        className,
      )}
    >
      {children}
    </kbd>
  )
}
