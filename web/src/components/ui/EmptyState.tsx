import { cn } from '../../lib/cn'

interface EmptyStateProps {
  icon: React.ReactNode
  iconBg?: string
  title: string
  description?: string
  action?: React.ReactNode
  className?: string
}

export default function EmptyState({ icon, iconBg = 'bg-[var(--bg-elevated)]', title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn('text-center py-12', className)}>
      <div className={cn('w-14 h-14 mx-auto mb-4 rounded-2xl flex items-center justify-center', iconBg)}>
        {icon}
      </div>
      <p className="text-sm font-medium text-[var(--text-secondary)] mb-1">{title}</p>
      {description && <p className="text-xs text-[var(--text-muted)]">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
