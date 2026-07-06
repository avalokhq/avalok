import { useState, useRef, useEffect } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '../../lib/cn'

interface DropdownItem {
  label: string
  icon?: React.ReactNode
  onClick: () => void
}

interface DropdownProps {
  trigger: React.ReactNode
  items: DropdownItem[]
  className?: string
}

export default function Dropdown({ trigger, items, className }: DropdownProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  return (
    <div className={cn('relative', className)} ref={ref}>
      <div onClick={() => setOpen(!open)}>{trigger}</div>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-20 py-1 w-48 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-strong)] shadow-[var(--shadow-dialog)]">
          {items.map(item => (
            <button
              key={item.label}
              onClick={() => { setOpen(false); item.onClick() }}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors text-left"
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function DropdownButton({ children, className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={cn(
        'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-[var(--accent-bright)] text-white hover:opacity-90 transition-all',
        className,
      )}
      {...props}
    >
      {children}
      <ChevronDown className="w-3.5 h-3.5" />
    </button>
  )
}
