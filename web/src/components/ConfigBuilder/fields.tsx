import { cn } from '../../lib/cn'
import type { FieldDef } from './schema'

export function ConfigField({ field, value, onChange }: {
  field: FieldDef
  value: string
  onChange: (v: string) => void
}) {
  if (field.type === 'toggle') {
    const checked = value === 'true' || value === true as any
    return (
      <div className="flex items-center justify-between py-1">
        <div>
          <span className="text-xs font-medium text-[var(--text-secondary)]">{field.label}</span>
          {field.help && (
            <p className="text-[10px] text-[var(--text-muted)] mt-0.5">{field.help}</p>
          )}
        </div>
        <button
          type="button"
          onClick={() => onChange(checked ? '' : 'true')}
          className={cn(
            'relative w-9 h-5 rounded-full transition-colors shrink-0',
            checked ? 'bg-[var(--text-accent)]' : 'bg-[var(--border-default)]'
          )}
        >
          <span className={cn(
            'absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform',
            checked && 'translate-x-4'
          )} />
        </button>
      </div>
    )
  }

  return (
    <div>
      <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
        {field.label}
        {field.required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      <input
        type={field.type === 'password' ? 'password' : field.type === 'number' ? 'number' : 'text'}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={field.placeholder}
        className="w-full px-3 py-1.5 rounded-md bg-[var(--bg-elevated)] border border-[var(--border-default)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-subtle)] focus:outline-none focus:border-[var(--text-accent)] transition-colors"
      />
      {field.help && (
        <p className="text-[10px] text-[var(--text-muted)] mt-0.5">{field.help}</p>
      )}
    </div>
  )
}

export function TextField({ label, value, onChange, placeholder, required }: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  required?: boolean
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
        {label}
        {required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-1.5 rounded-md bg-[var(--bg-elevated)] border border-[var(--border-default)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-subtle)] focus:outline-none focus:border-[var(--text-accent)] transition-colors"
      />
    </div>
  )
}
