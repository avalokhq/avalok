import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { cn } from '../../lib/cn'
import IconButton from './IconButton'

const SIZES = {
  sm: 'max-w-sm',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
}

interface ModalProps {
  title: string
  description?: string
  onClose: () => void
  children: React.ReactNode
  /** Right-aligned action row, separated by a top border. */
  footer?: React.ReactNode
  size?: keyof typeof SIZES
  /** @deprecated use `size` */
  maxWidth?: string
  /** Allow closing via backdrop click. Escape always closes. */
  dismissible?: boolean
  className?: string
}

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'

export default function Modal({
  title,
  description,
  onClose,
  children,
  footer,
  size = 'md',
  maxWidth,
  dismissible = true,
  className,
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)
  const titleId = useId()
  const descId = useId()
  // Captured during render, before any child autoFocus moves focus into the dialog.
  const [restoreTo] = useState(() => document.activeElement as HTMLElement | null)

  useEffect(() => {
    onCloseRef.current = onClose
  })

  useEffect(() => {
    const panel = panelRef.current
    // Respect a child's autoFocus (React focuses it before this effect runs); otherwise focus the first field.
    if (!panel?.contains(document.activeElement)) {
      const first = panel?.querySelector<HTMLElement>('input:not([disabled]),select:not([disabled]),textarea:not([disabled])')
      ;(first ?? panel)?.focus()
    }

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onCloseRef.current()
        return
      }
      if (e.key !== 'Tab' || !panel) return
      const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(el => el.offsetParent !== null)
      if (items.length === 0) return
      const firstEl = items[0]
      const lastEl = items[items.length - 1]
      if (e.shiftKey && document.activeElement === firstEl) {
        e.preventDefault()
        lastEl.focus()
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault()
        firstEl.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
      restoreTo?.focus?.()
    }
  }, [restoreTo])

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-overlay backdrop-blur-xl animate-fade-in"
      onMouseDown={e => { if (dismissible && e.target === e.currentTarget) onClose() }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        className={cn(
          'flex w-full max-h-[85vh] flex-col overflow-hidden rounded-overlay border border-line bg-surface-raised shadow-lg outline-none animate-scale-in',
          maxWidth ?? SIZES[size],
          className,
        )}
      >
        <div className="flex items-start justify-between gap-4 px-5 pt-4 pb-3">
          <div className="min-w-0">
            <h2 id={titleId} className="text-base font-semibold text-fg">{title}</h2>
            {description && <p id={descId} className="mt-0.5 text-sm text-fg-muted">{description}</p>}
          </div>
          <IconButton label="Close" onClick={onClose} className="-mr-1.5 -mt-0.5">
            <X className="size-4" />
          </IconButton>
        </div>
        <div className="flex-1 overflow-auto px-5 pb-5 pt-1">{children}</div>
        {footer && (
          <div className="flex items-center justify-end gap-2 border-t border-line bg-surface-sunken px-5 py-3">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}
