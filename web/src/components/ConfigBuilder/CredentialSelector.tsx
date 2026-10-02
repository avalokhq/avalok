import SegmentedControl from '../ui/SegmentedControl'
import FormField from '../ui/FormField'
import { Select } from '../ui/Input'
import { ConfigField } from './fields'
import type { FieldDef } from './schema'
import type { AdminCredential } from '../../lib/api'

const TARGET_FIELD_KEYS = new Set(['host', 'port', 'sudo', 'use_https', 'insecure'])

interface CredentialSelectorProps {
  targetType: string
  credentials: AdminCredential[]
  credentialProfile: string
  connection: Record<string, string>
  fields: FieldDef[]
  onSelectProfile: (name: string, keptConnection: Record<string, string>) => void
  onClearProfile: () => void
  onConnectionChange: (key: string, value: string) => void
}

export default function CredentialSelector({
  targetType,
  credentials,
  credentialProfile,
  connection,
  fields,
  onSelectProfile,
  onClearProfile,
  onConnectionChange,
}: CredentialSelectorProps) {
  const matchingCreds = credentials.filter(c => c.target_type === targetType)
  const hasCredentials = matchingCreds.length > 0
  const useProfile = hasCredentials && credentialProfile !== ''

  const targetFields = fields.filter(f => TARGET_FIELD_KEYS.has(f.key))
  const authFields = fields.filter(f => !TARGET_FIELD_KEYS.has(f.key))

  if (!hasCredentials) {
    if (fields.length === 0) return null
    return (
      <div className="grid grid-cols-2 gap-4">
        {fields.map(field => (
          <div key={field.key} className={field.type === 'toggle' ? 'col-span-2' : ''}>
            <ConfigField
              field={field}
              value={connection[field.key] ?? ''}
              onChange={v => onConnectionChange(field.key, v)}
            />
          </div>
        ))}
      </div>
    )
  }

  function handleSelectProfile(name: string) {
    const kept: Record<string, string> = {}
    for (const k of TARGET_FIELD_KEYS) {
      if (connection[k]) kept[k] = connection[k]
    }
    onSelectProfile(name, kept)
  }

  return (
    <>
      {targetFields.length > 0 && (
        <div className="grid grid-cols-2 gap-4">
          {targetFields.map(field => (
            <div key={field.key} className={field.type === 'toggle' ? 'col-span-2' : ''}>
              <ConfigField
                field={field}
                value={connection[field.key] ?? ''}
                onChange={v => onConnectionChange(field.key, v)}
              />
            </div>
          ))}
        </div>
      )}

      <div>
        <label className="mb-1.5 block text-xs font-medium text-fg-secondary">Authentication</label>
        <SegmentedControl
          label="Authentication"
          size="sm"
          className="flex w-full [&>button]:flex-1"
          value={useProfile ? 'profile' : 'manual'}
          onChange={mode => {
            if (mode === 'manual') {
              onClearProfile()
            } else {
              const first = matchingCreds[0]
              if (first) handleSelectProfile(first.name)
            }
          }}
          options={[
            { value: 'manual', label: 'Manual' },
            { value: 'profile', label: 'Credential Profile' },
          ]}
        />
      </div>

      {useProfile ? (
        <FormField label="Profile" help="Managed credential from Admin > Credentials">
          <Select
            value={credentialProfile}
            onChange={e => handleSelectProfile(e.target.value)}
          >
            {matchingCreds.map(c => (
              <option key={c.name} value={c.name}>{c.name}{c.description ? ` — ${c.description}` : ''}</option>
            ))}
          </Select>
        </FormField>
      ) : authFields.length > 0 ? (
        <div className="grid grid-cols-2 gap-4">
          {authFields.map(field => (
            <div key={field.key} className={field.type === 'toggle' ? 'col-span-2' : ''}>
              <ConfigField
                field={field}
                value={connection[field.key] ?? ''}
                onChange={v => onConnectionChange(field.key, v)}
              />
            </div>
          ))}
        </div>
      ) : null}
    </>
  )
}
