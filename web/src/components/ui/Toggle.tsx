import { cn } from '../../lib/cn'

interface ToggleProps {
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
}

export default function Toggle({ checked, onChange, disabled }: ToggleProps) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      disabled={disabled}
      className={cn(
        'relative shrink-0 w-9 h-5 rounded-full transition-colors',
        checked ? 'bg-[var(--accent-bright)]' : 'bg-chrome-600'
      )}
    >
      <span className={cn(
        'block w-3.5 h-3.5 rounded-full bg-white shadow-sm transition-transform',
        checked ? 'translate-x-[18px]' : 'translate-x-[3px]'
      )} />
    </button>
  )
}
