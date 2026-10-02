import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '../../lib/cn'

interface PopoverProps {
  /** Render prop so the trigger can reflect the open state. */
  trigger: (props: { open: boolean; toggle: () => void }) => React.ReactNode
  /** Panel content; `close` dismisses the popover. */
  children: (close: () => void) => React.ReactNode
  align?: 'start' | 'end'
  /** Panel width in px. */
  width?: number
  label?: string
  className?: string
}

/** Floating panel anchored to a trigger. Portaled so it never clips inside scroll or overflow-hidden panes; outside click and Esc close it. */
export default function Popover({ trigger, children, align = 'start', width = 288, label, className }: PopoverProps) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const anchorRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    if (!open || !anchorRef.current) return
    const r = anchorRef.current.getBoundingClientRect()
    let left = align === 'end' ? r.right - width : r.left
    left = Math.max(8, Math.min(left, window.innerWidth - width - 8))
    const h = panelRef.current?.offsetHeight ?? 0
    const below = r.bottom + 6
    const top = below + h > window.innerHeight - 8 && r.top - h - 6 > 8 ? r.top - h - 6 : below
    setPos({ top, left })
  }, [open, align, width])

  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      const t = e.target as Node
      if (!panelRef.current?.contains(t) && !anchorRef.current?.contains(t)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setOpen(false)
        anchorRef.current?.querySelector<HTMLElement>('button')?.focus()
      }
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const close = () => setOpen(false)

  return (
    <div ref={anchorRef} className={cn('inline-flex', className)}>
      {trigger({ open, toggle: () => setOpen(o => !o) })}
      {open && createPortal(
        <div
          ref={panelRef}
          role="dialog"
          aria-label={label}
          style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999, width }}
          className="fixed z-[90] overflow-hidden rounded-card border border-line bg-surface-raised shadow-lg animate-scale-in"
        >
          {children(close)}
        </div>,
        document.body,
      )}
    </div>
  )
}
