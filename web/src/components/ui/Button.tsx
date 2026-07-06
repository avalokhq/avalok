import { cn } from '../../lib/cn'

const base = 'inline-flex items-center justify-center gap-2 font-medium transition-all duration-150 disabled:opacity-50 disabled:pointer-events-none shrink-0 cursor-pointer'

const variants = {
  primary: 'bg-[var(--accent-bright)] text-white hover:opacity-90 rounded-lg',
  secondary: 'border border-[var(--border-default)] text-[var(--text-secondary)] hover:border-[var(--text-accent)] hover:text-[var(--text-accent)] rounded-lg',
  ghost: 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] rounded-lg',
  danger: 'text-red-400 hover:bg-red-400/10 rounded-lg',
  link: 'text-[var(--text-accent)] hover:underline p-0',
}

const sizes = {
  sm: 'text-xs px-2.5 py-1',
  md: 'text-sm px-3 py-1.5',
  lg: 'text-sm px-4 py-2',
}

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof variants
  size?: keyof typeof sizes
  loading?: boolean
}

export default function Button({ variant = 'primary', size = 'md', loading, children, className, disabled, ...props }: ButtonProps) {
  return (
    <button
      className={cn(base, variants[variant], variant !== 'link' && sizes[size], className)}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />}
      {children}
    </button>
  )
}
