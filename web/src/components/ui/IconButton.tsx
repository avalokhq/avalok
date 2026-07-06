import { cn } from '../../lib/cn'

const variants = {
  default: 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]',
  accent: 'text-[var(--text-muted)] hover:text-[var(--text-accent)] hover:bg-[var(--bg-hover)]',
  danger: 'text-[var(--text-muted)] hover:text-red-400 hover:bg-red-400/10',
  success: 'text-emerald-400 hover:bg-emerald-400/10',
  warning: 'text-amber-400 hover:bg-amber-400/10',
}

interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof variants
}

export default function IconButton({ variant = 'default', className, children, ...props }: IconButtonProps) {
  return (
    <button
      className={cn('p-1.5 rounded-md transition-all shrink-0', variants[variant], className)}
      {...props}
    >
      {children}
    </button>
  )
}
