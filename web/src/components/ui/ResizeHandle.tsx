import { useRef } from 'react'
import { cn } from '../../lib/cn'

interface ResizeHandleProps {
  /** `vertical` = a vertical bar between side-by-side panes (drags horizontally). */
  orientation?: 'vertical' | 'horizontal'
  /** Called with the pointer delta in px since the last call. */
  onResize: (delta: number) => void
  onResizeEnd?: () => void
  /** Keyboard step in px. */
  step?: number
  label?: string
  className?: string
}

/** Draggable + keyboard-resizable splitter between panes. */
export default function ResizeHandle({
  orientation = 'vertical',
  onResize,
  onResizeEnd,
  step = 16,
  label = 'Resize',
  className,
}: ResizeHandleProps) {
  const last = useRef(0)
  const vertical = orientation === 'vertical'

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    last.current = vertical ? e.clientX : e.clientY
    document.body.style.cursor = vertical ? 'col-resize' : 'row-resize'
    document.body.style.userSelect = 'none'
  }
  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return
    const pos = vertical ? e.clientX : e.clientY
    const delta = pos - last.current
    if (delta !== 0) {
      last.current = pos
      onResize(delta)
    }
  }
  function onPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return
    e.currentTarget.releasePointerCapture(e.pointerId)
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
    onResizeEnd?.()
  }

  return (
    <div
      role="separator"
      aria-orientation={orientation}
      aria-label={label}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onKeyDown={e => {
        const dec = vertical ? 'ArrowLeft' : 'ArrowUp'
        const inc = vertical ? 'ArrowRight' : 'ArrowDown'
        if (e.key === dec || e.key === inc) {
          e.preventDefault()
          onResize(e.key === inc ? step : -step)
          onResizeEnd?.()
        }
      }}
      className={cn(
        'group relative z-10 flex shrink-0 touch-none items-center justify-center',
        vertical ? 'w-1.5 -mx-[3px] cursor-col-resize' : 'h-1.5 -my-[3px] cursor-row-resize',
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          'rounded-full bg-line transition-colors group-hover:bg-accent group-focus-visible:bg-accent group-active:bg-accent',
          vertical ? 'h-full w-px' : 'h-px w-full',
        )}
      />
    </div>
  )
}
