import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown } from 'lucide-react'
import { cn } from '../../lib/cn'
import Kbd from './Kbd'

export type MenuItem =
  | {
      label: string
      icon?: React.ReactNode
      onClick: () => void
      danger?: boolean
      disabled?: boolean
      shortcut?: string
      separator?: false
    }
  | { separator: true }

interface DropdownProps {
  trigger: React.ReactNode
  items: MenuItem[]
  align?: 'start' | 'end'
  /** Non-interactive block above the items (e.g. signed-in user). */
  header?: React.ReactNode
  /** Menu width in px. */
  width?: number
  className?: string
}

/** Popup action menu. Renders in a portal, positioned from the trigger; arrow keys, Home/End, Esc. */
export default function Dropdown({ trigger, items, header, align = 'end', width = 200, className }: DropdownProps) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const triggerRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return
    const r = triggerRef.current.getBoundingClientRect()
    let left = align === 'end' ? r.right - width : r.left
    left = Math.max(8, Math.min(left, window.innerWidth - width - 8))
    const menuH = menuRef.current?.offsetHeight ?? 0
    const below = r.bottom + 4
    const top = below + menuH > window.innerHeight - 8 && r.top - menuH - 4 > 8 ? r.top - menuH - 4 : below
    setPos({ top, left })
  }, [open, align, width])

  useEffect(() => {
    if (!open) return
    menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]:not([disabled])')?.focus()
    function onDown(e: MouseEvent) {
      const t = e.target as Node
      if (!menuRef.current?.contains(t) && !triggerRef.current?.contains(t)) setOpen(false)
    }
    function onScroll(e: Event) {
      if (!menuRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onScroll)
    return () => {
      document.removeEventListener('mousedown', onDown)
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onScroll)
    }
  }, [open])

  function close(refocus = true) {
    setOpen(false)
    if (refocus) triggerRef.current?.querySelector<HTMLElement>('button,[tabindex]')?.focus()
  }

  function onMenuKey(e: React.KeyboardEvent) {
    const els = Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])') ?? [])
    const i = els.indexOf(document.activeElement as HTMLElement)
    if (e.key === 'ArrowDown') { e.preventDefault(); els[(i + 1) % els.length]?.focus() }
    else if (e.key === 'ArrowUp') { e.preventDefault(); els[(i - 1 + els.length) % els.length]?.focus() }
    else if (e.key === 'Home') { e.preventDefault(); els[0]?.focus() }
    else if (e.key === 'End') { e.preventDefault(); els[els.length - 1]?.focus() }
    else if (e.key === 'Escape' || e.key === 'Tab') { e.preventDefault(); close() }
    else if (e.key.length === 1) {
      const k = e.key.toLowerCase()
      const next = els.slice(i + 1).concat(els.slice(0, i + 1)).find(el => el.textContent?.trim().toLowerCase().startsWith(k))
      next?.focus()
    }
  }

  return (
    <div className={cn('relative inline-flex', className)} ref={triggerRef}>
      <div
        className="contents"
        onClick={() => setOpen(o => !o)}
        onKeyDown={e => { if (e.key === 'ArrowDown' && !open) { e.preventDefault(); setOpen(true) } }}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {trigger}
      </div>
      {open && createPortal(
        <div
          ref={menuRef}
          role="menu"
          onKeyDown={onMenuKey}
          style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999, width }}
          className="fixed z-[90] rounded-card border border-line bg-surface-raised p-1 shadow-lg animate-scale-in"
        >
          {header && <div className="mb-1 border-b border-line px-2 pt-1.5 pb-2.5">{header}</div>}
          {items.map((item, idx) =>
            item.separator ? (
              <div key={`sep-${idx}`} role="separator" className="my-1 h-px bg-line" />
            ) : (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                disabled={item.disabled}
                onClick={() => { close(false); item.onClick() }}
                className={cn(
                  'flex h-8 w-full items-center gap-2.5 rounded-control px-2 text-left text-sm outline-none transition-colors',
                  'disabled:pointer-events-none disabled:opacity-40 [&_svg]:size-4 [&_svg]:shrink-0',
                  item.danger
                    ? 'text-danger hover:bg-danger-soft focus-visible:bg-danger-soft'
                    : 'text-fg hover:bg-hover focus-visible:bg-hover [&_svg]:text-fg-muted',
                )}
              >
                {item.icon}
                <span className="flex-1 truncate">{item.label}</span>
                {item.shortcut && <Kbd>{item.shortcut}</Kbd>}
              </button>
            ),
          )}
        </div>,
        document.body,
      )}
    </div>
  )
}

export function DropdownButton({ children, className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={cn(
        'inline-flex h-8 items-center gap-1.5 rounded-control bg-accent-solid px-3 text-sm font-medium text-accent-solid-fg shadow-xs',
        'cursor-pointer transition-colors hover:bg-accent-solid-hover',
        className,
      )}
      {...props}
    >
      {children}
      <ChevronDown className="size-3.5 opacity-80" />
    </button>
  )
}
