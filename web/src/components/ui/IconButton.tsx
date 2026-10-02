import { cn } from '../../lib/cn'
import Tooltip from './Tooltip'

const variants = {
  default: 'text-fg-muted hover:text-fg hover:bg-hover',
  accent: 'text-fg-muted hover:text-accent hover:bg-accent-soft',
  danger: 'text-fg-muted hover:text-danger hover:bg-danger-soft',
  success: 'text-success hover:bg-success-soft',
  warning: 'text-warning hover:bg-warning-soft',
}

const sizes = {
  xs: 'size-6',
  sm: 'size-7',
  md: 'size-8',
}

interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof variants
  size?: keyof typeof sizes
  /** Accessible name, also shown as a tooltip. Always provide one. */
  label?: string
  /** Toggle buttons: highlight when on. */
  active?: boolean
  tooltipSide?: 'top' | 'bottom' | 'left' | 'right'
}

export default function IconButton({
  variant = 'default',
  size = 'sm',
  label,
  active,
  tooltipSide,
  className,
  children,
  title,
  ...props
}: IconButtonProps) {
  const button = (
    <button
      type="button"
      aria-label={label ?? title}
      aria-pressed={active}
      title={label ? undefined : title}
      className={cn(
        'inline-flex items-center justify-center rounded-control shrink-0 cursor-pointer transition-colors duration-150',
        'disabled:opacity-40 disabled:pointer-events-none',
        sizes[size],
        active ? 'text-accent bg-accent-soft hover:bg-accent-soft' : variants[variant],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  )
  return label ? <Tooltip content={label} side={tooltipSide}>{button}</Tooltip> : button
}
