import { Check, Minus } from 'lucide-react'
import { cn } from '../../lib/cn'

interface CheckboxProps {
  checked: boolean
  onChange: (checked: boolean) => void
  /** Partially selected (e.g. "select all" with some rows checked). */
  indeterminate?: boolean
  disabled?: boolean
  label?: React.ReactNode
  description?: React.ReactNode
  className?: string
}

export default function Checkbox({ checked, onChange, indeterminate, disabled, label, description, className }: CheckboxProps) {
  const on = checked || indeterminate
  return (
    <label className={cn('inline-flex items-start gap-2.5 select-none', disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer', className)}>
      <span className="relative mt-0.5 inline-flex">
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          ref={el => { if (el) el.indeterminate = !!indeterminate }}
          onChange={e => onChange(e.target.checked)}
          className="peer absolute inset-0 m-0 cursor-[inherit] opacity-0"
        />
        <span
          aria-hidden
          className={cn(
            'flex size-4 items-center justify-center rounded-[4px] border transition-colors',
            'peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--focus-ring)]',
            on ? 'border-accent-solid bg-accent-solid text-accent-solid-fg' : 'border-line-strong bg-surface-sunken',
          )}
        >
          {indeterminate ? <Minus className="size-3" strokeWidth={3} /> : checked ? <Check className="size-3" strokeWidth={3} /> : null}
        </span>
      </span>
      {(label || description) && (
        <span className="min-w-0">
          {label && <span className="block text-sm text-fg">{label}</span>}
          {description && <span className="block text-xs text-fg-muted">{description}</span>}
        </span>
      )}
    </label>
  )
}

interface RadioProps {
  checked: boolean
  onChange: () => void
  name: string
  value: string
  disabled?: boolean
  label?: React.ReactNode
  description?: React.ReactNode
  className?: string
}

export function Radio({ checked, onChange, name, value, disabled, label, description, className }: RadioProps) {
  return (
    <label className={cn('inline-flex items-start gap-2.5 select-none', disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer', className)}>
      <span className="relative mt-0.5 inline-flex">
        <input
          type="radio"
          name={name}
          value={value}
          checked={checked}
          disabled={disabled}
          onChange={onChange}
          className="peer absolute inset-0 m-0 cursor-[inherit] opacity-0"
        />
        <span
          aria-hidden
          className={cn(
            'flex size-4 items-center justify-center rounded-full border transition-colors',
            'peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--focus-ring)]',
            checked ? 'border-accent-solid bg-accent-solid' : 'border-line-strong bg-surface-sunken',
          )}
        >
          {checked && <span className="size-1.5 rounded-full bg-accent-solid-fg" />}
        </span>
      </span>
      {(label || description) && (
        <span className="min-w-0">
          {label && <span className="block text-sm text-fg">{label}</span>}
          {description && <span className="block text-xs text-fg-muted">{description}</span>}
        </span>
      )}
    </label>
  )
}
