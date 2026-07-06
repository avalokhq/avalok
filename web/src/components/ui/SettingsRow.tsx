interface SettingsRowProps {
  label: string
  description?: string
  children: React.ReactNode
}

export default function SettingsRow({ label, description, children }: SettingsRowProps) {
  return (
    <div className="flex items-center justify-between py-4 border-b border-[var(--border-subtle)] last:border-b-0">
      <div className="mr-4">
        <div className="text-sm font-medium text-[var(--text-primary)]">{label}</div>
        {description && <div className="text-xs text-[var(--text-muted)] mt-0.5">{description}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}
