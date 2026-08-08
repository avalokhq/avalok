import ProviderIcon from '../ui/ProviderIcon'

interface IconSelectProps {
  value: string
  onChange: (value: string) => void
  options: readonly { value: string; label: string }[]
  label?: string
  required?: boolean
}

export default function IconSelect({ value, onChange, options, label, required }: IconSelectProps) {
  return (
    <div>
      {label && (
        <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
          {label}
          {required && <span className="text-red-400 ml-0.5">*</span>}
        </label>
      )}
      <div className="relative">
        <div className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none">
          <ProviderIcon provider={value} className="w-4 h-4" />
        </div>
        <select
          value={value}
          onChange={e => onChange(e.target.value)}
          className="w-full pl-8 pr-3 py-1.5 rounded-md bg-[var(--bg-elevated)] border border-[var(--border-default)] text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--text-accent)] transition-colors appearance-none cursor-pointer"
        >
          {options.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <div className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-[var(--text-muted)]">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>
    </div>
  )
}
