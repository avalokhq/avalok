import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '../../lib/cn'

type Side = 'top' | 'bottom' | 'left' | 'right'

interface TooltipProps {
  content: React.ReactNode
  children: React.ReactNode
  side?: Side
  delay?: number
  className?: string
}

const GAP = 6

/** Hover/focus hint rendered in a portal. Wraps its child in an inline-flex span. */
export default function Tooltip({ content, children, side = 'top', delay = 350, className }: TooltipProps) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const anchorRef = useRef<HTMLSpanElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  function show() {
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setOpen(true), delay)
  }
  function hide() {
    clearTimeout(timer.current)
    setOpen(false)
  }

  useEffect(() => () => clearTimeout(timer.current), [])

  useLayoutEffect(() => {
    if (!open || !anchorRef.current) return
    const r = anchorRef.current.getBoundingClientRect()
    const map: Record<Side, { top: number; left: number }> = {
      top: { top: r.top - GAP, left: r.left + r.width / 2 },
      bottom: { top: r.bottom + GAP, left: r.left + r.width / 2 },
      left: { top: r.top + r.height / 2, left: r.left - GAP },
      right: { top: r.top + r.height / 2, left: r.right + GAP },
    }
    setPos(map[side])
  }, [open, side])

  const transform: Record<Side, string> = {
    top: 'translate(-50%, -100%)',
    bottom: 'translate(-50%, 0)',
    left: 'translate(-100%, -50%)',
    right: 'translate(0, -50%)',
  }

  if (content == null || content === '') return <>{children}</>

  return (
    <span
      ref={anchorRef}
      className="inline-flex"
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
      onMouseDown={hide}
    >
      {children}
      {open && pos && createPortal(
        <div
          role="tooltip"
          style={{ top: pos.top, left: pos.left, transform: transform[side] }}
          className={cn(
            'pointer-events-none fixed z-[100] max-w-xs rounded-control bg-fg px-2 py-1 text-xs font-medium text-canvas shadow-md animate-fade-in',
            className,
          )}
        >
          {content}
        </div>,
        document.body,
      )}
    </span>
  )
}
