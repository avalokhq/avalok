import { PanelRightClose, PanelRightOpen } from 'lucide-react'
import { cn } from '../../lib/cn'
import IconButton from './IconButton'

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
        <div className="absolute right-4 top-4 z-10 rounded-control border border-line bg-surface shadow-sm">
          <IconButton label="Show panel" tooltipSide="left" onClick={onToggle}>
            <PanelRightOpen className="size-4" />
          </IconButton>
        </div>
      )}
      <aside
        aria-label={title}
        className={cn(
          'flex shrink-0 flex-col overflow-hidden border-l border-line bg-surface transition-[width] duration-200',
          open ? width : 'w-0 border-l-0',
        )}
      >
        {open && (
          <>
            <div className="flex h-12 shrink-0 items-center justify-between border-b border-line px-4">
              <h3 className="text-sm font-semibold text-fg">{title}</h3>
              <div className="flex items-center gap-1">
                {actions}
                <IconButton label="Hide panel" tooltipSide="left" onClick={onToggle}>
                  <PanelRightClose className="size-4" />
                </IconButton>
              </div>
            </div>
            <div className="flex-1 overflow-auto">{children}</div>
          </>
        )}
      </aside>
    </>
  )
}
