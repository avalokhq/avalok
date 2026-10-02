import { cn } from '../../lib/cn'

interface SettingsRowProps {
  label: React.ReactNode
  description?: React.ReactNode
  settingId?: string
  highlight?: boolean
  children: React.ReactNode
}

/** Label/description on the left, control on the right. Stack inside a Card with padding="none" or a Section. */
export default function SettingsRow({ label, description, settingId, highlight, children }: SettingsRowProps) {
  return (
    <div
      data-setting-id={settingId}
      className={cn(
        'flex items-center justify-between gap-6 border-b border-line py-4 last:border-b-0',
        highlight && 'animate-setting-blink rounded-control',
      )}
    >
      <div className="min-w-0">
        <div className="text-sm font-medium text-fg">{label}</div>
        {description && <div className="mt-0.5 text-xs text-fg-muted">{description}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}
