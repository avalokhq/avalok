import { useState, useRef, useMemo, useCallback, useEffect } from 'react'
import {
  Plus, Trash2, ChevronDown, ChevronRight, Server, Box,
  FileText, ArrowDownToLine,
  Copy, Check, Settings, Layers, FolderTree, Save,
  Upload, Eye, EyeOff, X, ChevronLeft,
} from 'lucide-react'
import { cn } from '../../lib/cn'
import { AvalokWordmark } from '../ui/AvalokLogo'
import ProviderIcon from '../ui/ProviderIcon'
import { useTheme, type Theme } from '../../lib/useTheme'
import { Sun, Moon, Monitor as MonitorIcon } from 'lucide-react'
import type { WorkspaceConfig, ServiceDef, EnvironmentDef, TargetDef } from './types'
import { createId, emptyConfig } from './types'
import { PROVIDERS, PROVIDER_FIELDS, TARGET_TYPES, TARGET_FIELDS, type FieldDef } from './schema'
import { generateYaml } from './generateYaml'
import { parseWorkspaceYaml } from './parseYaml'
import ResourceImporter, { type ConnectResult } from './ResourceImporter'
import { adminGetWorkspaceYAML, adminGetSettings, adminListCredentials } from '../../lib/api'
import type { AdminCredential } from '../../lib/api'
import Button from '../ui/Button'
import Modal from '../ui/Modal'
import Card from '../ui/Card'

const ProviderIconWrapper = (provider: string): React.FC<{ className?: string }> =>
  ({ className }) => <ProviderIcon provider={provider} className={className} />

function update<T>(prev: T, fn: (draft: T) => void): T {
  const next = structuredClone(prev)
  fn(next)
  return next
}

// ── Field renderer ──

function ConfigField({ field, value, onChange }: {
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

function TextField({ label, value, onChange, placeholder, required }: {
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

// ── Section wrapper ──

function Section({ title, icon: Icon, children, count, defaultOpen = true, actions }: {
  title: string
  icon: React.FC<{ className?: string }>
  children: React.ReactNode
  count?: number
  defaultOpen?: boolean
  actions?: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border border-[var(--border-default)] rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-2.5 px-4 py-3 bg-[var(--bg-elevated)] hover:bg-[var(--bg-hover)] transition-colors"
      >
        {open
          ? <ChevronDown className="w-4 h-4 text-[var(--text-muted)] shrink-0" />
          : <ChevronRight className="w-4 h-4 text-[var(--text-muted)] shrink-0" />
        }
        <Icon className="w-4 h-4 text-[var(--text-accent)] shrink-0" />
        <span className="text-base text-[var(--text-primary)]">{title}</span>
        {count !== undefined && (
          <span className="text-[10px] text-[var(--text-muted)] bg-[var(--bg-app)] px-1.5 py-0.5 rounded-full">{count}</span>
        )}
        <div className="flex-1" />
        {actions && <div onClick={e => e.stopPropagation()}>{actions}</div>}
      </button>
      {open && (
        <div className="px-4 py-4 space-y-4 bg-[var(--bg-surface)]">
          {children}
        </div>
      )}
    </div>
  )
}

// ── Service detail form (shown below grid when selected) ──

function ServiceDetailForm({ svc, onChange, onRemove, onClone, onClose }: {
  svc: ServiceDef
  onChange: (svc: ServiceDef) => void
  onRemove: () => void
  onClone: () => void
  onClose: () => void
}) {
  const fields = PROVIDER_FIELDS[svc.provider] ?? []
  const Icon = ProviderIconWrapper(svc.provider)

  return (
    <div className="border border-[var(--text-accent)]/40 rounded-lg overflow-hidden bg-[var(--bg-app)]">
      <div className="flex items-center gap-2 px-3 py-2 bg-[var(--bg-elevated)] border-b border-[var(--border-subtle)]">
        <Icon className="w-3.5 h-3.5 text-[var(--text-accent)] shrink-0" />
        <span className="text-xs font-medium text-[var(--text-primary)] flex-1 truncate">
          {svc.friendly_name || svc.name || 'New Service'}
        </span>
        <span className="text-[10px] text-[var(--text-muted)] bg-[var(--bg-app)] px-1.5 py-0.5 rounded">{svc.provider}</span>
        <span
          role="button"
          onClick={onClone}
          className="p-0.5 rounded text-[var(--text-muted)] hover:text-[var(--text-accent)] hover:bg-[var(--bg-active)] transition-colors"
          title="Clone service"
        >
          <Copy className="w-3 h-3" />
        </span>
        <span
          role="button"
          onClick={onRemove}
          className="p-0.5 rounded text-[var(--text-muted)] hover:text-red-400 hover:bg-red-500/10 transition-colors"
          title="Remove service"
        >
          <Trash2 className="w-3 h-3" />
        </span>
        <span
          role="button"
          onClick={onClose}
          className="p-0.5 rounded text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-active)] transition-colors"
          title="Close"
        >
          <X className="w-3 h-3" />
        </span>
      </div>
      <div className="p-3 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <TextField
            label="Name"
            value={svc.name}
            onChange={v => onChange({ ...svc, name: v.toLowerCase().replace(/[^a-z0-9-]/g, '-') })}
            placeholder="api"
            required
          />
          <TextField
            label="Friendly Name"
            value={svc.friendly_name}
            onChange={v => onChange({ ...svc, friendly_name: v })}
            placeholder="REST API"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
            Provider<span className="text-red-400 ml-0.5">*</span>
          </label>
          <div className="grid grid-cols-4 gap-1.5">
            {PROVIDERS.map(p => {
              const PIcon = ProviderIconWrapper(p.value)
              return (
                <button
                  key={p.value}
                  onClick={() => onChange({ ...svc, provider: p.value, config: {} })}
                  className={cn(
                    'flex items-center gap-1.5 px-2 py-1.5 rounded-md text-xs transition-all border',
                    svc.provider === p.value
                      ? 'bg-[var(--bg-active)] border-[var(--text-accent)] text-[var(--text-accent)] font-medium'
                      : 'bg-[var(--bg-elevated)] border-[var(--border-subtle)] text-[var(--text-secondary)] hover:border-[var(--border-default)] hover:text-[var(--text-primary)]'
                  )}
                >
                  <PIcon className="w-3 h-3 shrink-0" />
                  {p.label}
                </button>
              )
            })}
          </div>
        </div>

        {fields.length > 0 && (
          <div className="space-y-3 pt-1 border-t border-[var(--border-subtle)]">
            <span className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">Provider Config</span>
            {fields.map(field => (
              <ConfigField
                key={field.key}
                field={field}
                value={svc.config[field.key] ?? ''}
                onChange={v => onChange({ ...svc, config: { ...svc.config, [field.key]: v } })}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Target card (accordion) ──

function TargetCard({ target, services, expanded, onToggle, onChange, onRemove, onClone, onConnectFromResource, credentials }: {
  target: TargetDef
  services: ServiceDef[]
  expanded: boolean
  onToggle: () => void
  onChange: (t: TargetDef) => void
  onRemove: () => void
  onClone: () => void
  onConnectFromResource?: () => void
  credentials?: AdminCredential[]
}) {
  const fields = TARGET_FIELDS[target.type] ?? []
  const [showOverrides, setShowOverrides] = useState(target.service_overrides.length > 0)

  return (
    <div className={cn(
      'border rounded-lg bg-[var(--bg-app)] overflow-hidden transition-colors',
      expanded ? 'border-[var(--text-accent)]/40' : 'border-[var(--border-subtle)]'
    )}>
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2 px-3 py-2 bg-[var(--bg-elevated)] border-b border-[var(--border-subtle)] hover:bg-[var(--bg-hover)] transition-colors"
      >
        {expanded
          ? <ChevronDown className="w-3 h-3 text-[var(--text-muted)] shrink-0" />
          : <ChevronRight className="w-3 h-3 text-[var(--text-muted)] shrink-0" />
        }
        <Server className="w-3.5 h-3.5 text-[var(--text-secondary)] shrink-0" />
        <span className="text-xs font-medium text-[var(--text-primary)] flex-1 truncate text-left">
          {target.name || 'New Target'}
        </span>
        <span className="text-[10px] text-[var(--text-muted)] bg-[var(--bg-app)] px-1.5 py-0.5 rounded">{target.type}</span>
        {target.service_names.length > 0 && (
          <span className="text-[10px] text-[var(--text-muted)]">{target.service_names.length} svc</span>
        )}
        <span
          role="button"
          onClick={e => { e.stopPropagation(); onClone() }}
          className="p-0.5 rounded text-[var(--text-muted)] hover:text-[var(--text-accent)] hover:bg-[var(--bg-active)] transition-colors"
          title="Clone target"
        >
          <Copy className="w-3 h-3" />
        </span>
        <span
          role="button"
          onClick={e => { e.stopPropagation(); onRemove() }}
          className="p-0.5 rounded text-[var(--text-muted)] hover:text-red-400 hover:bg-red-500/10 transition-colors"
          title="Remove target"
        >
          <Trash2 className="w-3 h-3" />
        </span>
      </button>
      {expanded && (
        <div className="p-3 space-y-3">
          <TextField
            label="Target Name"
            value={target.name}
            onChange={v => onChange({ ...target, name: v.toLowerCase().replace(/[^a-z0-9-]/g, '-') })}
            placeholder="prod-cluster"
            required
          />

          <div>
            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
              Type<span className="text-red-400 ml-0.5">*</span>
            </label>
            <div className="grid grid-cols-4 gap-1.5">
              {TARGET_TYPES.map(t => (
                <button
                  key={t.value}
                  onClick={() => onChange({ ...target, type: t.value, connection: {} })}
                  className={cn(
                    'px-2 py-1.5 rounded-md text-xs transition-all border',
                    target.type === t.value
                      ? 'bg-[var(--bg-active)] border-[var(--text-accent)] text-[var(--text-accent)] font-medium'
                      : 'bg-[var(--bg-elevated)] border-[var(--border-subtle)] text-[var(--text-secondary)] hover:border-[var(--border-default)] hover:text-[var(--text-primary)]'
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {(() => {
            const hasCredentials = credentials && credentials.filter(c => c.target_type === target.type).length > 0 && (target.type === 'ssh' || target.type === 'winrm')
            const useProfile = hasCredentials && target.credential_profile !== ''
            const targetFieldKeys = new Set(['host', 'port', 'sudo', 'use_https', 'insecure'])
            const targetFields = fields.filter(f => targetFieldKeys.has(f.key))
            const authFields = fields.filter(f => !targetFieldKeys.has(f.key))

            if (!hasCredentials) {
              return fields.length > 0 ? (
                <div className="space-y-3">
                  {fields.map(field => (
                    <ConfigField
                      key={field.key}
                      field={field}
                      value={target.connection[field.key] ?? ''}
                      onChange={v => onChange({ ...target, connection: { ...target.connection, [field.key]: v } })}
                    />
                  ))}
                </div>
              ) : null
            }

            return (
              <>
                {targetFields.length > 0 && (
                  <div className="space-y-3">
                    {targetFields.map(field => (
                      <ConfigField
                        key={field.key}
                        field={field}
                        value={target.connection[field.key] ?? ''}
                        onChange={v => onChange({ ...target, connection: { ...target.connection, [field.key]: v } })}
                      />
                    ))}
                  </div>
                )}

                <div>
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">Authentication</label>
                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      onClick={() => onChange({ ...target, credential_profile: '' })}
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
                      onClick={() => {
                        const first = credentials!.filter(c => c.target_type === target.type)[0]
                        if (first) {
                          const kept: Record<string, string> = {}
                          for (const k of targetFieldKeys) {
                            if (target.connection[k]) kept[k] = target.connection[k]
                          }
                          onChange({ ...target, credential_profile: first.name, connection: kept })
                        }
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
                      value={target.credential_profile}
                      onChange={e => onChange({ ...target, credential_profile: e.target.value })}
                      className="w-full px-3 py-1.5 rounded-md bg-[var(--bg-elevated)] border border-[var(--border-default)] text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--text-accent)] transition-colors"
                    >
                      {credentials!.filter(c => c.target_type === target.type).map(c => (
                        <option key={c.name} value={c.name}>{c.name}{c.description ? ` — ${c.description}` : ''}</option>
                      ))}
                    </select>
                    <p className="text-[10px] text-[var(--text-muted)] mt-0.5">Managed credential from Admin &gt; Credentials</p>
                  </div>
                ) : authFields.length > 0 ? (
                  <div className="space-y-3">
                    {authFields.map(field => (
                      <ConfigField
                        key={field.key}
                        field={field}
                        value={target.connection[field.key] ?? ''}
                        onChange={v => onChange({ ...target, connection: { ...target.connection, [field.key]: v } })}
                      />
                    ))}
                  </div>
                ) : null}
              </>
            )
          })()}

          {onConnectFromResource && target.type === 'kubernetes' && (
            <button
              onClick={onConnectFromResource}
              className="w-full flex items-center justify-center gap-1.5 py-2 rounded-md border border-dashed border-blue-500/30 text-xs text-blue-400 hover:bg-blue-500/10 hover:border-blue-500/50 transition-colors"
            >
              <Server className="w-3 h-3" />
              Connect from Resource
            </button>
          )}

          <div>
            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
              Services on this target
            </label>
            {services.length === 0 ? (
              <p className="text-xs text-[var(--text-muted)] italic">Define global services first</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {services.map(svc => {
                  const active = target.service_names.includes(svc.name)
                  const SvcIcon = ProviderIconWrapper(svc.provider)
                  return (
                    <button
                      key={svc.id}
                      disabled={!svc.name}
                      onClick={() => {
                        const names = active
                          ? target.service_names.filter(n => n !== svc.name)
                          : [...target.service_names, svc.name]
                        onChange({ ...target, service_names: names })
                      }}
                      className={cn(
                        'flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs transition-all border',
                        !svc.name && 'opacity-40 cursor-not-allowed',
                        active
                          ? 'bg-[var(--bg-active)] border-[var(--text-accent)] text-[var(--text-accent)] font-medium'
                          : 'bg-[var(--bg-elevated)] border-[var(--border-subtle)] text-[var(--text-secondary)] hover:border-[var(--border-default)]'
                      )}
                    >
                      <SvcIcon className="w-3 h-3 shrink-0" />
                      {svc.friendly_name || svc.name || '(unnamed)'}
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {target.service_names.length > 0 && (
            <div className="pt-1 border-t border-[var(--border-subtle)]">
              <button
                onClick={() => setShowOverrides(v => !v)}
                className="text-[10px] text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors"
              >
                {showOverrides ? '▾ Hide' : '▸ Show'} service config overrides
              </button>
              {showOverrides && (
                <div className="mt-2 space-y-2">
                  {target.service_names.map(svcName => {
                    const globalSvc = services.find(s => s.name === svcName)
                    if (!globalSvc) return null
                    const override = target.service_overrides.find(o => o.name === svcName)
                    const providerFields = PROVIDER_FIELDS[globalSvc.provider] ?? []
                    if (providerFields.length === 0) return null

                    return (
                      <div key={svcName} className="p-2 rounded bg-[var(--bg-elevated)] border border-[var(--border-subtle)]">
                        <div className="flex items-center gap-1.5 mb-2">
                          <span className="text-[10px] font-medium text-[var(--text-secondary)]">{svcName}</span>
                          <span className="text-[10px] text-[var(--text-muted)]">override</span>
                        </div>
                        {providerFields.map(field => (
                          <div key={field.key} className="mb-1.5">
                            <label className="block text-[10px] text-[var(--text-muted)] mb-0.5">{field.label}</label>
                            <input
                              type="text"
                              value={override?.config[field.key] ?? ''}
                              onChange={e => {
                                const val = e.target.value
                                const existing = target.service_overrides.filter(o => o.name !== svcName)
                                if (val) {
                                  const cfg = override ? { ...override.config, [field.key]: val } : { [field.key]: val }
                                  existing.push({ name: svcName, config: cfg })
                                }
                                onChange({ ...target, service_overrides: existing })
                              }}
                              placeholder={`Override ${field.label.toLowerCase()}...`}
                              className="w-full px-2 py-1 rounded bg-[var(--bg-app)] border border-[var(--border-subtle)] text-xs text-[var(--text-primary)] placeholder:text-[var(--text-subtle)] focus:outline-none focus:border-[var(--text-accent)]"
                            />
                          </div>
                        ))}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Environment detail form (shown below grid when selected) ──

function EnvironmentDetailForm({ env, services, expandedTargetId, onToggleTarget, onChange, onRemove, onClone, onClose, onConnectFromResource, credentials }: {
  env: EnvironmentDef
  services: ServiceDef[]
  expandedTargetId: string | null
  onToggleTarget: (id: string) => void
  onChange: (e: EnvironmentDef) => void
  onRemove: () => void
  onClone: () => void
  onClose: () => void
  onConnectFromResource?: (targetId: string) => void
  credentials?: AdminCredential[]
}) {
  function addTarget() {
    const newId = createId()
    onChange(update(env, d => {
      d.targets.push({
        id: newId, name: '', type: 'kubernetes',
        connection: {}, credential_profile: '', service_names: [], service_overrides: [],
      })
    }))
    onToggleTarget(newId)
  }

  function updateTarget(id: string, t: TargetDef) {
    onChange(update(env, d => {
      const idx = d.targets.findIndex(x => x.id === id)
      if (idx >= 0) d.targets[idx] = t
    }))
  }

  function removeTarget(id: string) {
    onChange(update(env, d => {
      d.targets = d.targets.filter(x => x.id !== id)
    }))
  }

  function cloneTarget(id: string) {
    const source = env.targets.find(x => x.id === id)
    if (!source) return
    const newId = createId()
    const cloned: TargetDef = {
      ...structuredClone(source),
      id: newId,
      name: source.name ? `${source.name}-copy` : '',
    }
    onChange(update(env, d => {
      const idx = d.targets.findIndex(x => x.id === id)
      d.targets.splice(idx + 1, 0, cloned)
    }))
    onToggleTarget(newId)
  }

  return (
    <div className="border border-[var(--text-accent)]/40 rounded-lg overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2.5 bg-[var(--bg-elevated)] border-b border-[var(--border-default)]">
        <FolderTree className="w-3.5 h-3.5 text-[var(--text-accent)] shrink-0" />
        <span className="text-sm font-medium text-[var(--text-primary)] flex-1 text-left truncate">
          {env.name || 'New Environment'}
        </span>
        <span className="text-[10px] text-[var(--text-muted)]">{env.targets.length} target{env.targets.length !== 1 ? 's' : ''}</span>
        <span
          role="button"
          onClick={onClone}
          className="p-0.5 rounded text-[var(--text-muted)] hover:text-[var(--text-accent)] hover:bg-[var(--bg-active)] transition-colors"
          title="Clone environment"
        >
          <Copy className="w-3 h-3" />
        </span>
        <span
          role="button"
          onClick={onRemove}
          className="p-0.5 rounded text-[var(--text-muted)] hover:text-red-400 hover:bg-red-500/10 transition-colors"
          title="Remove environment"
        >
          <Trash2 className="w-3 h-3" />
        </span>
        <span
          role="button"
          onClick={onClose}
          className="p-0.5 rounded text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-active)] transition-colors"
          title="Close"
        >
          <X className="w-3 h-3" />
        </span>
      </div>
      <div className="p-3 space-y-3">
        <TextField
          label="Environment Name"
          value={env.name}
          onChange={v => onChange({ ...env, name: v.toLowerCase().replace(/[^a-z0-9-]/g, '-') })}
          placeholder="production"
          required
        />
        {env.targets.map(target => (
          <TargetCard
            key={target.id}
            target={target}
            services={services}
            expanded={expandedTargetId === target.id}
            onToggle={() => onToggleTarget(target.id)}
            onChange={t => updateTarget(target.id, t)}
            onRemove={() => removeTarget(target.id)}
            onClone={() => cloneTarget(target.id)}
            onConnectFromResource={onConnectFromResource ? () => onConnectFromResource(target.id) : undefined}
            credentials={credentials}
          />
        ))}
        <button
          onClick={addTarget}
          className="w-full flex items-center justify-center gap-1.5 py-2 rounded-md border border-dashed border-[var(--border-default)] text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:border-[var(--text-secondary)] transition-colors"
        >
          <Plus className="w-3 h-3" />
          Add Target
        </button>
      </div>
    </div>
  )
}

// ── YAML Preview ──

function YamlPreview({ yaml, redactedYaml, filename, onImportToServer, importing, importError, saveLabel, defaultRedact = true, onCollapse }: {
  yaml: string
  redactedYaml?: string
  filename: string
  onImportToServer?: (yaml: string) => Promise<void>
  importing?: boolean
  importError?: string
  saveLabel?: string
  defaultRedact?: boolean
  onCollapse?: () => void
}) {
  const [copied, setCopied] = useState(false)
  const [showSecrets, setShowSecrets] = useState(!defaultRedact)
  const hasSensitive = redactedYaml != null && redactedYaml !== yaml

  const displayYaml = hasSensitive && !showSecrets ? redactedYaml : yaml

  const copyToClipboard = useCallback(() => {
    navigator.clipboard.writeText(displayYaml)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [displayYaml])

  const download = useCallback(() => {
    const blob = new Blob([yaml], { type: 'text/yaml' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename || 'workspace.yaml'
    a.click()
    URL.revokeObjectURL(url)
  }, [yaml, filename])

  const save = useCallback(async () => {
    try {
      const res = await fetch('/api/config/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ yaml, filename }),
      })
      if (res.ok) {
        const data = await res.json()
        alert(`Saved to ${data.path}`)
      }
    } catch {
      download()
    }
  }, [yaml, filename, download])

  const lines = displayYaml.split('\n')

  return (
    <div className="flex flex-col h-full">
      <div className="shrink-0 flex items-center gap-2 px-4 py-2.5 border-b border-[var(--border-default)] bg-[var(--bg-elevated)]">
        <FileText className="w-3.5 h-3.5 text-[var(--text-accent)]" />
        <span className="text-xs font-medium text-[var(--text-primary)] flex-1">YAML Preview</span>
        {hasSensitive && (
          <button
            onClick={() => setShowSecrets(v => !v)}
            className={cn(
              'flex items-center gap-1 px-2 py-1 rounded-md text-[10px] transition-colors',
              showSecrets
                ? 'text-amber-400 bg-amber-500/10 hover:bg-amber-500/20'
                : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
            )}
            title={showSecrets ? 'Hide credentials' : 'Show credentials'}
          >
            {showSecrets ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
            {showSecrets ? 'Secrets visible' : 'Secrets hidden'}
          </button>
        )}
        <button
          onClick={copyToClipboard}
          className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition-colors"
          title="Copy to clipboard"
        >
          {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
        <button
          onClick={save}
          className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition-colors"
          title="Save to disk"
        >
          <Save className="w-3 h-3" />
          Save
        </button>
        {onImportToServer ? (
          <Button size="sm" onClick={() => onImportToServer(yaml)} loading={importing} className="text-[10px] px-2.5 py-1">
            <ArrowDownToLine className="w-3 h-3" />
            {importing ? 'Saving...' : (saveLabel || 'Import to Server')}
          </Button>
        ) : (
          <Button size="sm" onClick={download} className="text-[10px] px-2.5 py-1">
            <ArrowDownToLine className="w-3 h-3" />
            Download
          </Button>
        )}
        {onCollapse && (
          <button
            onClick={onCollapse}
            className="p-1 rounded-md text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition-colors"
            title="Collapse panel"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      {importError && (
        <div className="px-4 py-2 bg-red-500/10 border-b border-red-500/20 text-xs text-red-400">
          {importError}
        </div>
      )}
      <div className="flex-1 overflow-auto font-mono text-[12px] leading-[20px]" style={{ background: 'var(--log-bg)' }}>
        {lines.map((line, i) => {
          let cls = 'text-[var(--text-primary)]'
          if (line.match(/^\s*#/)) cls = 'text-[var(--text-muted)]'
          else if (line.match(/^\S.*:$/)) cls = 'text-[var(--text-accent)] font-semibold'
          else if (line.match(/^\s{2}\S.*:$/)) cls = 'text-cyan-400 font-medium'
          else if (line.match(/^\s+-\s+name:/)) cls = 'text-amber-400'

          return (
            <div key={i} className="flex hover:bg-[var(--log-line-hover)] transition-colors">
              <span className="shrink-0 w-8 pr-2 text-right text-[var(--text-muted)] select-none opacity-40">{i + 1}</span>
              <span className={cn(cls, 'whitespace-pre')}>{line || ' '}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Theme toggle (standalone) ──

const themeOptions: { value: Theme; icon: React.FC<{ className?: string }> }[] = [
  { value: 'dark', icon: Moon },
  { value: 'light', icon: Sun },
  { value: 'auto', icon: MonitorIcon },
]

// ── Import Modal ──

function ImportModal({ onImport, onClose }: {
  onImport: (config: WorkspaceConfig) => void
  onClose: () => void
}) {
  const [yamlText, setYamlText] = useState('')
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  function handleParse() {
    try {
      const parsed = parseWorkspaceYaml(yamlText)
      onImport(parsed)
    } catch (e: any) {
      setError(e.message || 'Failed to parse YAML')
    }
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const text = reader.result as string
      setYamlText(text)
      setError('')
      try {
        const parsed = parseWorkspaceYaml(text)
        onImport(parsed)
      } catch (err: any) {
        setError(err.message || 'Failed to parse YAML')
      }
    }
    reader.readAsText(file)
  }

  return (
    <Modal title="Import Config" onClose={onClose} maxWidth="max-w-xl">
      <div className="space-y-4">
        <div>
          <button
            onClick={() => fileRef.current?.click()}
            className="w-full flex flex-col items-center gap-2 py-6 rounded-lg border-2 border-dashed border-[var(--border-default)] hover:border-[var(--text-accent)] hover:bg-[var(--bg-hover)] transition-colors cursor-pointer"
          >
            <Upload className="w-6 h-6 text-[var(--text-muted)]" />
            <span className="text-xs text-[var(--text-secondary)]">Click to upload a <span className="font-medium text-[var(--text-primary)]">.yaml</span> file</span>
          </button>
          <input ref={fileRef} type="file" accept=".yaml,.yml" onChange={handleFile} className="hidden" />
        </div>

        <div className="flex items-center gap-3">
          <div className="flex-1 h-px bg-[var(--border-default)]" />
          <span className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">or paste YAML</span>
          <div className="flex-1 h-px bg-[var(--border-default)]" />
        </div>

        <textarea
          value={yamlText}
          onChange={e => { setYamlText(e.target.value); setError('') }}
          placeholder={'workspace:\n  name: my-workspace\n  description: ...\n\nservices:\n  - name: api\n    provider: docker\n    ...'}
          rows={10}
          className="w-full px-3 py-2 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-default)] text-xs text-[var(--text-primary)] font-mono placeholder:text-[var(--text-subtle)] focus:outline-none focus:border-[var(--text-accent)] transition-colors resize-none"
        />

        {error && (
          <div className="px-3 py-2 rounded-md bg-red-500/10 border border-red-500/30 text-xs text-red-400">
            {error}
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-2">
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={handleParse} disabled={!yamlText.trim()}>Import</Button>
        </div>
      </div>
    </Modal>
  )
}

// ── Hierarchy Template Picker ──

const HIERARCHY_TEMPLATES = [
  {
    value: 'default',
    label: 'Standard',
    desc: 'Environment > Service',
    preview: ['production', '  api-service, web-app', 'staging', '  api-service, web-app'],
  },
  {
    value: 'service-first',
    label: 'Service-First',
    desc: 'Service > Environment',
    preview: ['api-service', '  production, staging', 'web-app', '  production, staging'],
  },
]

function HierarchyPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="block text-xs font-medium text-[var(--text-secondary)] mb-2">
        Hierarchy Template
      </label>
      <div className="grid grid-cols-2 gap-3">
        {HIERARCHY_TEMPLATES.map(t => (
          <button
            key={t.value}
            type="button"
            onClick={() => onChange(t.value)}
            className={cn(
              'flex flex-col p-3 rounded-lg border text-left transition-all',
              value === t.value
                ? 'border-[var(--text-accent)] bg-[var(--bg-active)]'
                : 'border-[var(--border-default)] bg-[var(--bg-elevated)] hover:border-[var(--border-default)] hover:bg-[var(--bg-hover)]'
            )}
          >
            <div className="flex items-center gap-2 mb-2">
              <div className={cn(
                'w-3 h-3 rounded-full border-2 flex items-center justify-center',
                value === t.value ? 'border-[var(--text-accent)]' : 'border-[var(--text-muted)]'
              )}>
                {value === t.value && <div className="w-1.5 h-1.5 rounded-full bg-[var(--text-accent)]" />}
              </div>
              <span className={cn(
                'text-xs font-semibold',
                value === t.value ? 'text-[var(--text-accent)]' : 'text-[var(--text-primary)]'
              )}>
                {t.label}
              </span>
              <span className="text-[10px] text-[var(--text-muted)]">{t.desc}</span>
            </div>
            <div className="font-mono text-[10px] leading-[16px] text-[var(--text-muted)] pl-5">
              {t.preview.map((line, i) => (
                <div key={i} className={line.startsWith(' ') ? 'text-[var(--text-muted)]' : 'text-[var(--text-secondary)] font-medium'}>
                  {line.startsWith(' ') ? `└ ${line.trim()}` : line}
                </div>
              ))}
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}

// ── Main Component ──

export type { WorkspaceConfig } from './types'

interface ConfigBuilderProps {
  onImportToServer?: (yaml: string, config: WorkspaceConfig) => Promise<void>
  onBack?: () => void
  editWorkspace?: string
  mode?: 'workspace' | 'environment' | 'service'
  serverMode?: boolean
  isAdmin?: boolean
}

export default function ConfigBuilder({ onImportToServer, onBack, editWorkspace, mode = 'workspace', serverMode, isAdmin }: ConfigBuilderProps = {}) {
  const { theme, setTheme } = useTheme()
  const [config, setConfig] = useState<WorkspaceConfig>(() => {
    const base = emptyConfig()
    if (mode === 'environment') {
      base.environments = [{ id: createId(), name: '', targets: [] }]
    } else if (mode === 'service') {
      base.services = [{ id: createId(), name: '', provider: 'file', friendly_name: '', config: {} }]
      base.environments = [{ id: createId(), name: '', targets: [{ id: createId(), name: '', type: 'kubernetes', connection: {}, credential_profile: '', service_names: [], service_overrides: [] }] }]
    }
    return base
  })
  const [serverImporting, setServerImporting] = useState(false)
  const [serverError, setServerError] = useState('')
  const [editLoading, setEditLoading] = useState(!!editWorkspace)
  const [adminRedact, setAdminRedact] = useState(true)
  const [credentials, setCredentials] = useState<AdminCredential[]>([])

  useEffect(() => {
    adminGetSettings()
      .then(s => setAdminRedact(s['redact_credentials'] !== 'false'))
      .catch(() => {})
    if (serverMode) {
      adminListCredentials()
        .then(c => setCredentials(c || []))
        .catch(() => {})
    }
  }, [])

  useEffect(() => {
    if (!editWorkspace) return
    adminGetWorkspaceYAML(editWorkspace)
      .then(yamlText => {
        setConfig(parseWorkspaceYaml(yamlText))
      })
      .catch(() => setServerError('Failed to load workspace'))
      .finally(() => setEditLoading(false))
  }, [editWorkspace])
  const [expandedSvcId, setExpandedSvcId] = useState<string | null>(null)
  const [expandedEnvId, setExpandedEnvId] = useState<string | null>(null)
  const [expandedTargetId, setExpandedTargetId] = useState<string | null>(null)
  const [showImport, setShowImport] = useState(false)
  const [resourceConnectTarget, setResourceConnectTarget] = useState<{ envId: string; targetId: string } | null>(null)
  const [yamlOpen, setYamlOpen] = useState(true)

  const yaml = useMemo(() => generateYaml(config, { mode }), [config, mode])
  const redactedYaml = useMemo(() => generateYaml(config, { redact: true, mode }), [config, mode])
  const defaultFilename = mode === 'service' ? 'service' : mode === 'environment' ? 'environment' : 'workspace'
  const filename = `${config.name || defaultFilename}.yaml`

  function cfg(fn: (d: WorkspaceConfig) => void) {
    setConfig(prev => update(prev, fn))
  }

  function addService() {
    const newId = createId()
    cfg(d => d.services.push({
      id: newId,
      name: '',
      provider: 'file',
      friendly_name: '',
      config: {},
    }))
    setExpandedSvcId(newId)
  }

  function updateService(id: string, svc: ServiceDef) {
    cfg(d => {
      const idx = d.services.findIndex(s => s.id === id)
      if (idx >= 0) d.services[idx] = svc
    })
  }

  function removeService(id: string) {
    cfg(d => { d.services = d.services.filter(s => s.id !== id) })
    if (expandedSvcId === id) setExpandedSvcId(null)
  }

  function handleResourceConnect(result: ConnectResult) {
    if (!resourceConnectTarget) return
    const { envId, targetId } = resourceConnectTarget
    cfg(d => {
      d.services.push(...result.services)
      for (const env of d.environments) {
        if (env.id === envId) {
          const target = env.targets.find(t => t.id === targetId)
          if (target) {
            target.type = 'kubernetes'
            target.connection = result.connection
            if (!target.name && result.targetName) {
              target.name = result.targetName.toLowerCase().replace(/[^a-z0-9-]/g, '-')
            }
            const existing = new Set(target.service_names)
            for (const name of result.serviceNames) {
              if (!existing.has(name)) target.service_names.push(name)
            }
          }
          break
        }
      }
    })
    setResourceConnectTarget(null)
  }

  function cloneService(id: string) {
    const source = config.services.find(s => s.id === id)
    if (!source) return
    const newId = createId()
    cfg(d => {
      const idx = d.services.findIndex(s => s.id === id)
      d.services.splice(idx + 1, 0, {
        ...structuredClone(source),
        id: newId,
        name: source.name ? `${source.name}-copy` : '',
      })
    })
    setExpandedSvcId(newId)
  }

  function addEnvironment() {
    const newId = createId()
    cfg(d => d.environments.push({
      id: newId,
      name: '',
      targets: [],
    }))
    setExpandedEnvId(newId)
  }

  function updateEnvironment(id: string, env: EnvironmentDef) {
    cfg(d => {
      const idx = d.environments.findIndex(e => e.id === id)
      if (idx >= 0) d.environments[idx] = env
    })
  }

  function removeEnvironment(id: string) {
    cfg(d => { d.environments = d.environments.filter(e => e.id !== id) })
    if (expandedEnvId === id) setExpandedEnvId(null)
  }

  function cloneEnvironment(id: string) {
    const source = config.environments.find(e => e.id === id)
    if (!source) return
    const newId = createId()
    const cloned: EnvironmentDef = {
      ...structuredClone(source),
      id: newId,
      name: source.name ? `${source.name}-copy` : '',
      targets: source.targets.map(t => ({
        ...structuredClone(t),
        id: createId(),
      })),
    }
    cfg(d => {
      const idx = d.environments.findIndex(e => e.id === id)
      d.environments.splice(idx + 1, 0, cloned)
    })
    setExpandedEnvId(newId)
  }

  if (editLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-[var(--bg-app)]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-[var(--text-muted)] border-t-[var(--text-accent)] rounded-full animate-spin" />
          <span className="text-sm text-[var(--text-secondary)]">Loading workspace...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="h-screen flex flex-col bg-[var(--bg-app)]">
      {/* Header */}
      <header className="h-14 shrink-0 flex items-center px-5 gap-4 border-b border-[var(--border-default)] bg-[var(--bg-surface)]">
        {onBack ? (
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
          >
            <ChevronRight className="w-4 h-4 rotate-180" />
            Back
          </button>
        ) : (
          <AvalokWordmark height={22} />
        )}
        <div className="w-px h-5 bg-[var(--border-default)]" />
        <span className="text-sm font-medium text-[var(--text-primary)]">
          {editWorkspace ? 'Edit Workspace' : onImportToServer ? (mode === 'service' ? 'Create Service' : mode === 'environment' ? 'Create Environment' : 'Create Workspace') : 'Config Builder'}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => setShowImport(true)}>
            <Upload className="w-3.5 h-3.5" />
            Import
          </Button>
          <div className="w-px h-5 bg-[var(--border-default)]" />
          <div className="flex items-center bg-[var(--bg-elevated)] rounded-lg p-0.5 border border-[var(--border-subtle)]">
            {themeOptions.map(opt => {
              const Icon = opt.icon
              return (
                <button
                  key={opt.value}
                  onClick={() => setTheme(opt.value)}
                  className={cn(
                    'p-1.5 rounded-md transition-all',
                    theme === opt.value
                      ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-sm'
                      : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                  )}
                >
                  <Icon className="w-3.5 h-3.5" />
                </button>
              )
            })}
          </div>
        </div>
      </header>

      {/* Body */}
      <div className="flex-1 flex min-h-0">
        {/* Left: Form */}
        <div className="flex-1 overflow-y-auto min-w-0">
          <div className="px-6 py-6 space-y-5">

            {mode === 'service' ? (
              <>
                {/* Service mode: single service definition */}
                <Section title="Service" icon={Box} defaultOpen>
                  <div className="grid grid-cols-2 gap-4">
                    <TextField
                      label="Service Name"
                      value={config.name}
                      onChange={v => {
                        cfg(d => {
                          d.name = v.toLowerCase().replace(/[^a-z0-9-]/g, '-')
                          if (d.services[0]) d.services[0].name = d.name
                        })
                      }}
                      placeholder="api-logs"
                      required
                    />
                    <TextField
                      label="Description"
                      value={config.description}
                      onChange={v => cfg(d => { d.description = v })}
                      placeholder="REST API log stream"
                    />
                  </div>
                  {config.services[0] && (() => {
                    const svc = config.services[0]
                    const fields = PROVIDER_FIELDS[svc.provider] ?? []
                    return (
                      <>
                        <TextField
                          label="Friendly Name"
                          value={svc.friendly_name}
                          onChange={v => cfg(d => { if (d.services[0]) d.services[0].friendly_name = v })}
                          placeholder="REST API"
                        />
                        <div>
                          <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                            Provider<span className="text-red-400 ml-0.5">*</span>
                          </label>
                          <div className="grid grid-cols-4 gap-1.5">
                            {PROVIDERS.map(p => {
                              const PIcon = ProviderIconWrapper(p.value)
                              return (
                                <button
                                  key={p.value}
                                  onClick={() => cfg(d => { if (d.services[0]) { d.services[0].provider = p.value; d.services[0].config = {} } })}
                                  className={cn(
                                    'flex items-center gap-1.5 px-2 py-1.5 rounded-md text-xs transition-all border',
                                    svc.provider === p.value
                                      ? 'bg-[var(--bg-active)] border-[var(--text-accent)] text-[var(--text-accent)] font-medium'
                                      : 'bg-[var(--bg-elevated)] border-[var(--border-subtle)] text-[var(--text-secondary)] hover:border-[var(--border-default)] hover:text-[var(--text-primary)]'
                                  )}
                                >
                                  <PIcon className="w-3 h-3 shrink-0" />
                                  {p.label}
                                </button>
                              )
                            })}
                          </div>
                        </div>
                        {fields.length > 0 && (
                          <div className="space-y-3 pt-1 border-t border-[var(--border-subtle)]">
                            <span className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">Provider Config</span>
                            {fields.map(field => (
                              <ConfigField
                                key={field.key}
                                field={field}
                                value={svc.config[field.key] ?? ''}
                                onChange={v => cfg(d => { if (d.services[0]) d.services[0].config[field.key] = v })}
                              />
                            ))}
                          </div>
                        )}
                      </>
                    )
                  })()}
                </Section>

                {/* Service mode: single target */}
                {config.environments[0]?.targets[0] && (() => {
                  const target = config.environments[0].targets[0]
                  const fields = TARGET_FIELDS[target.type] ?? []
                  return (
                    <Section title="Target" icon={Server} defaultOpen>
                      <TextField
                        label="Target Name"
                        value={target.name}
                        onChange={v => cfg(d => { if (d.environments[0]?.targets[0]) d.environments[0].targets[0].name = v.toLowerCase().replace(/[^a-z0-9-]/g, '-') })}
                        placeholder="prod-server"
                        required
                      />
                      <div>
                        <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                          Type<span className="text-red-400 ml-0.5">*</span>
                        </label>
                        <div className="grid grid-cols-4 gap-1.5">
                          {TARGET_TYPES.map(t => (
                            <button
                              key={t.value}
                              onClick={() => cfg(d => { if (d.environments[0]?.targets[0]) { d.environments[0].targets[0].type = t.value; d.environments[0].targets[0].connection = {} } })}
                              className={cn(
                                'px-2 py-1.5 rounded-md text-xs transition-all border',
                                target.type === t.value
                                  ? 'bg-[var(--bg-active)] border-[var(--text-accent)] text-[var(--text-accent)] font-medium'
                                  : 'bg-[var(--bg-elevated)] border-[var(--border-subtle)] text-[var(--text-secondary)] hover:border-[var(--border-default)] hover:text-[var(--text-primary)]'
                              )}
                            >
                              {t.label}
                            </button>
                          ))}
                        </div>
                      </div>
                      {(() => {
                        const matchingCreds = credentials.filter(c => c.target_type === target.type)
                        const hasCredentials = serverMode && matchingCreds.length > 0 && (target.type === 'ssh' || target.type === 'winrm')
                        const useProfile = hasCredentials && target.credential_profile !== ''
                        const targetFieldKeys = new Set(['host', 'port', 'sudo', 'use_https', 'insecure'])
                        const targetSpecificFields = fields.filter(f => targetFieldKeys.has(f.key))
                        const authSpecificFields = fields.filter(f => !targetFieldKeys.has(f.key))

                        if (!hasCredentials) {
                          return fields.length > 0 ? (
                            <div className="space-y-3">
                              {fields.map(field => (
                                <ConfigField
                                  key={field.key}
                                  field={field}
                                  value={target.connection[field.key] ?? ''}
                                  onChange={v => cfg(d => { if (d.environments[0]?.targets[0]) d.environments[0].targets[0].connection[field.key] = v })}
                                />
                              ))}
                            </div>
                          ) : null
                        }

                        return (
                          <>
                            {targetSpecificFields.length > 0 && (
                              <div className="space-y-3">
                                {targetSpecificFields.map(field => (
                                  <ConfigField
                                    key={field.key}
                                    field={field}
                                    value={target.connection[field.key] ?? ''}
                                    onChange={v => cfg(d => { if (d.environments[0]?.targets[0]) d.environments[0].targets[0].connection[field.key] = v })}
                                  />
                                ))}
                              </div>
                            )}

                            <div>
                              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">Authentication</label>
                              <div className="grid grid-cols-2 gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => cfg(d => { if (d.environments[0]?.targets[0]) d.environments[0].targets[0].credential_profile = '' })}
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
                                    if (first) cfg(d => {
                                      if (d.environments[0]?.targets[0]) {
                                        d.environments[0].targets[0].credential_profile = first.name
                                        const kept: Record<string, string> = {}
                                        for (const k of targetFieldKeys) {
                                          if (d.environments[0].targets[0].connection[k]) kept[k] = d.environments[0].targets[0].connection[k]
                                        }
                                        d.environments[0].targets[0].connection = kept
                                      }
                                    })
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
                                  value={target.credential_profile}
                                  onChange={e => cfg(d => { if (d.environments[0]?.targets[0]) d.environments[0].targets[0].credential_profile = e.target.value })}
                                  className="w-full px-3 py-1.5 rounded-md bg-[var(--bg-elevated)] border border-[var(--border-default)] text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--text-accent)] transition-colors"
                                >
                                  {matchingCreds.map(c => (
                                    <option key={c.name} value={c.name}>{c.name}{c.description ? ` — ${c.description}` : ''}</option>
                                  ))}
                                </select>
                                <p className="text-[10px] text-[var(--text-muted)] mt-0.5">Managed credential from Admin &gt; Credentials</p>
                              </div>
                            ) : authSpecificFields.length > 0 ? (
                              <div className="space-y-3">
                                {authSpecificFields.map(field => (
                                  <ConfigField
                                    key={field.key}
                                    field={field}
                                    value={target.connection[field.key] ?? ''}
                                    onChange={v => cfg(d => { if (d.environments[0]?.targets[0]) d.environments[0].targets[0].connection[field.key] = v })}
                                  />
                                ))}
                              </div>
                            ) : null}
                          </>
                        )
                      })()}
                    </Section>
                  )
                })()}
              </>
            ) : (
              <>
                {/* Workspace / Environment header section */}
                <Section title={mode === 'environment' ? 'Environment' : 'Workspace'} icon={mode === 'environment' ? FolderTree : Layers} defaultOpen>
                  <div className="grid grid-cols-2 gap-4">
                    <TextField
                      label={mode === 'environment' ? 'Environment Name' : 'Workspace Name'}
                      value={config.name}
                      onChange={v => cfg(d => { d.name = v.toLowerCase().replace(/[^a-z0-9-]/g, '-') })}
                      placeholder={mode === 'environment' ? 'production' : 'payments'}
                      required
                    />
                    <TextField
                      label="Description"
                      value={config.description}
                      onChange={v => cfg(d => { d.description = v })}
                      placeholder={mode === 'environment' ? 'Production Environment' : 'Payments Platform'}
                    />
                  </div>
                  {mode === 'workspace' && (
                    <HierarchyPicker
                      value={config.settings.hierarchy}
                      onChange={v => cfg(d => { d.settings.hierarchy = v })}
                    />
                  )}
                </Section>

                {/* Services */}
                <Section
                  title="Services"
                  icon={Box}
                  count={config.services.length}
                  defaultOpen
                  actions={
                    <button
                      onClick={addService}
                      className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium text-[var(--text-accent)] hover:bg-[var(--bg-active)] transition-colors"
                    >
                      <Plus className="w-3 h-3" />
                      Add
                    </button>
                  }
                >
                  {config.services.length === 0 ? (
                    <div className="text-center py-6">
                      <Box className="w-8 h-8 text-[var(--text-muted)] mx-auto mb-2 opacity-30" />
                      <p className="text-xs text-[var(--text-muted)] mb-3">No services defined yet</p>
                      <button
                        onClick={addService}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-[var(--text-accent)] text-white hover:opacity-90 hover:scale-[1.02] transition-all duration-150"
                      >
                        <Plus className="w-3 h-3" />
                        Add Service
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                        {config.services.map(svc => {
                          const SvcIcon = ProviderIconWrapper(svc.provider)
                          return (
                            <Card
                              key={svc.id}
                              hover
                              selected={expandedSvcId === svc.id}
                              padding="sm"
                              onClick={() => setExpandedSvcId(prev => prev === svc.id ? null : svc.id)}
                              className="cursor-pointer"
                            >
                              <div className="flex items-center gap-2">
                                <SvcIcon className="w-4 h-4 text-[var(--text-accent)] shrink-0" />
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-medium text-[var(--text-primary)] truncate">
                                    {svc.friendly_name || svc.name || 'New Service'}
                                  </p>
                                  <p className="text-[10px] text-[var(--text-muted)]">{svc.provider}</p>
                                </div>
                              </div>
                            </Card>
                          )
                        })}
                      </div>
                      {expandedSvcId && config.services.find(s => s.id === expandedSvcId) && (
                        <ServiceDetailForm
                          svc={config.services.find(s => s.id === expandedSvcId)!}
                          onChange={s => updateService(expandedSvcId, s)}
                          onRemove={() => { removeService(expandedSvcId); setExpandedSvcId(null) }}
                          onClone={() => cloneService(expandedSvcId)}
                          onClose={() => setExpandedSvcId(null)}
                        />
                      )}
                    </div>
                  )}
                </Section>

                {mode === 'environment' ? (
                  /* Environment mode: flat targets without environment wrapper */
                  <Section
                    title="Targets"
                    icon={Server}
                    count={config.environments[0]?.targets.length ?? 0}
                    defaultOpen
                    actions={
                      <button
                        onClick={() => {
                          const newId = createId()
                          cfg(d => {
                            if (!d.environments[0]) d.environments.push({ id: createId(), name: '', targets: [] })
                            d.environments[0].targets.push({
                              id: newId, name: '', type: 'kubernetes',
                              connection: {}, credential_profile: '', service_names: [], service_overrides: [],
                            })
                          })
                          setExpandedTargetId(newId)
                        }}
                        className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium text-[var(--text-accent)] hover:bg-[var(--bg-active)] transition-colors"
                      >
                        <Plus className="w-3 h-3" />
                        Add
                      </button>
                    }
                  >
                    {(config.environments[0]?.targets ?? []).length === 0 ? (
                      <div className="text-center py-6">
                        <Server className="w-8 h-8 text-[var(--text-muted)] mx-auto mb-2 opacity-30" />
                        <p className="text-xs text-[var(--text-muted)] mb-3">No targets defined yet</p>
                        <button
                          onClick={() => {
                            const newId = createId()
                            cfg(d => {
                              if (!d.environments[0]) d.environments.push({ id: createId(), name: '', targets: [] })
                              d.environments[0].targets.push({
                                id: newId, name: '', type: 'kubernetes',
                                connection: {}, credential_profile: '', service_names: [], service_overrides: [],
                              })
                            })
                            setExpandedTargetId(newId)
                          }}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-[var(--text-accent)] text-white hover:opacity-90 hover:scale-[1.02] transition-all duration-150"
                        >
                          <Plus className="w-3 h-3" />
                          Add Target
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {config.environments[0].targets.map(target => (
                          <TargetCard
                            key={target.id}
                            target={target}
                            services={config.services}
                            expanded={expandedTargetId === target.id}
                            onToggle={() => setExpandedTargetId(prev => prev === target.id ? null : target.id)}
                            onChange={t => cfg(d => {
                              const idx = d.environments[0].targets.findIndex(x => x.id === target.id)
                              if (idx >= 0) d.environments[0].targets[idx] = t
                            })}
                            onRemove={() => cfg(d => {
                              d.environments[0].targets = d.environments[0].targets.filter(x => x.id !== target.id)
                            })}
                            onClone={() => {
                              const newId = createId()
                              cfg(d => {
                                const idx = d.environments[0].targets.findIndex(x => x.id === target.id)
                                d.environments[0].targets.splice(idx + 1, 0, {
                                  ...structuredClone(target),
                                  id: newId,
                                  name: target.name ? `${target.name}-copy` : '',
                                })
                              })
                              setExpandedTargetId(newId)
                            }}
                            onConnectFromResource={serverMode && isAdmin ? () => setResourceConnectTarget({ envId: config.environments[0]?.id || '', targetId: target.id }) : undefined}
                            credentials={serverMode ? credentials : undefined}
                          />
                        ))}
                      </div>
                    )}
                  </Section>
                ) : (
                  <>
                    {/* Workspace mode: Environments with nested targets */}
                    <Section
                      title="Environments"
                      icon={FolderTree}
                      count={config.environments.length}
                      defaultOpen
                      actions={
                        <button
                          onClick={addEnvironment}
                          className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium text-[var(--text-accent)] hover:bg-[var(--bg-active)] transition-colors"
                        >
                          <Plus className="w-3 h-3" />
                          Add
                        </button>
                      }
                    >
                      {config.environments.length === 0 ? (
                        <div className="text-center py-6">
                          <FolderTree className="w-8 h-8 text-[var(--text-muted)] mx-auto mb-2 opacity-30" />
                          <p className="text-xs text-[var(--text-muted)] mb-3">No environments defined yet</p>
                          <button
                            onClick={addEnvironment}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-[var(--text-accent)] text-white hover:opacity-90 hover:scale-[1.02] transition-all duration-150"
                          >
                            <Plus className="w-3 h-3" />
                            Add Environment
                          </button>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                            {config.environments.map(env => (
                              <Card
                                key={env.id}
                                hover
                                selected={expandedEnvId === env.id}
                                padding="sm"
                                onClick={() => setExpandedEnvId(prev => prev === env.id ? null : env.id)}
                                className="cursor-pointer"
                              >
                                <div className="flex items-center gap-2">
                                  <FolderTree className="w-4 h-4 text-[var(--text-accent)] shrink-0" />
                                  <div className="flex-1 min-w-0">
                                    <p className="text-xs font-medium text-[var(--text-primary)] truncate">
                                      {env.name || 'New Environment'}
                                    </p>
                                    <p className="text-[10px] text-[var(--text-muted)]">
                                      {env.targets.length} target{env.targets.length !== 1 ? 's' : ''}
                                    </p>
                                  </div>
                                </div>
                              </Card>
                            ))}
                          </div>
                          {expandedEnvId && config.environments.find(e => e.id === expandedEnvId) && (
                            <EnvironmentDetailForm
                              env={config.environments.find(e => e.id === expandedEnvId)!}
                              services={config.services}
                              expandedTargetId={expandedTargetId}
                              onToggleTarget={id => setExpandedTargetId(prev => prev === id ? null : id)}
                              onChange={e => updateEnvironment(expandedEnvId, e)}
                              onRemove={() => { removeEnvironment(expandedEnvId); setExpandedEnvId(null) }}
                              onClone={() => cloneEnvironment(expandedEnvId)}
                              onClose={() => setExpandedEnvId(null)}
                              onConnectFromResource={serverMode && isAdmin ? (targetId) => setResourceConnectTarget({ envId: expandedEnvId, targetId }) : undefined}
                              credentials={serverMode ? credentials : undefined}
                            />
                          )}
                        </div>
                      )}
                    </Section>

                    {/* Settings (workspace mode only) */}
                    <Section title="Settings" icon={Settings} defaultOpen={false}>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">SSH Timeout</label>
                          <input
                            type="number"
                            value={config.settings.ssh_timeout || ''}
                            onChange={e => cfg(d => { d.settings.ssh_timeout = parseInt(e.target.value) || 0 })}
                            placeholder="30"
                            className="w-full px-3 py-1.5 rounded-md bg-[var(--bg-elevated)] border border-[var(--border-default)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-subtle)] focus:outline-none focus:border-[var(--text-accent)] transition-colors"
                          />
                          <p className="text-[10px] text-[var(--text-muted)] mt-0.5">SSH connection timeout in seconds</p>
                        </div>
                      </div>
                    </Section>
                  </>
                )}
              </>
            )}

          </div>
        </div>

        {/* Right: YAML Preview (collapsible) */}
        <div className={cn(
          'shrink-0 border-l border-[var(--border-strong)] flex flex-col min-w-0 transition-all duration-200',
          yamlOpen ? 'w-[480px]' : 'w-10'
        )}>
          {yamlOpen ? (
            <YamlPreview
              yaml={yaml}
              redactedYaml={redactedYaml}
              filename={filename}
              defaultRedact={adminRedact}
              onImportToServer={onImportToServer ? async (y) => {
                setServerError('')
                setServerImporting(true)
                try {
                  await onImportToServer(y, config)
                } catch (err: unknown) {
                  setServerError(err instanceof Error ? err.message : 'Failed to save')
                } finally {
                  setServerImporting(false)
                }
              } : undefined}
              importing={serverImporting}
              importError={serverError}
              saveLabel={editWorkspace ? 'Save Changes' : undefined}
              onCollapse={() => setYamlOpen(false)}
            />
          ) : (
            <button
              onClick={() => setYamlOpen(true)}
              className="flex flex-col items-center gap-2 py-4 w-full text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors"
              title="Show YAML preview"
            >
              <ChevronLeft className="w-4 h-4" />
              <span className="text-[10px] font-medium [writing-mode:vertical-lr] rotate-180">YAML</span>
            </button>
          )}
        </div>
      </div>

      {showImport && (
        <ImportModal
          onImport={imported => {
            setConfig(imported)
            setShowImport(false)
            setExpandedSvcId(null)
            setExpandedEnvId(null)
            setExpandedTargetId(null)
          }}
          onClose={() => setShowImport(false)}
        />
      )}

      {resourceConnectTarget && (
        <ResourceImporter
          onConnect={handleResourceConnect}
          onClose={() => setResourceConnectTarget(null)}
          existingServices={config.services}
        />
      )}
    </div>
  )
}
