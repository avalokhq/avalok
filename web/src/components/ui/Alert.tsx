import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react'
import { cn } from '../../lib/cn'
import { toneLine, toneSoft, toneText } from '../../lib/statusTone'

type AlertTone = 'danger' | 'success' | 'warning' | 'info'

const LEGACY: Record<string, AlertTone> = { error: 'danger', success: 'success', warning: 'warning', info: 'info' }

const ICONS: Record<AlertTone, React.FC<{ className?: string }>> = {
  danger: XCircle,
  success: CheckCircle2,
  warning: AlertTriangle,
  info: Info,
}

interface AlertProps {
  tone?: AlertTone
  /** @deprecated use `tone` */
  variant?: 'error' | 'success' | 'warning' | 'info'
  title?: string
  /** Trailing action, e.g. a Retry button. */
  action?: React.ReactNode
  children?: React.ReactNode
  className?: string
}

export default function Alert({ tone, variant = 'error', title, action, children, className }: AlertProps) {
  const t = tone ?? LEGACY[variant]
  const Icon = ICONS[t]
  return (
    <div
      role={t === 'danger' ? 'alert' : 'status'}
      className={cn('flex items-start gap-2.5 rounded-card border px-3 py-2.5 text-sm', toneSoft[t], toneLine[t], className)}
    >
      <Icon className={cn('size-4 shrink-0 mt-0.5', toneText[t])} />
      <div className="min-w-0 flex-1">
        {title && <div className={cn('font-medium', toneText[t])}>{title}</div>}
        {children && <div className={cn('break-words', title ? 'text-fg-secondary mt-0.5' : toneText[t])}>{children}</div>}
      </div>
      {action && <div className="shrink-0 -my-0.5">{action}</div>}
    </div>
  )
}
