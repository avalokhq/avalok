import { cn } from '../../lib/cn'

const styles = {
  error: 'bg-red-500/10 border-red-500/20 text-red-400',
  success: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400',
  warning: 'bg-amber-500/10 border-amber-500/20 text-amber-300',
  info: 'bg-blue-500/10 border-blue-500/20 text-blue-400',
}

interface AlertProps {
  variant?: keyof typeof styles
  children: React.ReactNode
  className?: string
}

export default function Alert({ variant = 'error', children, className }: AlertProps) {
  return (
    <div className={cn('px-3 py-2 rounded-lg border text-sm', styles[variant], className)}>
      {children}
    </div>
  )
}
