import FormField from '../ui/FormField'
import Input from '../ui/Input'
import Toggle from '../ui/Toggle'
import type { FieldDef } from './schema'

export function ConfigField({ field, value, onChange }: {
  field: FieldDef
  value: string
  onChange: (v: string) => void
}) {
  if (field.type === 'toggle') {
    const checked = value === 'true' || value === true as any
    return (
      <div className="flex items-center justify-between gap-4 py-1">
        <div>
          <span className="text-xs font-medium text-fg-secondary">{field.label}</span>
          {field.help && (
            <p className="mt-0.5 text-xs text-fg-muted">{field.help}</p>
          )}
        </div>
        <Toggle
          checked={checked}
          onChange={next => onChange(next ? 'true' : '')}
          label={field.label}
        />
      </div>
    )
  }

  return (
    <FormField label={field.label} required={field.required} help={field.help}>
      <Input
        type={field.type === 'password' ? 'password' : field.type === 'number' ? 'number' : 'text'}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={field.placeholder}
      />
    </FormField>
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
    <FormField label={label} required={required}>
      <Input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </FormField>
  )
}
