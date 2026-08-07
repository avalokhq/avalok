import { useState, useEffect, useCallback } from 'react'
import { Users, FolderOpen, KeyRound, CheckCircle, XCircle, Clock, Shield, UserCheck, Trash2, Plus, Pencil, KeySquare, Settings, Boxes, Copy, Check, ChevronDown, ChevronRight } from 'lucide-react'
import { cn } from '../../lib/cn'
import PageHeader from '../ui/PageHeader'
import Tabs from '../ui/Tabs'
import DataTable from '../ui/DataTable'
import Modal from '../ui/Modal'
import Button from '../ui/Button'
import Input, { Textarea, Select } from '../ui/Input'
import Card from '../ui/Card'
import Alert from '../ui/Alert'
import Spinner from '../ui/Spinner'
import Toggle from '../ui/Toggle'
import Section from '../ui/Section'
import EmptyState from '../ui/EmptyState'
import SettingsRow from '../ui/SettingsRow'
import FormField from '../ui/FormField'
import IconButton from '../ui/IconButton'
import Badge from '../ui/Badge'

import ProviderIcon from '../ui/ProviderIcon'

const KUBERNETES_LOGO = 'https://cdn.jsdelivr.net/gh/selfhst/icons@main/webp/kubernetes.webp'
import {
  adminListUsers, adminApproveUser, adminDisableUser, adminDeleteUser, adminCreateUser, adminUpdateUser, adminResetPassword,
  adminListWorkspaces, adminImportWorkspace, adminDeleteWorkspace,
  adminListCredentials, adminCreateCredential, adminDeleteCredential, adminTestCredential,
  adminListResources, adminGetResource, adminCreateResource, adminUpdateResource, adminDeleteResource, adminTestResource,
  adminListResourceNamespaces,
  adminGetSettings, adminUpdateSettings,
  listWorkspaces, listEnvironments, listServices,
  listStandaloneEnvs, listStandaloneEnvServices, listStandaloneServices,
} from '../../lib/api'
import type { AdminUser, AdminCredential, AdminResource, NamespaceInfo } from '../../lib/api'
import type { Workspace, Environment, Service, StandaloneEnvironment, StandaloneService } from '../../lib/types'

type Tab = 'users' | 'workspaces' | 'credentials' | 'resources' | 'settings'

interface Props {
  userRole: string
  onSettingsChange?: (settings: Record<string, string>) => void
}

export default function AdminPage({ userRole, onSettingsChange }: Props) {
  const [tab, setTab] = useState<Tab>('users')

  const tabs = [
    { id: 'users', label: 'Users', icon: Users },
    ...(userRole === 'admin' ? [
      { id: 'workspaces', label: 'Workspaces', icon: FolderOpen },
      { id: 'credentials', label: 'Credentials', icon: KeyRound },
      { id: 'resources', label: 'Resources', icon: Boxes },
      { id: 'settings', label: 'Settings', icon: Settings },
    ] : []),
  ]

  return (
    <div className="flex-1 overflow-auto p-6">
      <div className="max-w-5xl mx-auto">
        <PageHeader title="Administration" />

        <div className="mb-6">
          <Tabs tabs={tabs} active={tab} onChange={(id) => setTab(id as Tab)} />
        </div>

        {tab === 'users' && <UsersPanel userRole={userRole} />}
        {tab === 'workspaces' && <WorkspacesPanel />}
        {tab === 'credentials' && <CredentialsPanel />}
        {tab === 'resources' && <ResourcesPanel />}
        {tab === 'settings' && <SettingsPanel onSettingsChange={onSettingsChange} />}
      </div>
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
      <div className="flex items-center gap-2 mb-2">
        <label className="text-xs text-[var(--text-muted)]">Scope type:</label>
        <Select value={scopeType} onChange={e => setScopeType(e.target.value as ScopeType)} className="w-auto py-1 text-xs">
          <option value="workspace">Workspace</option>
          <option value="environment">Standalone Environment</option>
          <option value="service">Standalone Service</option>
          <option value="resource">Resource</option>
        </Select>
      </div>

      <div className="border border-[var(--border-default)] rounded-lg bg-[var(--bg-elevated)] max-h-64 overflow-auto">
        {scopeType === 'workspace' && (
          scopeData.workspaces.length === 0
            ? <div className="text-xs text-[var(--text-muted)] py-3 text-center">No workspaces available</div>
            : scopeData.workspaces.map(node => {
                const wsPath = node.workspace.name
                const wsChecked = scopeSet.has(wsPath)
                return (
                  <div key={wsPath} className="border-b border-[var(--border-subtle)] last:border-b-0">
                    <label className="flex items-center gap-2 px-3 py-2 hover:bg-[var(--bg-hover)] cursor-pointer">
                      <input type="checkbox" checked={wsChecked || isParentChecked(wsPath)} onChange={() => toggle(wsPath)}
                        className="rounded border-[var(--border-default)] accent-[var(--text-accent)]" />
                      <span className="text-sm font-medium text-[var(--text-primary)]">{node.workspace.name}</span>
                      <span className="text-xs text-[var(--text-muted)]">workspace</span>
                    </label>
                    {!wsChecked && node.environments.map(({ env, services }) => {
                      const envPath = `${wsPath}/${env.name}`
                      const envChecked = scopeSet.has(envPath)
                      return (
                        <div key={envPath}>
                          <label className="flex items-center gap-2 pl-7 pr-3 py-1.5 hover:bg-[var(--bg-hover)] cursor-pointer">
                            <input type="checkbox" checked={envChecked || isParentChecked(envPath)} onChange={() => toggle(envPath)}
                              className="rounded border-[var(--border-default)] accent-[var(--text-accent)]" />
                            <span className="text-sm text-[var(--text-primary)]">{env.name}</span>
                            <span className="text-xs text-[var(--text-muted)]">environment</span>
                          </label>
                          {!envChecked && services.map(svc => {
                            const svcPath = `${envPath}/${svc.name}`
                            return (
                              <label key={svcPath} className="flex items-center gap-2 pl-12 pr-3 py-1.5 hover:bg-[var(--bg-hover)] cursor-pointer">
                                <input type="checkbox" checked={scopeSet.has(svcPath) || isParentChecked(svcPath)} onChange={() => toggle(svcPath)}
                                  className="rounded border-[var(--border-default)] accent-[var(--text-accent)]" />
                                <span className="text-xs text-[var(--text-secondary)]">{svc.friendly_name || svc.name}</span>
                                <span className="text-xs text-[var(--text-muted)]">service</span>
                              </label>
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
            ? <div className="text-xs text-[var(--text-muted)] py-3 text-center">No standalone environments available</div>
            : scopeData.standaloneEnvs.map(node => {
                const envPath = `env:${node.env.name}`
                const envChecked = scopeSet.has(envPath)
                return (
                  <div key={envPath} className="border-b border-[var(--border-subtle)] last:border-b-0">
                    <label className="flex items-center gap-2 px-3 py-2 hover:bg-[var(--bg-hover)] cursor-pointer">
                      <input type="checkbox" checked={envChecked} onChange={() => toggle(envPath)}
                        className="rounded border-[var(--border-default)] accent-[var(--text-accent)]" />
                      <span className="text-sm font-medium text-[var(--text-primary)]">{node.env.name}</span>
                      <span className="text-xs text-[var(--text-muted)]">environment</span>
                    </label>
                    {!envChecked && node.services.map(svc => {
                      const svcPath = `env:${node.env.name}/${svc.name}`
                      return (
                        <label key={svcPath} className="flex items-center gap-2 pl-7 pr-3 py-1.5 hover:bg-[var(--bg-hover)] cursor-pointer">
                          <input type="checkbox" checked={scopeSet.has(svcPath)} onChange={() => toggle(svcPath)}
                            className="rounded border-[var(--border-default)] accent-[var(--text-accent)]" />
                          <span className="text-xs text-[var(--text-secondary)]">{svc.friendly_name || svc.name}</span>
                          <span className="text-xs text-[var(--text-muted)]">service</span>
                        </label>
                      )
                    })}
                  </div>
                )
              })
        )}

        {scopeType === 'service' && (
          scopeData.standaloneServices.length === 0
            ? <div className="text-xs text-[var(--text-muted)] py-3 text-center">No standalone services available</div>
            : scopeData.standaloneServices.map(svc => {
                const svcPath = `svc:${svc.name}`
                return (
                  <label key={svcPath} className="flex items-center gap-2 px-3 py-2 hover:bg-[var(--bg-hover)] cursor-pointer border-b border-[var(--border-subtle)] last:border-b-0">
                    <input type="checkbox" checked={scopeSet.has(svcPath)} onChange={() => toggle(svcPath)}
                      className="rounded border-[var(--border-default)] accent-[var(--text-accent)]" />
                    <span className="text-sm text-[var(--text-primary)]">{svc.name}</span>
                    <span className="text-xs text-[var(--text-muted)]">{svc.provider}</span>
                  </label>
                )
              })
        )}

        {scopeType === 'resource' && (
          scopeData.resources.length === 0
            ? <div className="text-xs text-[var(--text-muted)] py-3 text-center">No resources available</div>
            : scopeData.resources.map(node => {
                const resPath = `res:${node.resource.name}`
                const resChecked = scopeSet.has(resPath)
                return (
                  <div key={resPath} className="border-b border-[var(--border-subtle)] last:border-b-0">
                    <label className="flex items-center gap-2 px-3 py-2 hover:bg-[var(--bg-hover)] cursor-pointer">
                      <input type="checkbox" checked={resChecked} onChange={() => toggle(resPath)}
                        className="rounded border-[var(--border-default)] accent-[var(--text-accent)]" />
                      <img src={KUBERNETES_LOGO} alt="" className="w-4 h-4" />
                      <span className="text-sm font-medium text-[var(--text-primary)]">{node.resource.name}</span>
                      <span className="text-xs text-[var(--text-muted)]">{node.resource.type}</span>
                    </label>
                    {!resChecked && node.namespaces.map(ns => {
                      const nsPath = `res:${node.resource.name}/${ns.name}`
                      return (
                        <label key={nsPath} className="flex items-center gap-2 pl-7 pr-3 py-1.5 hover:bg-[var(--bg-hover)] cursor-pointer">
                          <input type="checkbox" checked={scopeSet.has(nsPath) || isParentChecked(nsPath)} onChange={() => toggle(nsPath)}
                            className="rounded border-[var(--border-default)] accent-[var(--text-accent)]" />
                          <span className="text-xs text-[var(--text-secondary)]">{ns.name}</span>
                          <span className="text-xs text-[var(--text-muted)]">namespace</span>
                        </label>
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

// --- Users Panel ---

function UsersPanel({ userRole }: { userRole: string }) {
  const [users, setUsers] = useState<AdminUser[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null)
  const [resetUser, setResetUser] = useState<AdminUser | null>(null)
  const [error, setError] = useState('')

  async function load() {
    setLoading(true)
    try {
      setUsers(await adminListUsers() || [])
    } catch { setError('Failed to load users') }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  async function handleApprove(id: string) {
    try { await adminApproveUser(id); load() } catch { setError('Failed to approve user') }
  }
  async function handleDisable(id: string) {
    try { await adminDisableUser(id); load() } catch { setError('Failed to disable user') }
  }
  async function handleDelete(id: string) {
    if (!confirm('Delete this user permanently?')) return
    try { await adminDeleteUser(id); load() } catch { setError('Failed to delete user') }
  }

  if (loading) return <Spinner label="Loading users..." />

  const userColumns = [
    {
      key: 'user',
      header: 'User',
      render: (u: AdminUser) => (
        <div>
          <div className="text-[var(--text-primary)] font-medium">{u.username}</div>
          {u.email && <div className="text-xs text-[var(--text-muted)]">{u.email}</div>}
        </div>
      ),
    },
    {
      key: 'role',
      header: 'Role',
      render: (u: AdminUser) => (
        <span className={cn('inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full', roleColor(u.role))}>
          <Shield className="w-3 h-3" />
          {u.role}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (u: AdminUser) => (
        <span className={cn('inline-flex items-center gap-1 text-xs', statusColor(u.status))}>
          {statusIcon(u.status)}
          {u.status}
        </span>
      ),
    },
    {
      key: 'scope',
      header: 'Scope',
      className: 'max-w-56',
      render: (u: AdminUser) => (
        u.scope && u.scope.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {u.scope.map(s => (
              <Badge key={s} variant="default">{formatScope(s)}</Badge>
            ))}
          </div>
        ) : (
          <span className="text-xs text-[var(--text-muted)]">full access</span>
        )
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      className: 'text-right',
      render: (u: AdminUser) => (
        <div className="flex items-center justify-end gap-1">
          {u.status === 'pending' && (
            <IconButton variant="success" onClick={() => handleApprove(u.id)} title="Approve">
              <UserCheck className="w-4 h-4" />
            </IconButton>
          )}
          {userRole === 'admin' && (
            <IconButton variant="accent" onClick={() => setEditingUser(u)} title="Edit user">
              <Pencil className="w-4 h-4" />
            </IconButton>
          )}
          {userRole === 'admin' && (
            <IconButton variant="warning" onClick={() => setResetUser(u)} title="Reset password">
              <KeySquare className="w-4 h-4" />
            </IconButton>
          )}
          {u.status === 'active' && userRole === 'admin' && (
            <IconButton variant="warning" onClick={() => handleDisable(u.id)} title="Disable">
              <XCircle className="w-4 h-4" />
            </IconButton>
          )}
          {userRole === 'admin' && (
            <IconButton variant="danger" onClick={() => handleDelete(u.id)} title="Delete">
              <Trash2 className="w-4 h-4" />
            </IconButton>
          )}
        </div>
      ),
    },
  ]

  return (
    <div>
      {error && <Alert variant="error" className="mb-4">{error}</Alert>}

      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-medium text-[var(--text-secondary)]">{users.length} users</h2>
        {userRole === 'admin' && (
          <Button variant="link" onClick={() => setShowCreate(!showCreate)} className="text-sm">
            <Plus className="w-4 h-4" /> Create user
          </Button>
        )}
      </div>

      {showCreate && <CreateUserForm onDone={() => { setShowCreate(false); load() }} />}

      {editingUser && (
        <EditUserModal
          user={editingUser}
          userRole={userRole}
          onClose={() => setEditingUser(null)}
          onSaved={() => { setEditingUser(null); load() }}
        />
      )}

      {resetUser && (
        <ResetPasswordModal
          user={resetUser}
          onClose={() => setResetUser(null)}
          onDone={() => { setResetUser(null); load() }}
        />
      )}

      <DataTable
        columns={userColumns}
        data={users}
        keyFn={(u) => u.id}
      />
    </div>
  )
}

function CreateUserForm({ onDone }: { onDone: () => void }) {
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState('reader')
  const [scope, setScope] = useState<string[]>([])
  const [scopeData, setScopeData] = useState<ScopeData>({ workspaces: [], standaloneEnvs: [], standaloneServices: [], resources: [] })
  const [showScope, setShowScope] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    loadScopeTree().then(setScopeData).catch(() => {})
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      await adminCreateUser({ username, email, password, role, scope })
      onDone()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create user')
    } finally { setLoading(false) }
  }

  return (
    <Card className="mb-4">
      {error && <Alert variant="error" className="mb-3">{error}</Alert>}
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Username" required>
            <Input value={username} onChange={e => setUsername(e.target.value)} placeholder="Username" required />
          </FormField>
          <FormField label="Email" hint="optional">
            <Input value={email} onChange={e => setEmail(e.target.value)} placeholder="Email" />
          </FormField>
          <FormField label="Password" required>
            <Input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Password" required />
          </FormField>
          <FormField label="Role">
            <Select value={role} onChange={e => setRole(e.target.value)}>
              <option value="reader">Reader</option>
              <option value="manager">Manager</option>
              <option value="admin">Admin</option>
            </Select>
          </FormField>
        </div>

        <div>
          <Button variant="link" type="button" onClick={() => setShowScope(!showScope)} className="text-xs mb-2">
            {showScope ? 'Hide' : 'Set'} access scope {scope.length > 0 && `(${scope.length} selected)`}
          </Button>
          {showScope && <ScopePicker scope={scope} onChange={setScope} scopeData={scopeData} />}
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="ghost" type="button" onClick={onDone}>Cancel</Button>
          <Button type="submit" loading={loading}>
            {loading ? 'Creating...' : 'Create'}
          </Button>
        </div>
      </form>
    </Card>
  )
}

function EditUserModal({ user, userRole, onClose, onSaved }: { user: AdminUser; userRole: string; onClose: () => void; onSaved: () => void }) {
  const [role, setRole] = useState(user.role)
  const [scope, setScope] = useState<string[]>(user.scope || [])
  const [expiresAt, setExpiresAt] = useState(user.expires_at ? new Date(user.expires_at).toISOString().slice(0, 16) : '')
  const [scopeData, setScopeData] = useState<ScopeData>({ workspaces: [], standaloneEnvs: [], standaloneServices: [], resources: [] })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

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
    <Modal title={`Edit User: ${user.username}`} onClose={onClose}>
      <form onSubmit={handleSave} className="flex flex-col gap-4">
        {error && <Alert variant="error">{error}</Alert>}

        {userRole === 'admin' && (
          <FormField label="Role">
            <Select value={role} onChange={e => setRole(e.target.value)}>
              <option value="reader">Reader</option>
              <option value="manager">Manager</option>
              <option value="admin">Admin</option>
            </Select>
          </FormField>
        )}

        <div>
          <FormField label="Expires At">
            <Input type="datetime-local" value={expiresAt} onChange={e => setExpiresAt(e.target.value)} />
          </FormField>
          {expiresAt && (
            <Button variant="link" type="button" onClick={() => setExpiresAt('')} className="text-xs mt-1">
              Clear expiration
            </Button>
          )}
        </div>

        <div>
          <label className="text-xs font-medium text-[var(--text-secondary)] mb-1 block">
            Access Scope
            {scope.length === 0 && <span className="text-[var(--text-muted)] font-normal ml-1">(full access)</span>}
          </label>
          {scope.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-2">
              {scope.map(s => (
                <span key={s} className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-[var(--bg-elevated)] text-[var(--text-secondary)] border border-[var(--border-subtle)]">
                  {formatScope(s)}
                  <button type="button" onClick={() => setScope(scope.filter(x => x !== s))} className="text-[var(--text-muted)] hover:text-red-400">
                    <XCircle className="w-3 h-3" />
                  </button>
                </span>
              ))}
              <button type="button" onClick={() => setScope([])} className="text-xs text-red-400 hover:underline ml-1">Clear all</button>
            </div>
          )}
          <ScopePicker scope={scope} onChange={setScope} scopeData={scopeData} />
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t border-[var(--border-subtle)]">
          <Button variant="ghost" type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={loading}>
            {loading ? 'Saving...' : 'Save Changes'}
          </Button>
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
    <Modal title={`Reset Password: ${user.username}`} onClose={onClose} maxWidth="max-w-sm">
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        {error && <Alert variant="error">{error}</Alert>}
        <FormField label="New Password" required>
          <Input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="New password" required />
        </FormField>
        <FormField label="Confirm Password" required>
          <Input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="Confirm password" required />
        </FormField>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={loading} className="bg-amber-500">
            {loading ? 'Resetting...' : 'Reset Password'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

// --- Workspaces Panel ---

function WorkspacesPanel() {
  const [workspaces, setWorkspaces] = useState<{ name: string; description: string; environments: number; services: number }[]>([])
  const [loading, setLoading] = useState(true)
  const [showImport, setShowImport] = useState(false)
  const [error, setError] = useState('')

  async function load() {
    setLoading(true)
    try { setWorkspaces(await adminListWorkspaces() || []) } catch { setError('Failed to load workspaces') }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  async function handleDelete(name: string) {
    if (!confirm(`Delete workspace "${name}"?`)) return
    try { await adminDeleteWorkspace(name); load() } catch { setError('Failed to delete workspace') }
  }

  if (loading) return <Spinner label="Loading workspaces..." />

  return (
    <div>
      {error && <Alert variant="error" className="mb-4">{error}</Alert>}

      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-medium text-[var(--text-secondary)]">{workspaces.length} workspaces</h2>
        <Button variant="link" onClick={() => setShowImport(!showImport)} className="text-sm">
          <Plus className="w-4 h-4" /> Import YAML
        </Button>
      </div>

      {showImport && <ImportWorkspaceForm onDone={() => { setShowImport(false); load() }} />}

      <div className="grid gap-4">
        {workspaces.map(ws => (
          <Card key={ws.name} className="flex items-center justify-between">
            <div>
              <div className="text-base text-[var(--text-primary)]">{ws.name}</div>
              <div className="text-xs text-[var(--text-muted)] mt-0.5">{ws.description || 'No description'}</div>
              <div className="text-xs text-[var(--text-secondary)] mt-1">{ws.environments} environments, {ws.services} services</div>
            </div>
            <IconButton variant="danger" onClick={() => handleDelete(ws.name)} title="Delete">
              <Trash2 className="w-4 h-4" />
            </IconButton>
          </Card>
        ))}
        {workspaces.length === 0 && (
          <EmptyState
            icon={<FolderOpen className="w-6 h-6 text-[var(--text-muted)]" />}
            title="No workspaces yet"
            description="Import a YAML file to get started."
          />
        )}
      </div>
    </div>
  )
}

function ImportWorkspaceForm({ onDone }: { onDone: () => void }) {
  const [yaml, setYaml] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      await adminImportWorkspace(yaml)
      onDone()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to import')
    } finally { setLoading(false) }
  }

  return (
    <Card className="mb-4">
      {error && <Alert variant="error" className="mb-3">{error}</Alert>}
      <form onSubmit={handleSubmit}>
        <FormField label="Workspace YAML" required>
          <Textarea
            value={yaml}
            onChange={e => setYaml(e.target.value)}
            className="h-48 font-mono"
            placeholder="Paste workspace YAML here..."
            required
          />
        </FormField>
        <div className="flex justify-end gap-2 mt-3">
          <Button variant="ghost" type="button" onClick={onDone}>Cancel</Button>
          <Button type="submit" loading={loading}>
            {loading ? 'Importing...' : 'Import'}
          </Button>
        </div>
      </form>
    </Card>
  )
}

// --- Credentials Panel ---

function CredentialsPanel() {
  const [creds, setCreds] = useState<AdminCredential[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [testResults, setTestResults] = useState<Record<string, { status: string; error?: string }>>({})
  const [testHostInputs, setTestHostInputs] = useState<Record<string, string>>({})
  const [testingName, setTestingName] = useState<string | null>(null)
  const [error, setError] = useState('')

  async function load() {
    setLoading(true)
    try { setCreds(await adminListCredentials() || []) } catch { setError('Failed to load credentials') }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  async function handleDelete(name: string) {
    if (!confirm(`Delete credential "${name}"?`)) return
    try { await adminDeleteCredential(name); load() } catch { setError('Failed to delete credential') }
  }

  function handleTestClick(cred: AdminCredential) {
    if (cred.target_type === 'ssh' || cred.target_type === 'winrm') {
      setTestingName(prev => prev === cred.name ? null : cred.name)
      setTestResults(prev => { const n = { ...prev }; delete n[cred.name]; return n })
    } else {
      runTest(cred.name)
    }
  }

  async function runTest(name: string, host?: string) {
    setTestResults(prev => ({ ...prev, [name]: { status: 'testing' } }))
    try {
      const result = await adminTestCredential(name, host)
      setTestResults(prev => ({ ...prev, [name]: result }))
    } catch {
      setTestResults(prev => ({ ...prev, [name]: { status: 'error', error: 'Test failed' } }))
    }
  }

  if (loading) return <Spinner label="Loading credentials..." />

  return (
    <div>
      {error && <Alert variant="error" className="mb-4">{error}</Alert>}

      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-medium text-[var(--text-secondary)]">{creds.length} credential profiles</h2>
        <Button variant="link" onClick={() => setShowCreate(!showCreate)} className="text-sm">
          <Plus className="w-4 h-4" /> Add credential
        </Button>
      </div>

      {showCreate && <CreateCredentialForm onDone={() => { setShowCreate(false); load() }} />}

      <div className="grid gap-4">
        {creds.map(c => (
          <Card key={c.name}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0">
                  <ProviderIcon provider={c.target_type} className="w-5 h-5" />
                </div>
                <div>
                <div className="text-base text-[var(--text-primary)]">{c.name}</div>
                <div className="text-xs text-[var(--text-muted)] mt-0.5">
                  {c.target_type}{c.description ? ` — ${c.description}` : ''}
                </div>
                {testResults[c.name] && (
                  <div className={cn('text-xs mt-1', testResults[c.name].status === 'ok' ? 'text-emerald-400' : testResults[c.name].status === 'testing' ? 'text-[var(--text-muted)]' : 'text-red-400')}>
                    {testResults[c.name].status === 'ok' ? 'Connection OK' : testResults[c.name].status === 'testing' ? 'Testing...' : testResults[c.name].error}
                  </div>
                )}
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Button variant="secondary" size="sm" onClick={() => handleTestClick(c)}>Test</Button>
                <IconButton variant="danger" onClick={() => handleDelete(c.name)} title="Delete">
                  <Trash2 className="w-4 h-4" />
                </IconButton>
              </div>
            </div>
            {testingName === c.name && (
              <div className="mt-3 flex items-center gap-2">
                <Input
                  value={testHostInputs[c.name] || ''}
                  onChange={e => setTestHostInputs(prev => ({ ...prev, [c.name]: e.target.value }))}
                  placeholder="Host or IP to test against"
                  onKeyDown={e => { if (e.key === 'Enter' && testHostInputs[c.name]) { runTest(c.name, testHostInputs[c.name]); setTestingName(null) } }}
                />
                <Button
                  size="sm"
                  onClick={() => { if (testHostInputs[c.name]) { runTest(c.name, testHostInputs[c.name]); setTestingName(null) } }}
                  disabled={!testHostInputs[c.name]}
                  className="shrink-0"
                >
                  Connect
                </Button>
              </div>
            )}
          </Card>
        ))}
        {creds.length === 0 && (
          <EmptyState
            icon={<KeyRound className="w-6 h-6 text-[var(--text-muted)]" />}
            title="No credential profiles yet"
          />
        )}
      </div>
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
}

function CreateCredentialForm({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState('')
  const [targetType, setTargetType] = useState('ssh')
  const [description, setDescription] = useState('')
  const [configJson, setConfigJson] = useState('{}')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [azureAuthMethod, setCredAzureAuth] = useState<AzureAuthMethod>('account-key')

  const [sshHost, setSshHost] = useState('')
  const [sshUser, setSshUser] = useState('')
  const [sshPort, setSshPort] = useState('')
  const [sshPrivateKey, setSshPrivateKey] = useState('')
  const [sshPassword, setSshPassword] = useState('')
  const [sshPassphrase, setSshPassphrase] = useState('')
  const [cloudFields, setCloudFields] = useState<Record<string, string>>({})

  const isCloudCredType = targetType === 's3' || targetType === 'azure-storage' || targetType === 'gcs'
  const isAzureCredType = targetType === 'azure-storage'

  function updateCloudField(key: string, value: string) {
    setCloudFields(prev => ({ ...prev, [key]: value }))
  }

  function buildConfig(): Record<string, unknown> {
    if (targetType === 'ssh') {
      const config: Record<string, unknown> = {}
      if (sshHost) config.host = sshHost
      if (sshUser) config.user = sshUser
      if (sshPort) config.port = sshPort
      if (sshPrivateKey) config.private_key = sshPrivateKey
      if (sshPassword) config.password = sshPassword
      if (sshPassphrase) config.passphrase = sshPassphrase
      return config
    }
    if (isCloudCredType) {
      const cfg: Record<string, unknown> = {}
      const fields = isAzureCredType
        ? (AZURE_AUTH_FIELDS[azureAuthMethod] || [])
        : (CRED_AUTH_FIELDS[targetType] || [])
      for (const f of fields) {
        if (cloudFields[f.key]) cfg[f.key] = cloudFields[f.key]
      }
      return cfg
    }
    return JSON.parse(configJson)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      const config = buildConfig()
      await adminCreateCredential({ name, target_type: targetType, config, description })
      onDone()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create credential')
    } finally { setLoading(false) }
  }

  return (
    <Card className="mb-4">
      {error && <Alert variant="error" className="mb-3">{error}</Alert>}
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Profile Name" required>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="Profile name" required />
          </FormField>
          <FormField label="Target Type">
            <Select value={targetType} onChange={e => { setTargetType(e.target.value); setCloudFields({}) }}>
              {CREDENTIAL_TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </Select>
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
              <Input value={sshHost} onChange={e => setSshHost(e.target.value)} placeholder="Host (set here if credential is tied to one server)" />
            </FormField>
            <div className="grid grid-cols-2 gap-3">
              <FormField label="User">
                <Input value={sshUser} onChange={e => setSshUser(e.target.value)} placeholder="e.g. root" />
              </FormField>
              <FormField label="Port" hint="default: 22">
                <Input value={sshPort} onChange={e => setSshPort(e.target.value)} placeholder="22" />
              </FormField>
            </div>
            <FormField label="Private Key (PEM)">
              <Textarea
                value={sshPrivateKey}
                onChange={e => setSshPrivateKey(e.target.value)}
                className="h-36 font-mono"
                placeholder={"-----BEGIN OPENSSH PRIVATE KEY-----\n...\n-----END OPENSSH PRIVATE KEY-----"}
                spellCheck={false}
              />
            </FormField>
            <FormField label="Key Passphrase" hint="if encrypted">
              <Input type="password" value={sshPassphrase} onChange={e => setSshPassphrase(e.target.value)} placeholder="Key passphrase" />
            </FormField>
            <div className="flex items-center gap-2">
              <div className="h-px flex-1 bg-[var(--border-default)]" />
              <span className="text-xs text-[var(--text-muted)]">or use password auth</span>
              <div className="h-px flex-1 bg-[var(--border-default)]" />
            </div>
            <FormField label="Password">
              <Input type="password" value={sshPassword} onChange={e => setSshPassword(e.target.value)} placeholder="Password" />
            </FormField>
          </>
        ) : isCloudCredType ? (
          <div className="flex flex-col gap-3">
            {(isAzureCredType ? (AZURE_AUTH_FIELDS[azureAuthMethod] || []) : (CRED_AUTH_FIELDS[targetType] || [])).map(field => (
              <FormField key={field.key} label={field.label} required={field.required} hint={field.hint}>
                <Input
                  type={field.type === 'password' ? 'password' : 'text'}
                  value={cloudFields[field.key] || ''}
                  onChange={e => updateCloudField(field.key, e.target.value)}
                  placeholder={field.placeholder}
                  required={field.required}
                />
              </FormField>
            ))}
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

        <div className="flex justify-end gap-2">
          <Button variant="ghost" type="button" onClick={onDone}>Cancel</Button>
          <Button type="submit" loading={loading}>
            {loading ? 'Creating...' : 'Create'}
          </Button>
        </div>
      </form>
    </Card>
  )
}

// --- Resources Panel ---

function ResourcesPanel() {
  const [resources, setResources] = useState<AdminResource[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [editingResource, setEditingResource] = useState<AdminResource | null>(null)
  const [testResults, setTestResults] = useState<Record<string, { status: string; error?: string; message?: string }>>({})
  const [error, setError] = useState('')

  async function load() {
    setLoading(true)
    try { setResources(await adminListResources() || []) } catch { setError('Failed to load resources') }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  async function handleDelete(name: string) {
    if (!confirm(`Delete resource "${name}"? This will not affect the cluster itself.`)) return
    try { await adminDeleteResource(name); load() } catch { setError('Failed to delete resource') }
  }

  async function handleTest(name: string) {
    setTestResults(prev => ({ ...prev, [name]: { status: 'testing' } }))
    try {
      const result = await adminTestResource(name)
      setTestResults(prev => ({ ...prev, [name]: result }))
    } catch {
      setTestResults(prev => ({ ...prev, [name]: { status: 'error', error: 'Test failed' } }))
    }
  }

  async function handleEdit(name: string) {
    try {
      const res = await adminGetResource(name)
      setEditingResource(res)
      setShowCreate(false)
    } catch { setError('Failed to load resource details') }
  }

  if (loading) return <Spinner label="Loading resources..." />

  return (
    <div>
      {error && <Alert variant="error" className="mb-4">{error}</Alert>}

      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-medium text-[var(--text-secondary)]">{resources.length} resources</h2>
        <Button variant="link" onClick={() => { setShowCreate(!showCreate); setEditingResource(null) }} className="text-sm">
          <Plus className="w-4 h-4" /> Add resource
        </Button>
      </div>

      {showCreate && <AddResourceForm onDone={() => { setShowCreate(false); load() }} />}
      {editingResource && <AddResourceForm editing={editingResource} onDone={() => { setEditingResource(null); load() }} />}

      <div className="grid gap-4">
        {resources.map(res => (
          <Card key={res.name} className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0">
                <ProviderIcon provider={res.type} className="w-5 h-5" />
              </div>
              <div>
                <div className="text-base text-[var(--text-primary)]">{res.name}</div>
                <div className="text-xs text-[var(--text-muted)] mt-0.5">
                  {res.type}{res.description ? ` — ${res.description}` : ''}
                </div>
                {testResults[res.name] && (
                  <div className={cn('text-xs mt-1',
                    testResults[res.name].status === 'ok' ? 'text-emerald-400' :
                    testResults[res.name].status === 'testing' ? 'text-[var(--text-muted)]' : 'text-red-400'
                  )}>
                    {testResults[res.name].status === 'ok'
                      ? (testResults[res.name].message || 'Connection OK')
                      : testResults[res.name].status === 'testing'
                        ? 'Testing...'
                        : testResults[res.name].error}
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Button variant="secondary" size="sm" onClick={() => handleTest(res.name)}>Test</Button>
              <IconButton variant="accent" onClick={() => handleEdit(res.name)} title="Edit">
                <Pencil className="w-4 h-4" />
              </IconButton>
              <IconButton variant="danger" onClick={() => handleDelete(res.name)} title="Delete">
                <Trash2 className="w-4 h-4" />
              </IconButton>
            </div>
          </Card>
        ))}
        {resources.length === 0 && (
          <EmptyState
            icon={<Boxes className="w-6 h-6 text-[var(--text-muted)]" />}
            title="No resources yet"
            description="Add a Kubernetes cluster or cloud storage to get started."
          />
        )}
      </div>
    </div>
  )
}

const SA_SETUP_COMMANDS = [
  {
    title: '1. Create namespace',
    command: 'kubectl create namespace avalok-system',
  },
  {
    title: '2. Create ServiceAccount',
    command: 'kubectl create serviceaccount avalok-reader -n avalok-system',
  },
  {
    title: '3. Create ClusterRole (read-only log access)',
    command: `cat <<EOF | kubectl apply -f -
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: avalok-reader
rules:
- apiGroups: [""]
  resources: ["pods", "pods/log", "namespaces"]
  verbs: ["get", "list", "watch"]
- apiGroups: ["apps"]
  resources: ["deployments", "statefulsets", "daemonsets"]
  verbs: ["get", "list"]
EOF`,
  },
  {
    title: '4. Bind ClusterRole to ServiceAccount',
    command: `kubectl create clusterrolebinding avalok-reader \\
  --clusterrole=avalok-reader \\
  --serviceaccount=avalok-system:avalok-reader`,
  },
  {
    title: '5. Create long-lived token',
    command: `cat <<EOF | kubectl apply -f -
apiVersion: v1
kind: Secret
metadata:
  name: avalok-reader-token
  namespace: avalok-system
  annotations:
    kubernetes.io/service-account.name: avalok-reader
type: kubernetes.io/service-account-token
EOF`,
  },
  {
    title: '6. Get the bearer token',
    command: `kubectl get secret avalok-reader-token -n avalok-system \\
  -o jsonpath='{.data.token}' | base64 -d`,
  },
  {
    title: '7. Get the API server URL',
    command: `kubectl cluster-info | grep 'control plane'`,
  },
  {
    title: '8. Get CA certificate (optional, for private clusters)',
    command: `kubectl get secret avalok-reader-token -n avalok-system \\
  -o jsonpath='{.data.ca\\.crt}'`,
  },
]

const KUBECONFIG_SETUP_COMMANDS = [
  {
    title: '1. Create a dedicated ServiceAccount (recommended)',
    command: `kubectl create namespace avalok-system
kubectl create serviceaccount avalok-reader -n avalok-system`,
  },
  {
    title: '2. Create ClusterRole (read-only log access)',
    command: `cat <<EOF | kubectl apply -f -
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: avalok-reader
rules:
- apiGroups: [""]
  resources: ["pods", "pods/log", "namespaces"]
  verbs: ["get", "list", "watch"]
- apiGroups: ["apps"]
  resources: ["deployments", "statefulsets", "daemonsets"]
  verbs: ["get", "list"]
EOF`,
  },
  {
    title: '3. Bind ClusterRole to ServiceAccount',
    command: `kubectl create clusterrolebinding avalok-reader \\
  --clusterrole=avalok-reader \\
  --serviceaccount=avalok-system:avalok-reader`,
  },
  {
    title: '4. Generate a kubeconfig for the ServiceAccount',
    command: `SECRET=$(kubectl get sa avalok-reader -n avalok-system \\
  -o jsonpath='{.secrets[0].name}' 2>/dev/null)

# For Kubernetes >= 1.24 (token not auto-mounted):
cat <<EOF | kubectl apply -f -
apiVersion: v1
kind: Secret
metadata:
  name: avalok-reader-token
  namespace: avalok-system
  annotations:
    kubernetes.io/service-account.name: avalok-reader
type: kubernetes.io/service-account-token
EOF
SECRET=avalok-reader-token

TOKEN=$(kubectl get secret $SECRET -n avalok-system \\
  -o jsonpath='{.data.token}' | base64 -d)
CA=$(kubectl get secret $SECRET -n avalok-system \\
  -o jsonpath='{.data.ca\\.crt}')
SERVER=$(kubectl config view --minify \\
  -o jsonpath='{.clusters[0].cluster.server}')

cat <<EOF
apiVersion: v1
kind: Config
clusters:
- cluster:
    certificate-authority-data: $CA
    server: $SERVER
  name: avalok-cluster
contexts:
- context:
    cluster: avalok-cluster
    user: avalok-reader
  name: avalok-context
current-context: avalok-context
users:
- name: avalok-reader
  user:
    token: $TOKEN
EOF`,
  },
  {
    title: '5. Or use an existing kubeconfig',
    command: `cat ~/.kube/config`,
  },
]

type AuthMethod = 'service-account' | 'kubeconfig'

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)

  function handleCopy() {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <button
      onClick={handleCopy}
      className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors"
      title="Copy"
    >
      {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  )
}

type ResourceType = 'kubernetes' | 's3' | 'azure-blob' | 'azure-file' | 'gcs'

const RESOURCE_TYPE_OPTIONS: { value: ResourceType; label: string }[] = [
  { value: 'kubernetes', label: 'Kubernetes' },
  { value: 's3', label: 'S3 / S3-Compatible' },
  { value: 'azure-blob', label: 'Azure Blob Storage' },
  { value: 'azure-file', label: 'Azure File Share' },
  { value: 'gcs', label: 'Google Cloud Storage' },
]

interface StorageField { key: string; label: string; placeholder: string; required?: boolean; type?: 'text' | 'password' | 'toggle'; hint?: string }

const STORAGE_FIELDS: Record<string, StorageField[]> = {
  s3: [
    { key: 'bucket', label: 'Bucket', placeholder: 'my-log-bucket', required: true },
    { key: 'prefix', label: 'Prefix', placeholder: 'logs/app/', hint: 'Object key prefix' },
    { key: 'region', label: 'Region', placeholder: 'us-east-1', hint: 'AWS region' },
    { key: 'endpoint', label: 'Endpoint', placeholder: 'https://minio.example.com', hint: 'Custom endpoint for S3-compatible stores' },
    { key: 'access_key_id', label: 'Access Key ID', placeholder: '', hint: 'Leave empty for default credential chain' },
    { key: 'secret_access_key', label: 'Secret Access Key', placeholder: '', type: 'password', hint: 'Leave empty for default credential chain' },
    { key: 'poll_interval', label: 'Poll Interval (s)', placeholder: '30', hint: 'Seconds between checks for new log content (min 5)' },
    { key: 'pattern', label: 'File Pattern', placeholder: '*.log', hint: 'Glob pattern to filter objects' },
    { key: 'force_path_style', label: 'Force Path Style', placeholder: '', type: 'toggle', hint: 'Required for some S3-compatible stores' },
  ],
  'azure-blob': [
    { key: 'container', label: 'Container', placeholder: 'logs', required: true },
    { key: 'prefix', label: 'Prefix', placeholder: 'app/2024/', hint: 'Blob name prefix' },
    { key: 'poll_interval', label: 'Poll Interval (s)', placeholder: '30', hint: 'Seconds between checks for new log content (min 5)' },
    { key: 'pattern', label: 'File Pattern', placeholder: '*.log', hint: 'Glob pattern to filter blobs' },
  ],
  'azure-file': [
    { key: 'share_name', label: 'Share Name', placeholder: 'logshare', required: true },
    { key: 'directory', label: 'Directory', placeholder: 'app/logs', hint: 'Directory path within the share' },
    { key: 'poll_interval', label: 'Poll Interval (s)', placeholder: '30', hint: 'Seconds between checks for new log content (min 5)' },
    { key: 'pattern', label: 'File Pattern', placeholder: '*.log', hint: 'Glob pattern to filter files' },
  ],
  gcs: [
    { key: 'bucket', label: 'Bucket', placeholder: 'my-log-bucket', required: true },
    { key: 'prefix', label: 'Prefix', placeholder: 'logs/app/', hint: 'Object key prefix' },
    { key: 'project', label: 'Project ID', placeholder: 'my-gcp-project' },
    { key: 'credentials_json', label: 'Credentials JSON', placeholder: '', type: 'password', hint: 'Service account JSON content' },
    { key: 'credentials_file', label: 'Credentials File', placeholder: '/path/to/sa.json', hint: 'Path to service account JSON' },
    { key: 'poll_interval', label: 'Poll Interval (s)', placeholder: '30', hint: 'Seconds between checks for new log content (min 5)' },
    { key: 'pattern', label: 'File Pattern', placeholder: '*.log', hint: 'Glob pattern to filter objects' },
  ],
}

type AzureAuthMethod = 'account-key' | 'connection-string' | 'sas-token' | 'managed-identity'

const AZURE_AUTH_TABS = [
  { id: 'account-key', label: 'Account Key' },
  { id: 'connection-string', label: 'Connection String' },
  { id: 'sas-token', label: 'SAS Token' },
  { id: 'managed-identity', label: 'Managed Identity' },
]

const AZURE_AUTH_FIELDS: Record<AzureAuthMethod, StorageField[]> = {
  'account-key': [
    { key: 'account_name', label: 'Account Name', placeholder: 'mystorageaccount', required: true },
    { key: 'account_key', label: 'Account Key', placeholder: '', type: 'password', required: true },
  ],
  'connection-string': [
    { key: 'connection_string', label: 'Connection String', placeholder: '', type: 'password', required: true },
  ],
  'sas-token': [
    { key: 'account_name', label: 'Account Name', placeholder: 'mystorageaccount', required: true },
    { key: 'sas_token', label: 'SAS Token', placeholder: '', type: 'password', required: true },
  ],
  'managed-identity': [
    { key: 'account_name', label: 'Account Name', placeholder: 'mystorageaccount', required: true, hint: 'Uses DefaultAzureCredential (Managed Identity, Azure CLI, etc.)' },
  ],
}

const CRED_AUTH_KEY_SET = new Set([
  'account_name', 'account_key', 'connection_string', 'sas_token',
  'access_key_id', 'secret_access_key', 'endpoint',
  'credentials_json', 'credentials_file',
])

function detectAzureAuth(config?: Record<string, unknown>): AzureAuthMethod {
  if (!config) return 'account-key'
  if (config.connection_string) return 'connection-string'
  if (config.sas_token) return 'sas-token'
  if (config.account_key) return 'account-key'
  if (config.account_name) return 'managed-identity'
  return 'account-key'
}

function isAzureType(type: string) {
  return type === 'azure-blob' || type === 'azure-file'
}

function AddResourceForm({ editing, onDone }: { editing?: AdminResource; onDone: () => void }) {
  const isEdit = !!editing

  function detectAuthMethod(config?: Record<string, unknown>): AuthMethod {
    if (!config) return 'service-account'
    if (config.kubeconfig_content) return 'kubeconfig'
    return 'service-account'
  }

  const [name, setName] = useState(editing?.name || '')
  const [resourceType, setResourceType] = useState<ResourceType>((editing?.type as ResourceType) || 'kubernetes')
  const [authMethod, setAuthMethod] = useState<AuthMethod>(detectAuthMethod(editing?.config))
  const [azureAuthMethod, setAzureAuthMethod] = useState<AzureAuthMethod>(detectAzureAuth(editing?.config))
  const [apiServerUrl, setApiServerUrl] = useState(
    (editing?.config?.api_server_url as string) || ''
  )
  const [bearerToken, setBearerToken] = useState('')
  const [caCert, setCaCert] = useState('')
  const [insecureSkipTls, setInsecureSkipTls] = useState(
    !!(editing?.config?.insecure_skip_tls)
  )
  const [kubeconfigContent, setKubeconfigContent] = useState('')
  const [kubeconfigContext, setKubeconfigContext] = useState(
    (editing?.config?.context as string) || ''
  )
  const [description, setDescription] = useState(editing?.description || '')
  const [showInstructions, setShowInstructions] = useState(!isEdit && resourceType === 'kubernetes')
  const [credentials, setCredentials] = useState<AdminCredential[]>([])
  const [credentialProfile, setCredentialProfile] = useState<string>(
    (editing?.config?.credential_profile as string) || ''
  )

  useEffect(() => {
    adminListCredentials().then(setCredentials).catch(() => {})
  }, [])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [testResult, setTestResult] = useState<{ status: string; error?: string; message?: string } | null>(null)

  const [storageConfig, setStorageConfig] = useState<Record<string, string>>(() => {
    if (!editing?.config || editing.type === 'kubernetes') return {}
    const cfg: Record<string, string> = {}
    for (const [k, v] of Object.entries(editing.config)) {
      if (typeof v === 'string' && v !== '***redacted***') cfg[k] = v
      else if (typeof v === 'boolean') cfg[k] = v ? 'true' : ''
    }
    return cfg
  })

  const isCloudType = resourceType !== 'kubernetes'
  const usingCredential = !!credentialProfile
  const credTargetType = (resourceType === 'azure-blob' || resourceType === 'azure-file') ? 'azure-storage' : resourceType
  const matchingCreds = credentials.filter(c => c.target_type === credTargetType)

  function allCloudFields(): StorageField[] {
    const common = STORAGE_FIELDS[resourceType] || []
    if (usingCredential) return common
    if (isAzureType(resourceType)) {
      return [...(AZURE_AUTH_FIELDS[azureAuthMethod] || []), ...common]
    }
    return common
  }

  function buildConfig(): Record<string, unknown> {
    if (isCloudType) {
      const cfg: Record<string, unknown> = {}
      if (credentialProfile) cfg.credential_profile = credentialProfile
      for (const field of allCloudFields()) {
        const val = storageConfig[field.key]
        if (val) {
          if (field.type === 'toggle') cfg[field.key] = true
          else cfg[field.key] = val
        }
      }
      return cfg
    }
    if (authMethod === 'kubeconfig') {
      const cfg: Record<string, unknown> = {}
      if (credentialProfile) cfg.credential_profile = credentialProfile
      if (kubeconfigContent) cfg.kubeconfig_content = kubeconfigContent
      if (kubeconfigContext) cfg.context = kubeconfigContext
      return cfg
    }
    const cfg: Record<string, unknown> = {}
    if (credentialProfile) cfg.credential_profile = credentialProfile
    if (apiServerUrl) cfg.api_server_url = apiServerUrl
    if (bearerToken) cfg.bearer_token = bearerToken
    if (caCert) cfg.ca_cert = caCert
    if (insecureSkipTls) cfg.insecure_skip_tls = true
    return cfg
  }

  function validateForm(): string | null {
    if (!name) return 'Name is required'
    if (usingCredential) return null
    if (isCloudType && !isEdit) {
      for (const field of allCloudFields()) {
        if (field.required && !storageConfig[field.key]) return `${field.label} is required`
      }
    }
    if (!isCloudType && !isEdit) {
      if (authMethod === 'kubeconfig') {
        if (!kubeconfigContent) return 'Kubeconfig content is required'
      } else {
        if (!apiServerUrl) return 'API Server URL is required'
        if (!bearerToken) return 'Bearer Token is required'
      }
    }
    return null
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const validationError = validateForm()
    if (validationError) { setError(validationError); return }
    setLoading(true)
    setError('')
    setTestResult(null)
    try {
      const config = buildConfig()
      if (isEdit) {
        await adminUpdateResource(name, { config: Object.keys(config).length > 0 ? config : undefined, description })
      } else {
        await adminCreateResource({ name, type: resourceType, config, description })
      }
      onDone()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : `Failed to ${isEdit ? 'update' : 'create'} resource`)
    } finally { setLoading(false) }
  }

  async function handleTestAndSave(e: React.FormEvent) {
    e.preventDefault()
    const validationError = validateForm()
    if (validationError) { setError(validationError); return }
    setLoading(true)
    setError('')
    setTestResult(null)
    try {
      const config = buildConfig()
      if (isEdit) {
        await adminUpdateResource(name, { config: Object.keys(config).length > 0 ? config : undefined, description })
      } else {
        await adminCreateResource({ name, type: resourceType, config, description })
      }
      const result = await adminTestResource(name)
      setTestResult(result)
      if (result.status === 'ok') {
        setTimeout(() => onDone(), 1500)
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : `Failed to ${isEdit ? 'update' : 'create'} resource`)
    } finally { setLoading(false) }
  }

  function updateStorageField(key: string, value: string) {
    setStorageConfig(prev => ({ ...prev, [key]: value }))
  }

  const activeCommands = authMethod === 'kubeconfig' ? KUBECONFIG_SETUP_COMMANDS : SA_SETUP_COMMANDS

  return (
    <Card padding="none" className="mb-4">
      {/* Type & Auth Selector */}
      <div className="px-4 pt-4 pb-2 space-y-3">
        {!isEdit && (
          <FormField label="Resource Type">
            <Select value={resourceType} onChange={e => { setResourceType(e.target.value as ResourceType); setTestResult(null) }}>
              {RESOURCE_TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </Select>
          </FormField>
        )}
        {matchingCreds.length > 0 && (
          <FormField label="Credentials" hint={credentialProfile ? 'Auth fields from credential profile' : 'or enter inline below'}>
            <Select value={credentialProfile} onChange={e => setCredentialProfile(e.target.value)}>
              <option value="">Inline credentials</option>
              {matchingCreds.map(c => <option key={c.name} value={c.name}>{c.name}{c.description ? ` — ${c.description}` : ''}</option>)}
            </Select>
          </FormField>
        )}
        {!usingCredential && !isCloudType && (
          <FormField label="Authentication Method">
            <Tabs
              tabs={[
                { id: 'service-account', label: 'Service Account Token' },
                { id: 'kubeconfig', label: 'Kubeconfig' },
              ]}
              active={authMethod}
              onChange={(id) => setAuthMethod(id as AuthMethod)}
            />
          </FormField>
        )}
        {!usingCredential && isAzureType(resourceType) && (
          <FormField label="Authentication Method">
            <Tabs
              tabs={AZURE_AUTH_TABS}
              active={azureAuthMethod}
              onChange={(id) => setAzureAuthMethod(id as AzureAuthMethod)}
            />
          </FormField>
        )}
      </div>

      {/* K8s Instructions Section */}
      {!isCloudType && (
        <div className="border-b border-[var(--border-subtle)]">
          <button
            onClick={() => setShowInstructions(!showInstructions)}
            className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-[var(--bg-hover)] transition-colors"
          >
            <div className="flex items-center gap-2">
              <img src={KUBERNETES_LOGO} alt="Kubernetes" className="w-4 h-4" />
              <span className="text-base text-[var(--text-primary)]">Setup Instructions</span>
              <span className="text-xs text-[var(--text-muted)]">
                {authMethod === 'kubeconfig' ? 'Generate or use an existing kubeconfig' : 'Create a read-only ServiceAccount'}
              </span>
            </div>
            {showInstructions ? <ChevronDown className="w-4 h-4 text-[var(--text-muted)]" /> : <ChevronRight className="w-4 h-4 text-[var(--text-muted)]" />}
          </button>

          {showInstructions && (
            <div className="px-4 pb-4 space-y-3">
              <p className="text-xs text-[var(--text-secondary)]">
                {authMethod === 'kubeconfig'
                  ? 'Generate a kubeconfig with a dedicated ServiceAccount for best security, or use an existing kubeconfig. Avalok needs read-only access to pods, logs, namespaces, and workloads.'
                  : 'These commands create a read-only ServiceAccount on your cluster. Avalok uses this to list namespaces, discover workloads, and stream pod logs. No write access is granted.'}
              </p>
              {activeCommands.map((cmd, i) => (
                <div key={i}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-[var(--text-secondary)]">{cmd.title}</span>
                    <CopyButton text={cmd.command} />
                  </div>
                  <pre className="text-xs font-mono bg-[var(--bg-app)] border border-[var(--border-subtle)] rounded-md px-3 py-2 text-[var(--text-primary)] overflow-x-auto whitespace-pre">
                    {cmd.command}
                  </pre>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Form Section */}
      <div className="p-4">
        {error && <Alert variant="error" className="mb-3">{error}</Alert>}
        {testResult && (
          <Alert variant={testResult.status === 'ok' ? 'success' : 'error'} className="mb-3">
            {testResult.status === 'ok' ? (testResult.message || 'Connection successful') : testResult.error}
          </Alert>
        )}

        <form onSubmit={handleTestAndSave} className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Name" required>
              <Input value={name} onChange={e => setName(e.target.value)} className={cn(isEdit && 'opacity-60 cursor-not-allowed')} placeholder={isCloudType ? 'prod-logs' : 'production-cluster'} required disabled={isEdit} />
            </FormField>
            <FormField label="Description">
              <Input value={description} onChange={e => setDescription(e.target.value)} placeholder={isCloudType ? 'Production log storage' : 'Production GKE cluster'} />
            </FormField>
          </div>

          {isCloudType ? (
            <div className="flex flex-col gap-3">
              {!usingCredential && isAzureType(resourceType) && (AZURE_AUTH_FIELDS[azureAuthMethod] || []).map(field => (
                <FormField key={field.key} label={field.label} required={field.required} hint={field.hint}>
                  <Input
                    type={field.type === 'password' ? 'password' : 'text'}
                    value={storageConfig[field.key] || ''}
                    onChange={e => updateStorageField(field.key, e.target.value)}
                    placeholder={isEdit && field.type === 'password' ? 'Leave empty to keep existing...' : field.placeholder}
                    required={field.required && !isEdit}
                  />
                </FormField>
              ))}
              {(STORAGE_FIELDS[resourceType] || []).filter(f => !usingCredential || !CRED_AUTH_KEY_SET.has(f.key)).map(field => (
                field.type === 'toggle' ? (
                  <div key={field.key} className="flex items-center justify-between py-1">
                    <div>
                      <span className="text-xs font-medium text-[var(--text-secondary)]">{field.label}</span>
                      {field.hint && <p className="text-[10px] text-[var(--text-muted)] mt-0.5">{field.hint}</p>}
                    </div>
                    <Toggle checked={!!storageConfig[field.key]} onChange={v => updateStorageField(field.key, v ? 'true' : '')} />
                  </div>
                ) : (
                  <FormField key={field.key} label={field.label} required={field.required} hint={field.hint}>
                    <Input
                      type={field.type === 'password' ? 'password' : 'text'}
                      value={storageConfig[field.key] || ''}
                      onChange={e => updateStorageField(field.key, e.target.value)}
                      placeholder={isEdit && field.type === 'password' ? 'Leave empty to keep existing...' : field.placeholder}
                      required={field.required && !isEdit}
                    />
                  </FormField>
                )
              ))}
            </div>
          ) : usingCredential ? (
            <div className="text-xs text-[var(--text-secondary)] py-2">
              Authentication from credential profile <span className="font-medium text-[var(--text-primary)]">{credentialProfile}</span>
            </div>
          ) : authMethod === 'kubeconfig' ? (
            <>
              <FormField label="Kubeconfig" required>
                <Textarea
                  value={kubeconfigContent}
                  onChange={e => setKubeconfigContent(e.target.value)}
                  className="h-40 font-mono"
                  placeholder={isEdit ? 'Leave empty to keep existing kubeconfig...' : 'Paste the full kubeconfig YAML here...'}
                  required={!isEdit}
                />
              </FormField>
              <FormField label="Context" hint="optional, defaults to current-context">
                <Input value={kubeconfigContext} onChange={e => setKubeconfigContext(e.target.value)} placeholder="avalok-context" />
              </FormField>
            </>
          ) : (
            <>
              <FormField label="API Server URL" required>
                <Input value={apiServerUrl} onChange={e => setApiServerUrl(e.target.value)} placeholder="https://your-cluster-api:6443" required={!isEdit} />
              </FormField>

              <FormField label="Bearer Token" required>
                <Textarea
                  value={bearerToken}
                  onChange={e => setBearerToken(e.target.value)}
                  className="h-20 font-mono"
                  placeholder={isEdit ? 'Leave empty to keep existing token...' : 'Paste the token from step 6...'}
                  required={!isEdit}
                />
              </FormField>

              <FormField label="CA Certificate" hint="optional, for private clusters">
                <Textarea
                  value={caCert}
                  onChange={e => setCaCert(e.target.value)}
                  className="h-20 font-mono"
                  placeholder={isEdit ? 'Leave empty to keep existing cert...' : 'Paste base64-encoded CA cert from step 8...'}
                />
              </FormField>

              <div className="flex items-center justify-between py-1">
                <div>
                  <span className="text-xs font-medium text-[var(--text-secondary)]">Skip TLS Verification</span>
                  <p className="text-[10px] text-[var(--text-muted)] mt-0.5">Enable for clusters with self-signed certificates</p>
                </div>
                <Toggle checked={insecureSkipTls} onChange={setInsecureSkipTls} />
              </div>
            </>
          )}

          <div className="flex justify-end gap-2 pt-2 border-t border-[var(--border-subtle)]">
            <Button variant="ghost" type="button" onClick={onDone}>Cancel</Button>
            <Button variant="secondary" type="button" onClick={handleSubmit} loading={loading}>
              {loading ? 'Saving...' : isEdit ? 'Update' : 'Save'}
            </Button>
            <Button type="submit" loading={loading}>
              {loading ? 'Testing...' : isEdit ? 'Test & Update' : 'Test & Save'}
            </Button>
          </div>
        </form>
      </div>
    </Card>
  )
}

// --- Settings Panel ---

function SettingsPanel({ onSettingsChange }: { onSettingsChange?: (settings: Record<string, string>) => void }) {
  const [settings, setSettings] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    adminGetSettings()
      .then(s => setSettings(s || {}))
      .catch(() => setError('Failed to load settings'))
      .finally(() => setLoading(false))
  }, [])

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

  if (loading) return <Spinner label="Loading settings..." />

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
      {error && <Alert variant="error" className="mb-4">{error}</Alert>}

      <Section title="Entity Visibility" className="mb-8">
        <Card padding="none">
          <div className="px-4">
            <SettingsRow label="Enable Workspaces" description="Show the Workspaces section on the homepage.">
              <Toggle checked={enableWorkspaces === 'true'} onChange={() => toggle('enable_workspaces', enableWorkspaces)} disabled={saving} />
            </SettingsRow>
            <SettingsRow label="Enable Environments" description="Show standalone Environments section on the homepage.">
              <Toggle checked={enableEnvironments === 'true'} onChange={() => toggle('enable_environments', enableEnvironments)} disabled={saving} />
            </SettingsRow>
            <SettingsRow label="Enable Services" description="Show standalone Services section on the homepage.">
              <Toggle checked={enableServices === 'true'} onChange={() => toggle('enable_services', enableServices)} disabled={saving} />
            </SettingsRow>
          </div>
        </Card>
      </Section>

      <Section title="Server Settings" className="mb-8">
        <Card padding="none">
          <div className="px-4">
            <SettingsRow label="Redact credentials in UI" description="Hide passwords and passphrases in YAML preview by default. Admins can still toggle visibility per-session.">
              <Toggle checked={redactCreds === 'true'} onChange={() => toggle('redact_credentials', redactCreds)} disabled={saving} />
            </SettingsRow>
            <SettingsRow label="File browser page size" description="Number of lines per page when viewing log files. Large values use more memory.">
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
            <SettingsRow label="Initial log tail lines" description="Number of historical log lines to load when opening a stream. 0 = all logs from the beginning.">
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
            <SettingsRow label="Log buffer size" description="Maximum number of log lines kept in the browser per stream. Older lines are dropped when this limit is reached. Trimming occurs at 2x this value.">
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
            <SettingsRow label="Max concurrent connections" description="Maximum number of simultaneous WebSocket connections for log streaming. Default: 100.">
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
            <SettingsRow label="Max message size (KB)" description="Maximum size of a single WebSocket message from clients. Default: 4 KB.">
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
              <Alert variant="warning">
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
  if (s.startsWith('env:')) {
    const rest = s.slice(4)
    const slash = rest.indexOf('/')
    if (slash >= 0) return `${rest.slice(0, slash)} / ${rest.slice(slash + 1)}`
    return rest
  }
  if (s.startsWith('svc:')) {
    return s.slice(4)
  }
  if (s.startsWith('res:')) {
    const rest = s.slice(4)
    const slash = rest.indexOf('/')
    if (slash >= 0) return `${rest.slice(0, slash)} / ${rest.slice(slash + 1)}`
    return rest
  }
  const parts = s.split('/')
  return parts.join(' / ')
}

function roleColor(role: string) {
  switch (role) {
    case 'admin': return 'bg-purple-500/10 text-purple-400 border border-purple-500/20'
    case 'manager': return 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
    default: return 'bg-[var(--bg-elevated)] text-[var(--text-secondary)] border border-[var(--border-subtle)]'
  }
}

function statusColor(status: string) {
  switch (status) {
    case 'active': return 'text-emerald-400'
    case 'pending': return 'text-amber-400'
    case 'disabled': return 'text-red-400'
    default: return 'text-[var(--text-muted)]'
  }
}

function statusIcon(status: string) {
  switch (status) {
    case 'active': return <CheckCircle className="w-3.5 h-3.5" />
    case 'pending': return <Clock className="w-3.5 h-3.5" />
    case 'disabled': return <XCircle className="w-3.5 h-3.5" />
    default: return null
  }
}
