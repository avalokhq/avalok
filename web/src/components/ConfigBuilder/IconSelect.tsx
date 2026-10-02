import ProviderIcon from '../ui/ProviderIcon'
import { Select } from '../ui/Input'

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
        <label className="mb-1.5 block text-xs font-medium text-fg-secondary">
          {label}
          {required && <span className="ml-0.5 text-danger">*</span>}
        </label>
      )}
      <div className="relative">
        <div className="pointer-events-none absolute left-2.5 top-1/2 z-10 -translate-y-1/2">
          <ProviderIcon provider={value} className="size-4" />
        </div>
        <Select
          value={value}
          onChange={e => onChange(e.target.value)}
          className="pl-8"
        >
          {options.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </Select>
      </div>
    </div>
  )
}
