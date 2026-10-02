import { cn } from '../../lib/cn'
import { toneSoft, toneText, type Tone } from '../../lib/statusTone'

interface EmptyStateProps {
  icon: React.ReactNode
  tone?: Tone
  /** @deprecated use `tone` */
  iconBg?: string
  title: string
  description?: React.ReactNode
  action?: React.ReactNode
  /** Smaller variant for use inside cards, tables and panels. */
  compact?: boolean
  className?: string
}

function legacyTone(iconBg: string): Tone {
  if (iconBg.includes('blue')) return 'info'
  if (iconBg.includes('emerald')) return 'success'
  if (iconBg.includes('amber')) return 'warning'
  if (iconBg.includes('red')) return 'danger'
  return 'accent'
}

export default function EmptyState({ icon, tone: toneProp, iconBg, title, description, action, compact, className }: EmptyStateProps) {
  const tone = toneProp ?? (iconBg ? legacyTone(iconBg) : 'accent')
  return (
    <div className={cn('flex flex-col items-center text-center', compact ? 'py-8' : 'py-16', className)}>
      <div className="relative mb-4">
        {!compact && <div aria-hidden className={cn('absolute -inset-4 rounded-full blur-2xl opacity-70', toneSoft[tone])} />}
        <div
          className={cn(
            'relative flex items-center justify-center rounded-card border border-line shadow-sm [&_svg]:size-5',
            compact ? 'size-10' : 'size-12',
            toneSoft[tone],
            toneText[tone],
          )}
        >
          {icon}
        </div>
      </div>
      <p className={cn('font-semibold text-fg', compact ? 'text-sm' : 'text-base')}>{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-fg-muted">{description}</p>}
      {action && <div className="mt-5 flex items-center gap-2">{action}</div>}
    </div>
  )
}
