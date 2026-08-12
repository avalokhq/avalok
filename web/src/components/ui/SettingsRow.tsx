import { cn } from '../../lib/cn'

interface SettingsRowProps {
  label: string
  description?: string
  settingId?: string
  highlight?: boolean
  children: React.ReactNode
}

export default function SettingsRow({ label, description, settingId, highlight, children }: SettingsRowProps) {
  return (
    <div
      data-setting-id={settingId}
      className={cn(
        'flex items-center justify-between py-4 border-b border-[var(--border-subtle)] last:border-b-0 rounded-lg transition-colors',
        highlight && 'animate-setting-blink'
      )}
    >
      <div className="mr-4 pl-1">
        <div className="text-sm font-medium text-[var(--text-primary)]">{label}</div>
        {description && <div className="text-xs text-[var(--text-muted)] mt-0.5">{description}</div>}
      </div>
      <div className="shrink-0 pr-1">{children}</div>
    </div>
  )
}
