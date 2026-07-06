import { PanelRightClose, PanelRightOpen } from 'lucide-react'
import { cn } from '../../lib/cn'

interface SidePanelProps {
  title: string
  open: boolean
  onToggle: () => void
  actions?: React.ReactNode
  children: React.ReactNode
  width?: string
}

export default function SidePanel({ title, open, onToggle, actions, children, width = 'w-[420px]' }: SidePanelProps) {
  return (
    <>
      {!open && (
        <button
          onClick={onToggle}
          className="absolute right-4 top-4 z-10 p-2 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-default)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:border-[var(--text-accent)] transition-all"
          title="Show panel"
        >
          <PanelRightOpen className="w-4 h-4" />
        </button>
      )}
      <div className={cn(
        'shrink-0 border-l border-[var(--border-strong)] bg-[var(--bg-surface)] flex flex-col overflow-hidden transition-all duration-200',
        open ? width : 'w-0'
      )}>
        {open && (
          <>
            <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-subtle)] shrink-0">
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">{title}</h3>
              <div className="flex items-center gap-1">
                {actions}
                <button
                  onClick={onToggle}
                  className="p-1.5 rounded-md text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-all"
                  title="Hide panel"
                >
                  <PanelRightClose className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-auto">
              {children}
            </div>
          </>
        )}
      </div>
    </>
  )
}
