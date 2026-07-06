import { cn } from '../../lib/cn'

interface Tab {
  id: string
  label: string
  icon?: React.FC<{ className?: string }>
}

interface TabsProps {
  tabs: Tab[]
  active: string
  onChange: (id: string) => void
}

export default function Tabs({ tabs, active, onChange }: TabsProps) {
  return (
    <div className="flex gap-1 bg-[var(--bg-elevated)] rounded-lg p-1 w-fit border border-[var(--border-subtle)]">
      {tabs.map(t => {
        const Icon = t.icon
        return (
          <button
            key={t.id}
            onClick={() => onChange(t.id)}
            className={cn(
              'flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all',
              active === t.id
                ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-[var(--shadow-sm)]'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            )}
          >
            {Icon && <Icon className="w-4 h-4" />}
            {t.label}
          </button>
        )
      })}
    </div>
  )
}
