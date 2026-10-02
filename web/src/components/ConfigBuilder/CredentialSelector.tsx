import { useEffect, useState } from 'react'
import FormField from '../ui/FormField'
import Button from '../ui/Button'
import { Select } from '../ui/Input'
import { ConfigField } from './fields'
import type { FieldDef } from './schema'
import type { AdminCredential } from '../../lib/api'

// Fields that describe the machine rather than how to log in. These stay on
// the target when a credential profile supplies the authentication.
const TARGET_FIELD_KEYS = new Set(['host', 'port', 'sudo', 'use_https', 'insecure'])
// Fields a "server" credential (one with a host) already provides.
const ADDRESS_KEYS = new Set(['host', 'port'])
const MANUAL = '__manual__'

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
  const selected = hasCredentials ? matchingCreds.find(c => c.name === credentialProfile) : undefined
  const isServerCred = !!selected?.host
  const [overrideAddress, setOverrideAddress] = useState(!!connection.host)

  // A fresh target with saved credentials available starts on the first one,
  // so the user picks "which server" before typing any connection details.
  useEffect(() => {
    if (!hasCredentials || credentialProfile) return
    if (Object.values(connection).some(v => v)) return
    selectProfile(matchingCreds[0].name, false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetType])

  if (!hasCredentials) {
    if (fields.length === 0) return null
    return <FieldGrid fields={fields} connection={connection} onChange={onConnectionChange} />
  }

  function selectProfile(name: string, keepAddress: boolean) {
    const cred = matchingCreds.find(c => c.name === name)
    const kept: Record<string, string> = {}
    for (const k of TARGET_FIELD_KEYS) {
      if (!connection[k]) continue
      // A server credential carries its own address; drop the old one unless overriding.
      if (cred?.host && ADDRESS_KEYS.has(k) && !keepAddress) continue
      kept[k] = connection[k]
    }
    onSelectProfile(name, kept)
  }

  function handleChoice(value: string) {
    if (value === MANUAL) {
      onClearProfile()
      return
    }
    setOverrideAddress(false)
    selectProfile(value, false)
  }

  function clearOverride() {
    setOverrideAddress(false)
    if (selected) selectProfile(selected.name, false)
  }

  const targetFields = fields.filter(f => TARGET_FIELD_KEYS.has(f.key))
  const visibleFields = !selected
    ? fields
    : isServerCred && !overrideAddress
      ? targetFields.filter(f => !ADDRESS_KEYS.has(f.key))
      : targetFields

  return (
    <>
      <FormField label="Connect using" help="Saved credentials from Admin > Credentials">
        <Select value={selected ? selected.name : MANUAL} onChange={e => handleChoice(e.target.value)}>
          {matchingCreds.map(c => (
            <option key={c.name} value={c.name}>
              {c.name} — {c.host ? c.host : 'any host'}
            </option>
          ))}
          <option value={MANUAL}>Enter details manually</option>
        </Select>
      </FormField>

      {isServerCred && selected && (
        <div className="flex items-center justify-between gap-3 rounded-control border border-line bg-surface-sunken px-3 py-2 text-xs text-fg-secondary">
          <span className="min-w-0 truncate">
            {overrideAddress ? 'Overriding the address from ' : 'Connects to '}
            {overrideAddress
              ? <span className="font-medium text-fg">{selected.name}</span>
              : <>
                  <span className="font-medium text-fg">{selected.host}{selected.port ? `:${selected.port}` : ''}</span>
                  {selected.user && <> as <span className="font-medium text-fg">{selected.user}</span></>}
                </>
            }
          </span>
          <Button
            type="button"
            variant="link"
            className="shrink-0 text-xs"
            onClick={() => (overrideAddress ? clearOverride() : setOverrideAddress(true))}
          >
            {overrideAddress ? 'Use credential address' : 'Override host/port'}
          </Button>
        </div>
      )}

      {visibleFields.length > 0 && (
        <FieldGrid fields={visibleFields} connection={connection} onChange={onConnectionChange} />
      )}
    </>
  )
}

function FieldGrid({ fields, connection, onChange }: {
  fields: FieldDef[]
  connection: Record<string, string>
  onChange: (key: string, value: string) => void
}) {
  return (
    <div className="grid grid-cols-2 gap-4">
      {fields.map(field => (
        <div key={field.key} className={field.type === 'toggle' ? 'col-span-2' : ''}>
          <ConfigField
            field={field}
            value={connection[field.key] ?? ''}
            onChange={v => onChange(field.key, v)}
          />
        </div>
      ))}
    </div>
  )
}
