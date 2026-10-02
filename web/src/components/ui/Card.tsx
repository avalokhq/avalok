import { cn } from '../../lib/cn'

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Clickable look: lifts on hover. Implied by onClick, which also makes it keyboard-focusable. */
  interactive?: boolean
  /** @deprecated use `interactive` */
  hover?: boolean
  selected?: boolean
  padding?: 'none' | 'sm' | 'md' | 'lg'
}

const paddings = {
  none: '',
  sm: 'p-3',
  md: 'p-4',
  lg: 'p-5',
}

export default function Card({
  interactive,
  hover = false,
  selected = false,
  padding = 'md',
  className,
  children,
  onClick,
  onKeyDown,
  ...props
}: CardProps) {
  const isInteractive = interactive || hover || !!onClick
  return (
    <div
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={e => {
        onKeyDown?.(e)
        if (onClick && e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault()
          e.currentTarget.click()
        }
      }}
      className={cn(
        'rounded-card border bg-surface shadow-sm',
        selected ? 'border-accent-line bg-selected' : 'border-line',
        isInteractive && 'cursor-pointer transition-[box-shadow,border-color,transform] duration-150 hover:-translate-y-px hover:border-line-strong hover:shadow-md',
        paddings[padding],
        className,
      )}
      {...props}
    >
      {children}
    </div>
  )
}

interface CardHeaderProps {
  title: React.ReactNode
  description?: React.ReactNode
  icon?: React.ReactNode
  actions?: React.ReactNode
  className?: string
}

export function CardHeader({ title, description, icon, actions, className }: CardHeaderProps) {
  return (
    <div className={cn('flex items-start gap-3', className)}>
      {icon}
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold text-fg">{title}</div>
        {description && <div className="mt-0.5 text-xs text-fg-muted">{description}</div>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-1">{actions}</div>}
    </div>
  )
}

export function CardFooter({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('mt-4 flex items-center gap-2 border-t border-line pt-3 text-xs text-fg-muted', className)}>
      {children}
    </div>
  )
}
