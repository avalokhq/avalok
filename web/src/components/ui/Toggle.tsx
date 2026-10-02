import { cn } from '../../lib/cn'

interface ToggleProps {
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
  /** Accessible name when there is no visible <label>. */
  label?: string
  id?: string
}

export default function Toggle({ checked, onChange, disabled, label, id }: ToggleProps) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      disabled={disabled}
      className={cn(
        'relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border transition-colors duration-150',
        'disabled:cursor-not-allowed disabled:opacity-50',
        checked ? 'border-accent-solid bg-accent-solid' : 'border-line-strong bg-surface-sunken',
      )}
    >
      <span
        aria-hidden
        className={cn(
          'block size-3.5 rounded-full shadow-sm transition-transform duration-150',
          checked ? 'translate-x-[17px] bg-accent-solid-fg' : 'translate-x-[2px] bg-fg-muted',
        )}
      />
    </button>
  )
}
