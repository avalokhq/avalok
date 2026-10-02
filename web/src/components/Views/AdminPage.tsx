import { useState, useEffect, useCallback, useRef, useId } from 'react'
import Page from '../Layout/Page'
import { Users, KeyRound, CheckCircle, XCircle, Shield, UserCheck, Trash2, Plus, Pencil, KeySquare, Settings, AlertTriangle, MinusCircle, PlugZap, Server, X } from 'lucide-react'
import { cn } from '../../lib/cn'
import { plural } from '../../lib/format'
import type { Tone } from '../../lib/statusTone'
import PageHeader from '../ui/PageHeader'
import Tabs from '../ui/Tabs'
import DataTable, { type Column } from '../ui/DataTable'
import Modal from '../ui/Modal'
import Button from '../ui/Button'
import Input, { Textarea, Select } from '../ui/Input'
import Card from '../ui/Card'
import Alert from '../ui/Alert'
import Toggle from '../ui/Toggle'
import Checkbox from '../ui/Checkbox'
import Section from '../ui/Section'
import EmptyState from '../ui/EmptyState'
import SettingsRow from '../ui/SettingsRow'
import FormField from '../ui/FormField'
import Badge from '../ui/Badge'
import StatusDot from '../ui/StatusDot'
import { ActionMenu, type MenuItem } from '../ui/Dropdown'
import { useConfirm, useToast } from '../ui/Feedback'

import ProviderIcon from '../ui/ProviderIcon'

const KUBERNETES_LOGO = 'https://cdn.jsdelivr.net/gh/selfhst/icons@main/webp/kubernetes.webp'
import {
  adminListUsers, adminApproveUser, adminDisableUser, adminDeleteUser, adminCreateUser, adminUpdateUser, adminResetPassword,
  adminListCredentials, adminGetCredential, adminCreateCredential, adminUpdateCredential, adminDeleteCredential, adminTestCredential,
  adminListResources, adminListResourceNamespaces,
  adminGetSettings, adminUpdateSettings,
  listWorkspaces, listEnvironments, listServices,
  listStandaloneEnvs, listStandaloneEnvServices, listStandaloneServices,
} from '../../lib/api'
import type { AdminUser, AdminCredential, AdminResource, NamespaceInfo, CredentialTestResult, CredentialTestStep } from '../../lib/api'
import type { Workspace, Environment, Service, StandaloneEnvironment, StandaloneService } from '../../lib/types'
import {
  type StorageField, type AzureAuthMethod,
  AZURE_AUTH_TABS, AZURE_AUTH_FIELDS, detectAzureAuth,
} from '../../lib/resourceConstants'

type Tab = 'users' | 'credentials' | 'settings'

interface Props {
  userRole: string
  initialTab?: string
  highlightSetting?: string
  onSettingsChange?: (settings: Record<string, string>) => void
  onHighlightConsumed?: () => void
}

const TAB_DESCRIPTIONS: Record<Tab, string> = {
  users: 'Approve sign-ups, assign roles and limit what each user can see.',
  credentials: 'Reusable connection profiles referenced by services and resources.',
  settings: 'Server-wide behaviour, visibility and streaming limits.',
}

export default function AdminPage({ userRole, initialTab, highlightSetting, onSettingsChange, onHighlightConsumed }: Props) {
  const [tab, setTab] = useState<Tab>((initialTab as Tab) || 'users')

  useEffect(() => {
    if (initialTab) {
      setTab(initialTab as Tab)
    }
  }, [initialTab])

  const tabs = [
    { id: 'users', label: 'Users', icon: Users },
    ...(userRole === 'admin' ? [
      { id: 'credentials', label: 'Credentials', icon: KeyRound },
      { id: 'settings', label: 'Settings', icon: Settings },
    ] : []),
  ]

  return (
    <Page>
      <PageHeader eyebrow="Admin" title="Administration" description={TAB_DESCRIPTIONS[tab]} />

      <div className="mb-6">
        <Tabs tabs={tabs} active={tab} onChange={(id) => setTab(id as Tab)} />
      </div>

      {tab === 'users' && <UsersPanel userRole={userRole} />}
      {tab === 'credentials' && <CredentialsPanel />}
      {tab === 'settings' && <SettingsPanel onSettingsChange={onSettingsChange} highlightSetting={highlightSetting} onHighlightConsumed={onHighlightConsumed} />}
    </Page>
  )
}

/** Count line on the left, primary action on the right. */
function PanelToolbar({ summary, action }: { summary: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <p className="text-sm text-fg-muted">{summary}</p>
      {action}
    </div>
  )
}

// --- Scope tree types ---

interface ScopeNode {
  workspace: Workspace
  environments: { env: Environment; services: Service[] }[]
}

interface StandaloneEnvScopeNode {
  env: StandaloneEnvironment
  services: Service[]
}

interface ResourceScopeNode {
  resource: AdminResource
  namespaces: NamespaceInfo[]
}

interface ScopeData {
  workspaces: ScopeNode[]
  standaloneEnvs: StandaloneEnvScopeNode[]
  standaloneServices: StandaloneService[]
  resources: ResourceScopeNode[]
}

const EMPTY_SCOPE: ScopeData = { workspaces: [], standaloneEnvs: [], standaloneServices: [], resources: [] }

async function loadScopeTree(): Promise<ScopeData> {
  const [workspaces, saEnvs, saSvcs, resources] = await Promise.all([
    listWorkspaces().catch(() => []),
    listStandaloneEnvs().catch(() => []),
    listStandaloneServices().catch(() => []),
    adminListResources().catch(() => []),
  ])

  const wsNodes: ScopeNode[] = []
  for (const ws of workspaces || []) {
    const envs = await listEnvironments(ws.name).catch(() => [])
    const envNodes: ScopeNode['environments'] = []
    for (const env of envs) {
      const svcs = await listServices(ws.name, env.name).catch(() => [])
      envNodes.push({ env, services: svcs })
    }
    wsNodes.push({ workspace: ws, environments: envNodes })
  }

  const envNodes: StandaloneEnvScopeNode[] = []
  for (const env of saEnvs || []) {
    const svcs = await listStandaloneEnvServices(env.name).catch(() => [])
    envNodes.push({ env, services: svcs })
  }

  const resNodes: ResourceScopeNode[] = []
  for (const res of resources || []) {
    const ns = await adminListResourceNamespaces(res.name).catch(() => [])
    resNodes.push({ resource: res, namespaces: ns || [] })
  }

  return { workspaces: wsNodes, standaloneEnvs: envNodes, standaloneServices: saSvcs || [], resources: resNodes }
}

// --- Scope Picker ---

type ScopeType = 'workspace' | 'environment' | 'service' | 'resource'

const SCOPE_TABS = [
  { id: 'workspace', label: 'Workspaces' },
  { id: 'environment', label: 'Environments' },
  { id: 'service', label: 'Services' },
  { id: 'resource', label: 'Resources' },
]

const DEPTH_PAD = ['pl-3', 'pl-8', 'pl-13']

function ScopeRow({ checked, onToggle, name, kind, depth = 0, icon }: {
  checked: boolean
  onToggle: () => void
  name: string
  kind: string
  depth?: number
  icon?: React.ReactNode
}) {
  return (
    <Checkbox
      checked={checked}
      onChange={onToggle}
      className={cn('flex w-full py-2 pr-3 transition-colors hover:bg-hover', DEPTH_PAD[depth])}
      label={
        <span className="flex min-w-0 items-center gap-2">
          {icon}
          <span className={cn('truncate', depth === 0 ? 'font-medium text-fg' : 'text-fg-secondary')}>{name}</span>
          <span className="text-xs text-fg-muted">{kind}</span>
        </span>
      }
    />
  )
}

function ScopeEmpty({ children }: { children: React.ReactNode }) {
  return <div className="py-4 text-center text-xs text-fg-muted">{children}</div>
}

function ScopePicker({ scope, onChange, scopeData }: { scope: string[]; onChange: (s: string[]) => void; scopeData: ScopeData }) {
  const [scopeType, setScopeType] = useState<ScopeType>('workspace')
  const scopeSet = new Set(scope)

  function isParentChecked(path: string) {
    const parts = path.split('/')
    for (let i = 1; i < parts.length; i++) {
      if (scopeSet.has(parts.slice(0, i).join('/'))) return true
    }
    return false
  }

  function toggle(path: string) {
    const next = new Set(scopeSet)
    if (next.has(path)) {
      next.delete(path)
    } else {
      for (const s of next) {
        if (s.startsWith(path + '/')) next.delete(s)
      }
      const parts = path.split('/')
      for (let i = 1; i < parts.length; i++) {
        next.delete(parts.slice(0, i).join('/'))
      }
      next.add(path)
    }
    onChange([...next].sort())
  }

  return (
    <div>
      <Tabs variant="pill" tabs={SCOPE_TABS} active={scopeType} onChange={id => setScopeType(id as ScopeType)} className="mb-2" />

      <div className="max-h-64 divide-y divide-line overflow-auto rounded-control border border-line bg-surface-sunken">
        {scopeType === 'workspace' && (
          scopeData.workspaces.length === 0
            ? <ScopeEmpty>No workspaces available</ScopeEmpty>
            : scopeData.workspaces.map(node => {
                const wsPath = node.workspace.name
                const wsChecked = scopeSet.has(wsPath)
                return (
                  <div key={wsPath}>
                    <ScopeRow checked={wsChecked || isParentChecked(wsPath)} onToggle={() => toggle(wsPath)} name={node.workspace.name} kind="workspace" />
                    {!wsChecked && node.environments.map(({ env, services }) => {
                      const envPath = `${wsPath}/${env.name}`
                      const envChecked = scopeSet.has(envPath)
                      return (
                        <div key={envPath}>
                          <ScopeRow depth={1} checked={envChecked || isParentChecked(envPath)} onToggle={() => toggle(envPath)} name={env.name} kind="environment" />
                          {!envChecked && services.map(svc => {
                            const svcPath = `${envPath}/${svc.name}`
                            return (
                              <ScopeRow key={svcPath} depth={2} checked={scopeSet.has(svcPath) || isParentChecked(svcPath)} onToggle={() => toggle(svcPath)} name={svc.friendly_name || svc.name} kind="service" />
                            )
                          })}
                        </div>
                      )
                    })}
                  </div>
                )
              })
        )}

        {scopeType === 'environment' && (
          scopeData.standaloneEnvs.length === 0
            ? <ScopeEmpty>No standalone environments available</ScopeEmpty>
            : scopeData.standaloneEnvs.map(node => {
                const envPath = `env:${node.env.name}`
                const envChecked = scopeSet.has(envPath)
                return (
                  <div key={envPath}>
                    <ScopeRow checked={envChecked} onToggle={() => toggle(envPath)} name={node.env.name} kind="environment" />
                    {!envChecked && node.services.map(svc => {
                      const svcPath = `env:${node.env.name}/${svc.name}`
                      return (
                        <ScopeRow key={svcPath} depth={1} checked={scopeSet.has(svcPath)} onToggle={() => toggle(svcPath)} name={svc.friendly_name || svc.name} kind="service" />
                      )
                    })}
                  </div>
                )
              })
        )}

        {scopeType === 'service' && (
          scopeData.standaloneServices.length === 0
            ? <ScopeEmpty>No standalone services available</ScopeEmpty>
            : scopeData.standaloneServices.map(svc => {
                const svcPath = `svc:${svc.name}`
                return (
                  <ScopeRow key={svcPath} checked={scopeSet.has(svcPath)} onToggle={() => toggle(svcPath)} name={svc.name} kind={svc.provider}
                    icon={<ProviderIcon provider={svc.provider} className="size-4 shrink-0" />} />
                )
              })
        )}

        {scopeType === 'resource' && (
          scopeData.resources.length === 0
            ? <ScopeEmpty>No resources available</ScopeEmpty>
            : scopeData.resources.map(node => {
                const resPath = `res:${node.resource.name}`
                const resChecked = scopeSet.has(resPath)
                return (
                  <div key={resPath}>
                    <ScopeRow checked={resChecked} onToggle={() => toggle(resPath)} name={node.resource.name} kind={node.resource.type}
                      icon={<img src={KUBERNETES_LOGO} alt="" className="size-4 shrink-0" />} />
                    {!resChecked && node.namespaces.map(ns => {
                      const nsPath = `res:${node.resource.name}/${ns.name}`
                      return (
                        <ScopeRow key={nsPath} depth={1} checked={scopeSet.has(nsPath) || isParentChecked(nsPath)} onToggle={() => toggle(nsPath)} name={ns.name} kind="namespace" />
                      )
                    })}
                  </div>
                )
              })
        )}
      </div>
    </div>
  )
}

/** Selected scope entries as removable chips. */
function ScopeChips({ scope, onChange }: { scope: string[]; onChange: (s: string[]) => void }) {
  if (scope.length === 0) return null
  return (
    <div className="mb-2 flex flex-wrap items-center gap-1.5">
      {scope.map(s => (
        <span key={s} className="inline-flex h-6 items-center gap-1 rounded-control border border-line bg-surface-sunken pl-2 pr-1 text-xs text-fg-secondary">
          {formatScope(s)}
          <button type="button" aria-label={`Remove ${formatScope(s)}`} onClick={() => onChange(scope.filter(x => x !== s))}
            className="flex size-4 cursor-pointer items-center justify-center rounded-sm text-fg-muted transition-colors hover:bg-hover hover:text-danger">
            <X className="size-3" />
          </button>
        </span>
      ))}
      <Button variant="ghost" size="sm" type="button" onClick={() => onChange([])}>Clear all</Button>
    </div>
  )
}

// --- Users Panel ---

const ROLE_TONE: Record<string, Tone> = { admin: 'accent' }
const USER_STATUS_TONE: Record<string, Tone> = { active: 'success', pending: 'warning', disabled: 'danger' }

function initials(name: string) {
  return name.split(/[\s._-]+/).filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase() || '?'
}

function UsersPanel({ userRole }: { userRole: string }) {
  const [users, setUsers] = useState<AdminUser[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null)
  const [resetUser, setResetUser] = useState<AdminUser | null>(null)
  const [error, setError] = useState<string | null>(null)
  const confirm = useConfirm()
  const toast = useToast()
  const isAdmin = userRole === 'admin'

  async function load() {
    try {
      setUsers(await adminListUsers() || [])
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load users')
    } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  async function handleApprove(u: AdminUser) {
    try { await adminApproveUser(u.id); toast.success(`Approved ${u.username}`); load() }
    catch (err) { toast.error("Couldn't approve user", err instanceof Error ? err.message : undefined) }
  }
  async function handleDisable(u: AdminUser) {
    const ok = await confirm({
      title: `Disable ${u.username}?`,
      description: 'They are signed out and cannot sign in again until re-approved.',
      confirmLabel: 'Disable',
      danger: true,
    })
    if (!ok) return
    try { await adminDisableUser(u.id); toast.success(`Disabled ${u.username}`); load() }
    catch (err) { toast.error("Couldn't disable user", err instanceof Error ? err.message : undefined) }
  }
  async function handleDelete(u: AdminUser) {
    const ok = await confirm({
      title: `Delete ${u.username}?`,
      description: 'The account is removed permanently. This cannot be undone.',
      confirmLabel: 'Delete',
      danger: true,
    })
    if (!ok) return
    try { await adminDeleteUser(u.id); toast.success(`Deleted ${u.username}`); load() }
    catch (err) { toast.error("Couldn't delete user", err instanceof Error ? err.message : undefined) }
  }

  function menuFor(u: AdminUser): MenuItem[] {
    return [
      { label: 'Edit access', icon: <Pencil />, onClick: () => setEditingUser(u) },
      { label: 'Reset password', icon: <KeySquare />, onClick: () => setResetUser(u) },
      ...(u.status === 'active' ? [{ label: 'Disable', icon: <XCircle />, onClick: () => handleDisable(u) }] : []),
      { separator: true },
      { label: 'Delete', icon: <Trash2 />, danger: true, onClick: () => handleDelete(u) },
    ]
  }

  const pending = users.filter(u => u.status === 'pending').length

  const userColumns: Column<AdminUser>[] = [
    {
      key: 'user',
      header: 'User',
      sortValue: u => u.username.toLowerCase(),
      render: u => (
        <div className="flex min-w-0 items-center gap-3">
          <span aria-hidden className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-xs font-semibold text-accent">
            {initials(u.username)}
          </span>
          <div className="min-w-0">
            <div className="truncate font-medium text-fg">{u.username}</div>
            {u.email && <div className="truncate text-xs text-fg-muted">{u.email}</div>}
          </div>
        </div>
      ),
    },
    {
      key: 'role',
      header: 'Role',
      className: 'w-28',
      sortValue: u => u.role,
      render: u => (
        <Badge tone={ROLE_TONE[u.role] ?? 'neutral'}>
          <Shield className="size-3" />
          {u.role}
        </Badge>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      className: 'w-32',
      sortValue: u => u.status,
      render: u => <Badge tone={USER_STATUS_TONE[u.status] ?? 'neutral'} dot>{u.status}</Badge>,
    },
    {
      key: 'scope',
      header: 'Access',
      className: 'max-w-72',
      render: u => (
        u.scope && u.scope.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {u.scope.slice(0, 3).map(s => <Badge key={s}>{formatScope(s)}</Badge>)}
            {u.scope.length > 3 && <Badge title={u.scope.map(formatScope).join(', ')}>+{u.scope.length - 3}</Badge>}
          </div>
        ) : (
          <span className="text-xs text-fg-muted">Full access</span>
        )
      ),
    },
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      className: 'w-40',
      align: 'right',
      render: u => (
        <div className="flex items-center justify-end gap-1" onClick={e => e.stopPropagation()}>
          {u.status === 'pending' && (
            <Button size="sm" variant="secondary" leftIcon={<UserCheck />} onClick={() => handleApprove(u)}>Approve</Button>
          )}
          {isAdmin && <ActionMenu items={menuFor(u)} label={`Actions for ${u.username}`} />}
        </div>
      ),
    },
  ]

  return (
    <div>
      <PanelToolbar
        summary={loading ? 'Loading users…' : <>{plural(users.length, 'user')}{pending > 0 && <span className="text-warning"> · {pending} awaiting approval</span>}</>}
        action={isAdmin && <Button leftIcon={<Plus />} onClick={() => setShowCreate(true)}>Create user</Button>}
      />

      {showCreate && <CreateUserModal onClose={() => setShowCreate(false)} onCreated={name => { setShowCreate(false); toast.success(`Created ${name}`); load() }} />}

      {editingUser && (
        <EditUserModal
          user={editingUser}
          userRole={userRole}
          onClose={() => setEditingUser(null)}
          onSaved={() => { toast.success(`Updated ${editingUser.username}`); setEditingUser(null); load() }}
        />
      )}

      {resetUser && (
        <ResetPasswordModal
          user={resetUser}
          onClose={() => setResetUser(null)}
          onDone={() => { toast.success(`Password reset for ${resetUser.username}`); setResetUser(null); load() }}
        />
      )}

      <DataTable
        columns={userColumns}
        data={users}
        keyFn={(u) => u.id}
        loading={loading}
        error={error}
        onRetry={load}
        empty={<EmptyState icon={<Users />} title="No users yet" compact />}
      />
    </div>
  )
}

function CreateUserModal({ onClose, onCreated }: { onClose: () => void; onCreated: (username: string) => void }) {
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState('reader')
  const [scope, setScope] = useState<string[]>([])
  const [scopeData, setScopeData] = useState<ScopeData>(EMPTY_SCOPE)
  const [showScope, setShowScope] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const formId = useId()

  useEffect(() => {
    loadScopeTree().then(setScopeData).catch(() => {})
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      await adminCreateUser({ username, email, password, role, scope })
      onCreated(username)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create user')
    } finally { setLoading(false) }
  }

  return (
    <Modal
      title="Create user"
      description="The account is active immediately."
      size="lg"
      onClose={onClose}
      dismissible={false}
      footer={
        <>
          <Button variant="ghost" type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" form={formId} loading={loading}>Create user</Button>
        </>
      }
    >
      <form id={formId} onSubmit={handleSubmit} className="flex flex-col gap-4">
        {error && <Alert tone="danger">{error}</Alert>}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField label="Username" required>
            <Input value={username} onChange={e => setUsername(e.target.value)} placeholder="jane" autoComplete="off" required />
          </FormField>
          <FormField label="Email" hint="optional">
            <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="jane@example.com" />
          </FormField>
          <FormField label="Password" required>
            <Input type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="new-password" required />
          </FormField>
          <FormField label="Role">
            <Select value={role} onChange={e => setRole(e.target.value)}>
              <option value="reader">Reader</option>
              <option value="admin">Admin</option>
            </Select>
          </FormField>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-medium text-fg">Access scope</div>
              <div className="text-xs text-fg-muted">{scope.length ? `${scope.length} selected` : 'Full access to everything'}</div>
            </div>
            <Button variant="secondary" size="sm" type="button" onClick={() => setShowScope(!showScope)}>
              {showScope ? 'Hide' : 'Limit access'}
            </Button>
          </div>
          {showScope && (
            <>
              <ScopeChips scope={scope} onChange={setScope} />
              <ScopePicker scope={scope} onChange={setScope} scopeData={scopeData} />
            </>
          )}
        </div>
      </form>
    </Modal>
  )
}

function EditUserModal({ user, userRole, onClose, onSaved }: { user: AdminUser; userRole: string; onClose: () => void; onSaved: () => void }) {
  const [role, setRole] = useState(user.role)
  const [scope, setScope] = useState<string[]>(user.scope || [])
  const [expiresAt, setExpiresAt] = useState(user.expires_at ? new Date(user.expires_at).toISOString().slice(0, 16) : '')
  const [scopeData, setScopeData] = useState<ScopeData>(EMPTY_SCOPE)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const formId = useId()

  useEffect(() => {
    loadScopeTree().then(setScopeData).catch(() => {})
  }, [])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const data: { role?: string; scope?: string[]; expires_at?: string | null } = { scope }
      if (userRole === 'admin') data.role = role
      data.expires_at = expiresAt ? new Date(expiresAt).toISOString() : null
      await adminUpdateUser(user.id, data)
      onSaved()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to update user')
    } finally { setLoading(false) }
  }

  return (
    <Modal
      title={`Edit ${user.username}`}
      description="Role, expiry and the parts of Avalok this user can see."
      size="lg"
      onClose={onClose}
      dismissible={false}
      footer={
        <>
          <Button variant="ghost" type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" form={formId} loading={loading}>Save changes</Button>
        </>
      }
    >
      <form id={formId} onSubmit={handleSave} className="flex flex-col gap-4">
        {error && <Alert tone="danger">{error}</Alert>}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {userRole === 'admin' && (
            <FormField label="Role">
              <Select value={role} onChange={e => setRole(e.target.value)}>
                <option value="reader">Reader</option>
                <option value="admin">Admin</option>
              </Select>
            </FormField>
          )}
          <FormField label="Expires" hint="optional">
            <div className="flex items-center gap-2">
              <Input type="datetime-local" value={expiresAt} onChange={e => setExpiresAt(e.target.value)} />
              {expiresAt && <Button variant="ghost" size="sm" type="button" onClick={() => setExpiresAt('')}>Clear</Button>}
            </div>
          </FormField>
        </div>

        <div>
          <div className="mb-2">
            <div className="text-sm font-medium text-fg">Access scope</div>
            <div className="text-xs text-fg-muted">{scope.length === 0 ? 'Full access to everything. Tick entries below to restrict.' : 'Only the selected entries (and their children) are visible.'}</div>
          </div>
          <ScopeChips scope={scope} onChange={setScope} />
          <ScopePicker scope={scope} onChange={setScope} scopeData={scopeData} />
        </div>
      </form>
    </Modal>
  )
}

function ResetPasswordModal({ user, onClose, onDone }: { user: AdminUser; onClose: () => void; onDone: () => void }) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const formId = useId()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (password !== confirm) {
      setError('Passwords do not match')
      return
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }
    setLoading(true)
    setError('')
    try {
      await adminResetPassword(user.id, password)
      onDone()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to reset password')
    } finally { setLoading(false) }
  }

  return (
    <Modal
      title={`Reset password for ${user.username}`}
      size="sm"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" form={formId} loading={loading}>Reset password</Button>
        </>
      }
    >
      <form id={formId} onSubmit={handleSubmit} className="flex flex-col gap-4">
        {error && <Alert tone="danger">{error}</Alert>}
        <FormField label="New password" hint="at least 8 characters" required>
          <Input type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="new-password" required />
        </FormField>
        <FormField label="Confirm password" required>
          <Input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} autoComplete="new-password" required />
        </FormField>
      </form>
    </Modal>
  )
}

// --- Credentials Panel ---

type TestState = CredentialTestResult & { host?: string; testedAt?: number }

function needsHost(cred: AdminCredential) {
  return cred.target_type === 'ssh' || cred.target_type === 'winrm'
}

function credentialTypeLabel(type: string) {
  return CREDENTIAL_TYPE_OPTIONS.find(o => o.value === type)?.label ?? type
}

function TestStatus({ result }: { result?: TestState }) {
  if (!result) return <span className="text-xs text-fg-faint">Not tested</span>
  if (result.status === 'testing') {
    return <span className="flex items-center gap-2 text-xs text-fg-muted"><StatusDot status="warn" />Testing{result.host ? ` ${result.host}` : ''}…</span>
  }
  const ok = result.status === 'ok'
  const warn = ok && result.message === 'connected with warnings'
  return (
    <span className="flex min-w-0 items-center gap-2 text-xs" title={ok ? undefined : result.error}>
      <StatusDot status={ok ? (warn ? 'warn' : 'ok') : 'error'} />
      <span className={cn('truncate', ok ? 'text-fg-secondary' : 'text-danger')}>
        {ok ? (warn ? 'Connected with warnings' : 'Connected') : result.error || 'Failed'}
      </span>
      {result.duration_ms !== undefined && <span className="shrink-0 text-fg-muted tabular-nums">{formatMs(result.duration_ms)}</span>}
    </span>
  )
}

function CredentialsPanel() {
  const [creds, setCreds] = useState<AdminCredential[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [editing, setEditing] = useState<AdminCredential | null>(null)
  const [testResults, setTestResults] = useState<Record<string, TestState>>({})
  const [hostPrompt, setHostPrompt] = useState<AdminCredential | null>(null)
  const [reportFor, setReportFor] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const confirm = useConfirm()
  const toast = useToast()

  async function load(): Promise<AdminCredential[]> {
    try {
      const list = await adminListCredentials() || []
      setCreds(list)
      setError(null)
      return list
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load credentials')
      return []
    } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  async function handleDelete(name: string) {
    const ok = await confirm({
      title: `Delete credential "${name}"?`,
      description: 'Services and resources that reference this profile will fail to connect until they are updated.',
      confirmLabel: 'Delete',
      danger: true,
    })
    if (!ok) return
    try { await adminDeleteCredential(name); toast.success(`Deleted ${name}`); load() }
    catch (err) { toast.error("Couldn't delete credential", err instanceof Error ? err.message : undefined) }
  }

  async function handleEdit(name: string) {
    try {
      const full = await adminGetCredential(name)
      setShowCreate(false)
      setEditing(full)
    } catch {
      toast.error(`Credential "${name}" no longer exists`)
      load()
    }
  }

  // Credentials tied to one server (saved host) test straight away; others prompt for a host.
  function handleTestClick(cred: AdminCredential) {
    if (needsHost(cred) && !cred.host) setHostPrompt(cred)
    else runTest(cred.name, undefined, cred.host)
  }

  async function runTest(name: string, hostOverride?: string, displayHost?: string) {
    setTestResults(prev => ({ ...prev, [name]: { status: 'testing', host: displayHost } }))
    try {
      const result = await adminTestCredential(name, hostOverride)
      setTestResults(prev => ({ ...prev, [name]: { ...result, host: displayHost, testedAt: Date.now() } }))
      if (result.status === 'ok') toast.success(`${name}: connected`, displayHost)
      else toast.error(`${name}: connection failed`, result.error)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Test failed'
      setTestResults(prev => ({ ...prev, [name]: { status: 'error', error: msg, host: displayHost, testedAt: Date.now() } }))
      toast.error(`${name}: connection failed`, msg)
    }
  }

  async function handleSaved(name: string, test: boolean) {
    toast.success(`Saved ${name}`)
    setEditing(null)
    setShowCreate(false)
    const list = await load()
    if (!test) return
    const cred = list.find(c => c.name === name)
    if (cred) handleTestClick(cred)
  }

  const columns: Column<AdminCredential>[] = [
    {
      key: 'name',
      header: 'Name',
      sortValue: c => c.name.toLowerCase(),
      render: c => (
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-control border border-line bg-surface-sunken">
            <ProviderIcon provider={c.target_type} className="size-4" />
          </span>
          <div className="min-w-0">
            <div className="truncate font-medium text-fg">{c.name}</div>
            {c.description && <div className="truncate text-xs text-fg-muted">{c.description}</div>}
          </div>
        </div>
      ),
    },
    {
      key: 'type',
      header: 'Type',
      className: 'w-44',
      sortValue: c => credentialTypeLabel(c.target_type),
      render: c => <span className="text-fg-secondary">{credentialTypeLabel(c.target_type)}</span>,
    },
    {
      key: 'host',
      header: 'Host',
      className: 'w-44',
      render: c => c.host
        ? <span className="flex items-center gap-1.5 font-mono text-xs text-fg-secondary"><Server className="size-3.5 shrink-0 text-fg-muted" />{c.host}</span>
        : <span className="text-xs text-fg-faint">{needsHost(c) ? 'Any host' : '—'}</span>,
    },
    {
      key: 'test',
      header: 'Last test',
      className: 'max-w-72',
      render: c => {
        const result = testResults[c.name]
        return (
          <div className="flex min-w-0 items-center gap-2">
            <TestStatus result={result} />
            {result && result.status !== 'testing' && !!result.steps?.length && (
              <Button variant="link" size="sm" className="shrink-0 text-xs" onClick={() => setReportFor(c.name)}>Details</Button>
            )}
          </div>
        )
      },
    },
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      className: 'w-32',
      align: 'right',
      render: c => (
        <div className="flex items-center justify-end gap-1">
          <Button size="sm" variant="secondary" leftIcon={<PlugZap />} loading={testResults[c.name]?.status === 'testing'} onClick={() => handleTestClick(c)}>Test</Button>
          <ActionMenu label={`Actions for ${c.name}`} items={[
            ...(needsHost(c) && c.host ? [{ label: 'Test another host…', icon: <Server />, onClick: () => setHostPrompt(c) }] : []),
            { label: 'Edit', icon: <Pencil />, onClick: () => handleEdit(c.name) },
            { separator: true },
            { label: 'Delete', icon: <Trash2 />, danger: true, onClick: () => handleDelete(c.name) },
          ]} />
        </div>
      ),
    },
  ]

  const report = reportFor ? testResults[reportFor] : undefined

  return (
    <div>
      <PanelToolbar
        summary={loading ? 'Loading credentials…' : plural(creds.length, 'credential profile')}
        action={<Button leftIcon={<Plus />} onClick={() => { setEditing(null); setShowCreate(true) }}>Add credential</Button>}
      />

      {showCreate && <CredentialForm onCancel={() => setShowCreate(false)} onSaved={handleSaved} />}
      {editing && <CredentialForm key={editing.name} editing={editing} onCancel={() => setEditing(null)} onSaved={handleSaved} />}
      {hostPrompt && (
        <HostPromptModal
          cred={hostPrompt}
          onClose={() => setHostPrompt(null)}
          onSubmit={host => { setHostPrompt(null); runTest(hostPrompt.name, host, host) }}
        />
      )}
      {reportFor && report && (
        <Modal title={`Connection test: ${reportFor}`} description={report.host ? `Against ${report.host}` : undefined} size="lg" onClose={() => setReportFor(null)}>
          <CredentialTestReport result={report} />
        </Modal>
      )}

      <DataTable
        columns={columns}
        data={creds}
        keyFn={c => c.name}
        loading={loading}
        error={error}
        onRetry={load}
        empty={
          <EmptyState
            icon={<KeyRound />}
            title="No credential profiles yet"
            description="Store SSH keys, cloud keys and kubeconfigs once and reference them from any service."
            action={<Button leftIcon={<Plus />} onClick={() => setShowCreate(true)}>Add credential</Button>}
          />
        }
      />
    </div>
  )
}

function HostPromptModal({ cred, onClose, onSubmit }: { cred: AdminCredential; onClose: () => void; onSubmit: (host: string) => void }) {
  const [host, setHost] = useState('')
  const formId = useId()
  return (
    <Modal
      title={`Test ${cred.name}`}
      description={cred.host ? 'Try this credential against another host. The host is not saved.' : 'This credential is not tied to a server. Enter a host to test against.'}
      size="sm"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" form={formId} leftIcon={<PlugZap />} disabled={!host.trim()}>Connect</Button>
        </>
      }
    >
      <form id={formId} onSubmit={e => { e.preventDefault(); if (host.trim()) onSubmit(host.trim()) }}>
        <FormField label="Host or IP" required>
          <Input value={host} onChange={e => setHost(e.target.value)} placeholder="10.0.2.100" autoFocus />
        </FormField>
      </form>
    </Modal>
  )
}

function formatMs(ms: number) {
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`
}

const STEP_ICONS: Record<CredentialTestStep['status'], { icon: typeof CheckCircle; className: string }> = {
  ok: { icon: CheckCircle, className: 'text-success' },
  failed: { icon: XCircle, className: 'text-danger' },
  warning: { icon: AlertTriangle, className: 'text-warning' },
  skipped: { icon: MinusCircle, className: 'text-fg-muted' },
}

// Step-by-step record of what the credential test actually connected to.
function CredentialTestReport({ result }: { result: TestState }) {
  return (
    <div className="text-xs">
      <div className="flex flex-col gap-2">
        {result.steps!.map((s, i) => {
          const { icon: Icon, className } = STEP_ICONS[s.status] || STEP_ICONS.skipped
          return (
            <div key={i} className="flex items-start gap-2">
              <Icon className={cn('mt-px size-3.5 shrink-0', className)} />
              <span className="w-32 shrink-0 text-fg-secondary">{s.name}</span>
              <span className={cn('flex-1 break-words', s.status === 'failed' ? 'text-danger' : s.status === 'warning' ? 'text-warning' : 'text-fg-muted')}>
                {s.detail}
              </span>
              {!!s.duration_ms && <span className="shrink-0 text-fg-muted tabular-nums">{formatMs(s.duration_ms)}</span>}
            </div>
          )
        })}
      </div>

      {!!result.facts?.length && (
        <div className="mt-3 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 rounded-control border border-line bg-surface-sunken p-3">
          {result.facts.map(f => (
            <div key={f.label} className="contents">
              <span className="text-fg-muted">{f.label}</span>
              <span className="break-all font-mono text-fg select-all">{f.value}</span>
            </div>
          ))}
        </div>
      )}

      {result.testedAt && (
        <div className="mt-3 text-2xs text-fg-muted">
          Tested from the Avalok server at {new Date(result.testedAt).toLocaleTimeString()}
        </div>
      )}
    </div>
  )
}

const CREDENTIAL_TYPE_OPTIONS = [
  { value: 'ssh', label: 'SSH' },
  { value: 'kubernetes', label: 'Kubernetes' },
  { value: 'winrm', label: 'WinRM' },
  { value: 's3', label: 'S3 / S3-Compatible' },
  { value: 'azure-storage', label: 'Azure Storage Account' },
  { value: 'gcs', label: 'Google Cloud Storage' },
]

const CRED_AUTH_FIELDS: Record<string, StorageField[]> = {
  s3: [
    { key: 'region', label: 'Region', placeholder: 'us-east-1', hint: 'AWS region' },
    { key: 'access_key_id', label: 'Access Key ID', placeholder: '', hint: 'Leave empty for default credential chain' },
    { key: 'secret_access_key', label: 'Secret Access Key', placeholder: '', type: 'password', hint: 'Leave empty for default credential chain' },
    { key: 'endpoint', label: 'Endpoint', placeholder: 'https://minio.example.com', hint: 'Custom endpoint for S3-compatible stores' },
  ],
  gcs: [
    { key: 'credentials_json', label: 'Credentials JSON', placeholder: '', type: 'password', hint: 'Service account JSON content' },
    { key: 'credentials_file', label: 'Credentials File', placeholder: '/path/to/sa.json', hint: 'Path to service account JSON' },
  ],
  winrm: [
    { key: 'user', label: 'Username', placeholder: 'Administrator', required: true },
    { key: 'password', label: 'Password', placeholder: '', type: 'password', required: true },
    { key: 'port', label: 'Port', placeholder: '5986', hint: '5985 for HTTP, 5986 for HTTPS' },
    { key: 'use_https', label: 'Use HTTPS', placeholder: '', type: 'toggle' },
    { key: 'insecure', label: 'Skip TLS Verification', placeholder: '', hint: 'For self-signed certificates', type: 'toggle' },
    { key: 'host', label: 'Host', placeholder: '10.0.2.100', hint: 'Optional — set only if this credential is for a single server' },
  ],
  kubernetes: [
    { key: 'kubeconfig_content', label: 'Kubeconfig Content', placeholder: 'Paste kubeconfig YAML', hint: 'Full kubeconfig file content' },
    { key: 'context', label: 'Context', placeholder: 'my-cluster-context', hint: 'Kubeconfig context to use' },
    { key: 'namespace', label: 'Namespace', placeholder: 'default', hint: 'Default namespace' },
    { key: 'api_server_url', label: 'API Server URL', placeholder: 'https://k8s.example.com:6443', hint: 'Direct API server URL (alternative to kubeconfig)' },
    { key: 'bearer_token', label: 'Bearer Token', placeholder: '', type: 'password', hint: 'Service account token' },
    { key: 'ca_cert', label: 'CA Certificate', placeholder: '/path/to/ca.crt', hint: 'CA cert for TLS verification' },
  ],
}

// Mirrors redactSensitiveKeys in internal/server/credential_handlers.go.
const SENSITIVE_CRED_KEYS = new Set([
  'password', 'passphrase', 'private_key', 'key_data', 'key_path', 'token', 'secret',
  'kubeconfig_content', 'bearer_token', 'ca_cert', 'proxy_url', 'secret_access_key',
  'account_key', 'connection_string', 'sas_token', 'credentials_json',
])
const REDACTED = '***redacted***'

const SSH_FIELD_KEYS = ['host', 'user', 'port', 'private_key', 'passphrase', 'password']

// Non-secret stored values become form strings; secrets always start empty.
function initialFields(config?: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(config || {})) {
    if (SENSITIVE_CRED_KEYS.has(k) || v === REDACTED || v === null || v === undefined) continue
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') out[k] = String(v)
  }
  return out
}

function CredentialForm({ editing, onCancel, onSaved }: {
  editing?: AdminCredential
  onCancel: () => void
  onSaved: (name: string, test: boolean) => void
}) {
  const isEdit = !!editing
  const original = editing?.config || {}
  const [name, setName] = useState(editing?.name || '')
  const [targetType, setTargetType] = useState(editing?.target_type || 'ssh')
  const [description, setDescription] = useState(editing?.description || '')
  const [configJson, setConfigJson] = useState('{}')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState<false | 'save' | 'test'>(false)
  const [azureAuthMethod, setCredAzureAuth] = useState<AzureAuthMethod>(
    editing?.target_type === 'azure-storage' ? detectAzureAuth(original) : 'account-key'
  )
  const [fields, setFields] = useState<Record<string, string>>(() => initialFields(editing?.config))
  const [removed, setRemoved] = useState<Set<string>>(new Set())
  const formRef = useRef<HTMLFormElement>(null)
  const formId = useId()

  const hasStructuredFields = targetType === 'ssh' || targetType in CRED_AUTH_FIELDS || targetType === 'azure-storage'
  const isAzureCredType = targetType === 'azure-storage'

  function setField(key: string, value: string) {
    setFields(prev => ({ ...prev, [key]: value }))
  }

  function isStored(key: string) {
    return isEdit && original[key] === REDACTED && !removed.has(key)
  }

  function toggleRemoved(key: string) {
    setRemoved(prev => {
      const n = new Set(prev)
      if (n.has(key)) n.delete(key); else n.add(key)
      return n
    })
    setField(key, '')
  }

  function activeFields(): StorageField[] {
    if (isAzureCredType) return AZURE_AUTH_FIELDS[azureAuthMethod] || []
    return CRED_AUTH_FIELDS[targetType] || []
  }

  function activeKeys(): string[] {
    return targetType === 'ssh' ? SSH_FIELD_KEYS : activeFields().map(f => f.key)
  }

  function isToggle(key: string) {
    return activeFields().some(f => f.key === key && f.type === 'toggle')
  }

  function toValue(key: string, v: string): unknown {
    return isToggle(key) ? v === 'true' : v
  }

  function buildCreateConfig(): Record<string, unknown> {
    if (!hasStructuredFields) return JSON.parse(configJson)
    const cfg: Record<string, unknown> = {}
    for (const k of activeKeys()) {
      const v = fields[k]
      if (v === undefined || v === '') continue
      cfg[k] = toValue(k, v)
    }
    return cfg
  }

  // Edit patch: omitted keeps the stored value, null removes it.
  function buildEditPatch(): Record<string, unknown> {
    if (!hasStructuredFields) return JSON.parse(configJson)
    const patch: Record<string, unknown> = {}
    const keys = activeKeys()
    for (const k of keys) {
      const v = fields[k] ?? ''
      const had = original[k] !== undefined && original[k] !== null && original[k] !== ''
      if (removed.has(k)) { patch[k] = null; continue }
      if (SENSITIVE_CRED_KEYS.has(k)) {
        if (v !== '') patch[k] = v
        continue
      }
      if (v === '') {
        if (had) patch[k] = null
        continue
      }
      if (had && String(original[k]) === v) continue
      patch[k] = toValue(k, v)
    }
    // Switching Azure auth method: drop keys that belong only to other methods.
    if (isAzureCredType) {
      for (const method of Object.keys(AZURE_AUTH_FIELDS) as AzureAuthMethod[]) {
        for (const f of AZURE_AUTH_FIELDS[method]) {
          if (!keys.includes(f.key) && original[f.key] !== undefined) patch[f.key] = null
        }
      }
      if (original.auth_method !== undefined && original.auth_method !== azureAuthMethod) patch.auth_method = azureAuthMethod
    }
    return patch
  }

  function validate(): string | null {
    const port = fields.port?.trim()
    if (port && !(/^\d+$/.test(port) && +port >= 1 && +port <= 65535)) return 'Port must be a number between 1 and 65535'
    return null
  }

  async function submit(test: boolean) {
    setError('')
    const invalid = validate()
    if (invalid) { setError(invalid); return }
    setLoading(test ? 'test' : 'save')
    try {
      if (isEdit) {
        await adminUpdateCredential(editing!.name, { config: buildEditPatch(), description })
      } else {
        await adminCreateCredential({ name, target_type: targetType, config: buildCreateConfig(), description })
      }
      onSaved(isEdit ? editing!.name : name, test)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : ''
      if (isEdit && msg.includes('not found')) setError('This credential no longer exists — it may have been deleted by another admin.')
      else setError(msg || (isEdit ? 'Failed to update credential' : 'Failed to create credential'))
    } finally { setLoading(false) }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    submit(false)
  }

  function secretPlaceholder(key: string, fallback: string) {
    if (removed.has(key)) return 'Will be removed on save'
    if (isStored(key)) return 'Stored — leave empty to keep'
    return fallback
  }

  function secretStatus(field: string) {
    if (!isEdit || original[field] !== REDACTED) return null
    return (
      <div className="mt-1 flex items-center gap-2 text-xs text-fg-muted">
        {removed.has(field) ? <span className="text-danger">Will be removed</span> : <span>Value stored</span>}
        <Button variant="link" type="button" onClick={() => toggleRemoved(field)} className="text-xs">
          {removed.has(field) ? 'Undo' : 'Remove'}
        </Button>
      </div>
    )
  }

  function fieldRequired(f: StorageField) {
    if (!f.required) return false
    return !isStored(f.key)
  }

  return (
    <Modal
      title={isEdit ? `Edit ${editing!.name}` : 'Add credential'}
      description={isEdit
        ? "Name and type can't be changed. Secret fields left empty keep their stored value. Changes apply to everything using this profile."
        : 'A reusable connection profile for services and resources.'}
      size="lg"
      onClose={onCancel}
      dismissible={false}
      footer={
        <>
          <Button variant="ghost" type="button" onClick={onCancel}>Cancel</Button>
          <Button variant="secondary" type="button" leftIcon={<PlugZap />} loading={loading === 'test'} disabled={!!loading} onClick={() => {
            if (formRef.current && !formRef.current.reportValidity()) return
            submit(true)
          }}>
            {isEdit ? 'Save & test' : 'Create & test'}
          </Button>
          <Button type="submit" form={formId} loading={loading === 'save'} disabled={!!loading}>
            {isEdit ? 'Save' : 'Create'}
          </Button>
        </>
      }
    >
      <form id={formId} ref={formRef} onSubmit={handleSubmit} className="flex flex-col gap-4">
        {error && <Alert tone="danger">{error}</Alert>}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField label="Profile Name" required={!isEdit}>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="Profile name" required disabled={isEdit} />
          </FormField>
          <FormField label="Target Type">
            <div className="relative">
              <div className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2">
                <ProviderIcon provider={targetType} className="size-4" />
              </div>
              <Select value={targetType} onChange={e => { setTargetType(e.target.value); setFields({}) }} className="pl-8" disabled={isEdit}>
                {CREDENTIAL_TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </Select>
            </div>
          </FormField>
        </div>
        <FormField label="Description" hint="optional">
          <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="Description" />
        </FormField>

        {isAzureCredType && (
          <FormField label="Authentication Method">
            <Tabs
              tabs={AZURE_AUTH_TABS}
              active={azureAuthMethod}
              onChange={(id) => setCredAzureAuth(id as AzureAuthMethod)}
            />
          </FormField>
        )}

        {targetType === 'ssh' ? (
          <>
            <FormField label="Host" hint="optional">
              <Input value={fields.host || ''} onChange={e => setField('host', e.target.value)} placeholder="Host (set here if credential is tied to one server)" />
            </FormField>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField label="User">
                <Input value={fields.user || ''} onChange={e => setField('user', e.target.value)} placeholder="e.g. root" />
              </FormField>
              <FormField label="Port" hint="default: 22">
                <Input value={fields.port || ''} onChange={e => setField('port', e.target.value)} placeholder="22" />
              </FormField>
            </div>
            <FormField label="Private Key (PEM)">
              <Textarea
                value={fields.private_key || ''}
                onChange={e => setField('private_key', e.target.value)}
                className="h-36 font-mono"
                placeholder={secretPlaceholder('private_key', "-----BEGIN OPENSSH PRIVATE KEY-----\n...\n-----END OPENSSH PRIVATE KEY-----")}
                disabled={removed.has('private_key')}
                spellCheck={false}
              />
              {secretStatus('private_key')}
            </FormField>
            <FormField label="Key Passphrase" hint="if encrypted">
              <Input type="password" value={fields.passphrase || ''} onChange={e => setField('passphrase', e.target.value)} placeholder={secretPlaceholder('passphrase', 'Key passphrase')} disabled={removed.has('passphrase')} />
              {secretStatus('passphrase')}
            </FormField>
            <div className="flex items-center gap-2">
              <div className="h-px flex-1 bg-line" />
              <span className="text-xs text-fg-muted">or use password auth</span>
              <div className="h-px flex-1 bg-line" />
            </div>
            <FormField label="Password">
              <Input type="password" value={fields.password || ''} onChange={e => setField('password', e.target.value)} placeholder={secretPlaceholder('password', 'Password')} disabled={removed.has('password')} />
              {secretStatus('password')}
            </FormField>
          </>
        ) : hasStructuredFields ? (
          <div className="flex flex-col gap-4">
            {activeFields().map(field => {
              const secret = SENSITIVE_CRED_KEYS.has(field.key)
              return (
                <FormField key={field.key} label={field.label} required={fieldRequired(field)} hint={field.hint}>
                  {field.type === 'toggle' ? (
                    <Select value={fields[field.key] || ''} onChange={e => setField(field.key, e.target.value)}>
                      <option value="">Default</option>
                      <option value="true">Yes</option>
                      <option value="false">No</option>
                    </Select>
                  ) : field.key === 'kubeconfig_content' ? (
                    <Textarea
                      value={fields[field.key] || ''}
                      onChange={e => setField(field.key, e.target.value)}
                      className="h-36 font-mono"
                      placeholder={secretPlaceholder(field.key, field.placeholder)}
                      disabled={removed.has(field.key)}
                      spellCheck={false}
                    />
                  ) : (
                    <Input
                      type={field.type === 'password' ? 'password' : 'text'}
                      value={fields[field.key] || ''}
                      onChange={e => setField(field.key, e.target.value)}
                      placeholder={secret ? secretPlaceholder(field.key, field.placeholder) : field.placeholder}
                      required={fieldRequired(field)}
                      disabled={removed.has(field.key)}
                    />
                  )}
                  {secret && !field.required && secretStatus(field.key)}
                </FormField>
              )
            })}
          </div>
        ) : (
          <FormField label="Configuration" required>
            <Textarea
              value={configJson}
              onChange={e => setConfigJson(e.target.value)}
              className="h-32 font-mono"
              placeholder='{"host": "...", "user": "...", "token": "..."}'
            />
          </FormField>
        )}
      </form>
    </Modal>
  )
}

// --- Settings Panel ---

function SettingsPanel({ onSettingsChange, highlightSetting, onHighlightConsumed }: { onSettingsChange?: (settings: Record<string, string>) => void; highlightSetting?: string; onHighlightConsumed?: () => void }) {
  const [settings, setSettings] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [blinkKey, setBlinkKey] = useState<string | undefined>(highlightSetting)

  useEffect(() => {
    adminGetSettings()
      .then(s => setSettings(s || {}))
      .catch(() => setError('Failed to load settings'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (!highlightSetting || loading) return
    setBlinkKey(highlightSetting)
    const el = document.querySelector(`[data-setting-id="${highlightSetting}"]`)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
    const timer = setTimeout(() => {
      setBlinkKey(undefined)
      onHighlightConsumed?.()
    }, 2000)
    return () => clearTimeout(timer)
  }, [highlightSetting, loading, onHighlightConsumed])

  const toggle = useCallback(async (key: string, current: string) => {
    const next = current === 'true' ? 'false' : 'true'
    setSaving(true)
    setError('')
    try {
      const updated = await adminUpdateSettings({ [key]: next })
      setSettings(updated)
    } catch {
      setError('Failed to save setting')
    } finally {
      setSaving(false)
    }
  }, [])

  const saveNumeric = useCallback(async (key: string, value: string) => {
    const n = parseInt(value, 10)
    if (isNaN(n) || n <= 0) return
    setSaving(true)
    setError('')
    try {
      const updated = await adminUpdateSettings({ [key]: String(n) })
      setSettings(updated)
      onSettingsChange?.(updated)
    } catch {
      setError('Failed to save setting')
    } finally {
      setSaving(false)
    }
  }, [onSettingsChange])

  if (loading) return <div className="flex flex-col gap-4"><div className="skeleton h-48 rounded-card" /><div className="skeleton h-64 rounded-card" /></div>

  const redactCreds = settings['redact_credentials'] ?? 'true'
  const fileBrowserPageSize = settings['file_browser_page_size'] ?? '10000'
  const enableWorkspaces = settings['enable_workspaces'] ?? 'true'
  const enableEnvironments = settings['enable_environments'] ?? 'true'
  const enableServices = settings['enable_services'] ?? 'true'
  const wsMaxConns = settings['ws_max_connections'] ?? '100'
  const wsMaxMsgKB = settings['ws_max_message_kb'] ?? '4'
  const streamTailLines = settings['stream_tail_lines'] ?? '0'
  const logBufferLines = settings['log_buffer_lines'] ?? '10000'

  return (
    <div>
      {error && <Alert tone="danger" className="mb-6">{error}</Alert>}

      <Section title="Entity Visibility" className="mb-8">
        <Card padding="none">
          <div className="px-4">
            <SettingsRow label="Enable Workspaces" description="Show the Workspaces section on the homepage." settingId="enable_workspaces" highlight={blinkKey === 'enable_workspaces'}>
              <Toggle checked={enableWorkspaces === 'true'} onChange={() => toggle('enable_workspaces', enableWorkspaces)} disabled={saving} />
            </SettingsRow>
            <SettingsRow label="Enable Environments" description="Show standalone Environments section on the homepage." settingId="enable_environments" highlight={blinkKey === 'enable_environments'}>
              <Toggle checked={enableEnvironments === 'true'} onChange={() => toggle('enable_environments', enableEnvironments)} disabled={saving} />
            </SettingsRow>
            <SettingsRow label="Enable Services" description="Show standalone Services section on the homepage." settingId="enable_services" highlight={blinkKey === 'enable_services'}>
              <Toggle checked={enableServices === 'true'} onChange={() => toggle('enable_services', enableServices)} disabled={saving} />
            </SettingsRow>
          </div>
        </Card>
      </Section>

      <Section title="Server Settings" className="mb-8">
        <Card padding="none">
          <div className="px-4">
            <SettingsRow label="Redact credentials in UI" description="Hide passwords and passphrases in YAML preview by default. Admins can still toggle visibility per-session." settingId="redact_credentials" highlight={blinkKey === 'redact_credentials'}>
              <Toggle checked={redactCreds === 'true'} onChange={() => toggle('redact_credentials', redactCreds)} disabled={saving} />
            </SettingsRow>
            <SettingsRow label="File browser page size" description="Number of lines per page when viewing log files. Large values use more memory." settingId="file_browser_page_size" highlight={blinkKey === 'file_browser_page_size'}>
              <Input
                type="number"
                min={1000}
                max={100000}
                step={1000}
                value={fileBrowserPageSize}
                onChange={e => setSettings(prev => ({ ...prev, file_browser_page_size: e.target.value }))}
                onBlur={e => saveNumeric('file_browser_page_size', e.target.value)}
                disabled={saving}
                className="w-32 text-right"
              />
            </SettingsRow>
            <SettingsRow label="Initial log tail lines" description="Number of historical log lines to load when opening a stream. 0 = all logs from the beginning." settingId="stream_tail_lines" highlight={blinkKey === 'stream_tail_lines'}>
              <Input
                type="number"
                min={0}
                max={100000}
                step={100}
                value={streamTailLines}
                onChange={e => setSettings(prev => ({ ...prev, stream_tail_lines: e.target.value }))}
                onBlur={e => saveNumeric('stream_tail_lines', e.target.value)}
                disabled={saving}
                className="w-32 text-right"
              />
            </SettingsRow>
            <SettingsRow label="Log buffer size" description="Maximum number of log lines kept in the browser per stream. Older lines are dropped when this limit is reached. Trimming occurs at 2x this value." settingId="log_buffer_lines" highlight={blinkKey === 'log_buffer_lines'}>
              <Input
                type="number"
                min={1000}
                max={10000000}
                step={1000}
                value={logBufferLines}
                onChange={e => setSettings(prev => ({ ...prev, log_buffer_lines: e.target.value }))}
                onBlur={e => saveNumeric('log_buffer_lines', e.target.value)}
                disabled={saving}
                className="w-32 text-right"
              />
            </SettingsRow>
          </div>
        </Card>
      </Section>

      <Section
        title="WebSocket Limits"
        actions={
          <Button
            variant="secondary"
            size="sm"
            onClick={async () => {
              setSaving(true)
              setError('')
              try {
                const updated = await adminUpdateSettings({ ws_max_connections: '100', ws_max_message_kb: '4' })
                setSettings(updated)
              } catch {
                setError('Failed to reset WebSocket settings')
              } finally {
                setSaving(false)
              }
            }}
            disabled={saving}
          >
            Reset to defaults
          </Button>
        }
      >
        <Card padding="none">
          <div className="px-4">
            <SettingsRow label="Max concurrent connections" description="Maximum number of simultaneous WebSocket connections for log streaming. Default: 100." settingId="ws_max_connections" highlight={blinkKey === 'ws_max_connections'}>
              <Input
                type="number"
                min={10}
                max={1000}
                step={10}
                value={wsMaxConns}
                onChange={e => setSettings(prev => ({ ...prev, ws_max_connections: e.target.value }))}
                onBlur={e => saveNumeric('ws_max_connections', e.target.value)}
                disabled={saving}
                className="w-32 text-right"
              />
            </SettingsRow>
            <SettingsRow label="Max message size (KB)" description="Maximum size of a single WebSocket message from clients. Default: 4 KB." settingId="ws_max_message_kb" highlight={blinkKey === 'ws_max_message_kb'}>
              <Input
                type="number"
                min={1}
                max={64}
                step={1}
                value={wsMaxMsgKB}
                onChange={e => setSettings(prev => ({ ...prev, ws_max_message_kb: e.target.value }))}
                onBlur={e => {
                  const n = parseInt(e.target.value, 10)
                  if (!isNaN(n) && n > 0 && n <= 64) saveNumeric('ws_max_message_kb', e.target.value)
                }}
                disabled={saving}
                className="w-32 text-right"
              />
            </SettingsRow>
          </div>
          {parseInt(wsMaxMsgKB, 10) > 16 && (
            <div className="px-4 pb-4">
              <Alert tone="warning">
                Values above 16 KB increase memory usage per connection and may make the server vulnerable to denial-of-service from large payloads. Max allowed: 64 KB.
              </Alert>
            </div>
          )}
        </Card>
      </Section>
    </div>
  )
}

// --- Helpers ---

function formatScope(s: string) {
  if (s.startsWith('env:') || s.startsWith('res:')) {
    const rest = s.slice(4)
    const slash = rest.indexOf('/')
    return slash >= 0 ? `${rest.slice(0, slash)} / ${rest.slice(slash + 1)}` : rest
  }
  if (s.startsWith('svc:')) return s.slice(4)
  return s.split('/').join(' / ')
}
