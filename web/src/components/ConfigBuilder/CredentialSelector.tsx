import { cn } from '../../lib/cn'
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
      <div className="grid grid-cols-2 gap-3">
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
        <div className="grid grid-cols-2 gap-3">
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
        <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">Authentication</label>
        <div className="grid grid-cols-2 gap-1.5">
          <button
            type="button"
            onClick={onClearProfile}
            className={cn(
              'px-2 py-1.5 rounded-md text-xs transition-all border',
              !useProfile
                ? 'bg-[var(--bg-active)] border-[var(--text-accent)] text-[var(--text-accent)] font-medium'
                : 'bg-[var(--bg-elevated)] border-[var(--border-subtle)] text-[var(--text-secondary)] hover:border-[var(--border-default)] hover:text-[var(--text-primary)]'
            )}
          >
            Manual
          </button>
          <button
            type="button"
            onClick={() => {
              const first = matchingCreds[0]
              if (first) handleSelectProfile(first.name)
            }}
            className={cn(
              'px-2 py-1.5 rounded-md text-xs transition-all border',
              useProfile
                ? 'bg-[var(--bg-active)] border-[var(--text-accent)] text-[var(--text-accent)] font-medium'
                : 'bg-[var(--bg-elevated)] border-[var(--border-subtle)] text-[var(--text-secondary)] hover:border-[var(--border-default)] hover:text-[var(--text-primary)]'
            )}
          >
            Credential Profile
          </button>
        </div>
      </div>

      {useProfile ? (
        <div>
          <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Profile</label>
          <select
            value={credentialProfile}
            onChange={e => handleSelectProfile(e.target.value)}
            className="w-full px-3 py-1.5 rounded-md bg-[var(--bg-elevated)] border border-[var(--border-default)] text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--text-accent)] transition-colors"
          >
            {matchingCreds.map(c => (
              <option key={c.name} value={c.name}>{c.name}{c.description ? ` — ${c.description}` : ''}</option>
            ))}
          </select>
          <p className="text-[10px] text-[var(--text-muted)] mt-0.5">Managed credential from Admin &gt; Credentials</p>
        </div>
      ) : authFields.length > 0 ? (
        <div className="grid grid-cols-2 gap-3">
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
