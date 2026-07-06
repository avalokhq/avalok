import { useState } from 'react'
import { Activity, Server, Wifi, X } from 'lucide-react'
import { cn } from '../../lib/cn'

interface StatusItem {
  name: string
  icon: React.FC<{ className?: string }>
  ok: boolean
}

interface Props {
  connected: boolean
}

export default function StatusIndicator({ connected }: Props) {
  const [open, setOpen] = useState(false)

  const items: StatusItem[] = [
    { name: 'Avalok Server', icon: Server, ok: true },
    { name: 'WebSocket', icon: Wifi, ok: connected },
  ]

  const allOk = items.every(i => i.ok)

  return (
    <>
      {/* Status dot */}
      <button
        onClick={() => setOpen(true)}
        className={cn(
          'fixed bottom-4 right-4 z-40 w-3 h-3 rounded-full shadow-[var(--shadow-sm)] transition-colors',
          allOk ? 'bg-[var(--accent-bright)] status-pulse' : 'bg-amber-400 animate-pulse'
        )}
        title="System status"
      />

      {/* Dialog */}
      {open && (
        <>
          <div className="fixed inset-0 z-50 bg-black/40" onClick={() => setOpen(false)} />
          <div className="fixed bottom-12 right-4 z-50 w-72 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-strong)] shadow-[var(--shadow-dialog)] overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-default)]">
              <div className="flex items-center gap-2 text-base text-[var(--text-primary)]">
                <Activity className="w-4 h-4" />
                System Status
              </div>
              <button
                onClick={() => setOpen(false)}
                className="p-1 rounded-md text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="p-2">
              {items.map(item => {
                const Icon = item.icon
                return (
                  <div key={item.name} className="flex items-center gap-3 px-3 py-2.5 rounded-lg">
                    <Icon className="w-4 h-4 text-[var(--text-muted)]" />
                    <span className="flex-1 text-sm text-[var(--text-secondary)]">{item.name}</span>
                    <span className={cn(
                      'w-2 h-2 rounded-full',
                      item.ok ? 'bg-[var(--accent-bright)] status-pulse' : 'bg-red-400'
                    )} />
                  </div>
                )
              })}
            </div>
          </div>
        </>
      )}
    </>
  )
}
