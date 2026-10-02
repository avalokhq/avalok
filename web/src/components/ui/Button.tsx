import { cn } from '../../lib/cn'

const base =
  'inline-flex items-center justify-center font-medium rounded-control whitespace-nowrap select-none shrink-0 cursor-pointer ' +
  'transition-colors duration-150 active:translate-y-px disabled:opacity-50 disabled:pointer-events-none'

const variants = {
  primary: 'bg-accent-solid text-accent-solid-fg shadow-xs hover:bg-accent-solid-hover',
  secondary: 'bg-surface text-fg border border-line-strong shadow-xs hover:bg-hover',
  subtle: 'bg-surface-sunken text-fg-secondary border border-line hover:bg-hover hover:text-fg',
  ghost: 'text-fg-secondary hover:bg-hover hover:text-fg',
  danger: 'bg-danger-soft text-danger border border-danger-line hover:bg-danger hover:text-surface',
  /** Solid red; only for the final confirm of a destructive action. */
  destructive: 'bg-danger text-canvas shadow-xs hover:brightness-110',
  link: 'text-accent hover:underline underline-offset-4 active:translate-y-0',
}

const sizes = {
  sm: 'h-7 px-2.5 gap-1.5 text-xs',
  md: 'h-8 px-3 gap-2 text-sm',
  lg: 'h-9 px-4 gap-2 text-sm',
}

const iconOnlySizes = {
  sm: 'size-7',
  md: 'size-8',
  lg: 'size-9',
}

export type ButtonVariant = keyof typeof variants
export type ButtonSize = keyof typeof sizes

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
  leftIcon?: React.ReactNode
  rightIcon?: React.ReactNode
  /** Square button holding only an icon. Prefer IconButton, which adds a tooltip. */
  iconOnly?: boolean
}

export default function Button({
  variant = 'primary',
  size = 'md',
  loading,
  leftIcon,
  rightIcon,
  iconOnly,
  children,
  className,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        base,
        variants[variant],
        variant !== 'link' && (iconOnly ? iconOnlySizes[size] : sizes[size]),
        variant === 'link' && 'gap-1.5 text-sm',
        className,
      )}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? (
        <span aria-hidden className="size-3.5 shrink-0 rounded-full border-2 border-current border-t-transparent animate-spin" />
      ) : leftIcon}
      {children}
      {rightIcon}
    </button>
  )
}
