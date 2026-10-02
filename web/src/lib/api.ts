import type { LogEntry, Workspace, Environment, Service, Instance, LogFile, FilePage, FileSearchResult, StandaloneEnvironment, StandaloneService, AppConfig, GroupedStats } from './types'

function getToken(): string {
  const params = new URLSearchParams(window.location.search)
  return params.get('token') || localStorage.getItem('avalok_token') || ''
}

export function setToken(token: string) {
  localStorage.setItem('avalok_token', token)
}

export function clearToken() {
  localStorage.removeItem('avalok_token')
}

/** Authorization header for requests that can't go through fetchAPI (streamed bodies, downloads). */
export function authHeaders(): Record<string, string> {
  const token = getToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

const WS_PROTOCOL = 'avalok'

/**
 * Opens a log stream socket. Browsers can't set headers on a WebSocket, so the token rides in
 * the subprotocol list (base64url-encoded) instead of the URL, keeping it out of proxy and access logs.
 */
export function openLogSocket(url: string): WebSocket {
  const token = getToken()
  if (!token) return new WebSocket(url)
  const encoded = btoa(String.fromCharCode(...new TextEncoder().encode(token)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  return new WebSocket(url, [WS_PROTOCOL, `${WS_PROTOCOL}.token.${encoded}`])
}

/** WebSocket close code the server uses when it revokes a stream (sign-out, disabled account, lost access). */
export const WS_ACCESS_REVOKED = 1008

/** Log line shown when the server closes a stream with WS_ACCESS_REVOKED. */
export function revokedEntry(): LogEntry {
  return { type: 'error', timestamp: '', source: '', instance: '', line: 'ERROR: Stream closed because your access to this source was revoked', error: 'access revoked' }
}

async function fetchAPI<T>(path: string, options?: RequestInit): Promise<T> {
  const token = getToken()
  const headers: Record<string, string> = {}

  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  if (options?.body && typeof options.body === 'string') {
    headers['Content-Type'] = 'application/json'
  }

  const res = await fetch(`/api${path}`, {
    ...options,
    headers: { ...headers, ...options?.headers as Record<string, string> },
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(body.error || res.statusText)
  }
  return res.json()
}

// --- Auth ---

export interface HealthResponse {
  status: string
  mode: 'serve' | 'server'
}

export interface AuthUser {
  id: string
  username: string
  email: string
  role: string
  status?: string
  scope: string[]
  expires_at?: string | null
}

export interface LoginResponse {
  token: string
  user: AuthUser
}

export async function fetchHealth(): Promise<HealthResponse> {
  const res = await fetch('/api/health')
  return res.json()
}

export async function login(username: string, password: string): Promise<LoginResponse> {
  return fetchAPI('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  })
}

export async function register(username: string, email: string, password: string): Promise<{ id: string; status: string; message: string }> {
  return fetchAPI('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ username, email, password }),
  })
}

export async function logout(): Promise<void> {
  await fetchAPI('/auth/logout', { method: 'POST' })
  clearToken()
}

export async function getMe(): Promise<AuthUser> {
  return fetchAPI('/auth/me')
}

// --- Admin: Users ---

export interface AdminUser {
  id: string
  username: string
  email?: string
  role: string
  status: string
  scope: string[]
  expires_at?: string | null
  created_at?: string | null
}

export async function adminListUsers(): Promise<AdminUser[]> {
  return fetchAPI('/admin/users')
}

export async function adminCreateUser(data: { username: string; email?: string; password: string; role: string; scope?: string[]; expires_at?: string }): Promise<AdminUser> {
  return fetchAPI('/admin/users', { method: 'POST', body: JSON.stringify(data) })
}

export async function adminUpdateUser(id: string, data: { role?: string; status?: string; scope?: string[]; expires_at?: string | null }): Promise<AdminUser> {
  return fetchAPI(`/admin/users/${id}`, { method: 'PUT', body: JSON.stringify(data) })
}

export async function adminDeleteUser(id: string): Promise<void> {
  await fetchAPI(`/admin/users/${id}`, { method: 'DELETE' })
}

export async function adminApproveUser(id: string, data?: { scope?: string[]; expires_at?: string }): Promise<AdminUser> {
  return fetchAPI(`/admin/users/${id}/approve`, { method: 'POST', body: JSON.stringify(data || {}) })
}

export async function adminDisableUser(id: string): Promise<AdminUser> {
  return fetchAPI(`/admin/users/${id}/disable`, { method: 'POST' })
}

export async function adminResetPassword(id: string, password: string): Promise<void> {
  return fetchAPI(`/admin/users/${id}/reset-password`, { method: 'POST', body: JSON.stringify({ password }) })
}

// --- Admin: Workspaces ---

export async function adminListWorkspaces(): Promise<{ name: string; description: string; environments: number; services: number }[]> {
  return fetchAPI('/admin/workspaces')
}

export async function adminImportWorkspace(yamlContent: string): Promise<{ name: string }> {
  return fetchAPI('/admin/workspaces', {
    method: 'POST',
    body: yamlContent,
    headers: { 'Content-Type': 'application/x-yaml' },
  })
}

export async function adminGetWorkspaceYAML(name: string): Promise<string> {
  const token = getToken()
  const headers: Record<string, string> = {}
  if (token) headers['Authorization'] = `Bearer ${token}`
  const res = await fetch(`/api/admin/workspaces/${name}/yaml`, { headers })
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(body.error || res.statusText)
  }
  return res.text()
}

export async function adminGetStandaloneServiceYAML(name: string): Promise<string> {
  const token = getToken()
  const headers: Record<string, string> = {}
  if (token) headers['Authorization'] = `Bearer ${token}`
  const res = await fetch(`/api/admin/services/${name}/yaml`, { headers })
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(body.error || res.statusText)
  }
  return res.text()
}

export async function adminGetStandaloneEnvYAML(name: string): Promise<string> {
  const token = getToken()
  const headers: Record<string, string> = {}
  if (token) headers['Authorization'] = `Bearer ${token}`
  const res = await fetch(`/api/admin/environments/${name}/yaml`, { headers })
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(body.error || res.statusText)
  }
  return res.text()
}

export async function adminUpdateWorkspace(name: string, yamlContent: string): Promise<void> {
  await fetchAPI(`/admin/workspaces/${name}`, {
    method: 'PUT',
    body: yamlContent,
    headers: { 'Content-Type': 'application/x-yaml' },
  })
}

export async function adminDeleteWorkspace(name: string): Promise<void> {
  await fetchAPI(`/admin/workspaces/${name}`, { method: 'DELETE' })
}

// --- Admin: Credentials ---

export interface AdminCredential {
  id: string
  name: string
  target_type: string
  description: string
  host?: string
  user?: string
  port?: string
  config?: Record<string, unknown>
  created_at?: string
  updated_at?: string
}

export async function adminListCredentials(): Promise<AdminCredential[]> {
  return fetchAPI('/admin/credentials')
}

export async function adminGetCredential(name: string): Promise<AdminCredential> {
  return fetchAPI(`/admin/credentials/${name}`)
}

export async function adminCreateCredential(data: { name: string; target_type: string; config: Record<string, unknown>; description?: string }): Promise<AdminCredential> {
  return fetchAPI('/admin/credentials', { method: 'POST', body: JSON.stringify(data) })
}

// Config values: '' keeps the stored value, null removes the key.
export async function adminUpdateCredential(name: string, data: { config?: Record<string, unknown>; description?: string }): Promise<AdminCredential> {
  return fetchAPI(`/admin/credentials/${name}`, { method: 'PUT', body: JSON.stringify(data) })
}

export interface CredentialUsage {
  kind: 'resource' | 'workspace' | 'environment' | 'service'
  name: string
  path: string
}

export async function adminCredentialUsage(name: string): Promise<CredentialUsage[]> {
  const res = await fetchAPI<{ used_by: CredentialUsage[] }>(`/admin/credentials/${name}/usage`)
  return res.used_by
}

// Fails with 409 while anything still references the credential.
export async function adminDeleteCredential(name: string): Promise<void> {
  await fetchAPI(`/admin/credentials/${name}`, { method: 'DELETE' })
}

export interface CredentialTestStep {
  name: string
  status: 'ok' | 'failed' | 'warning' | 'skipped'
  detail?: string
  duration_ms?: number
}

export interface CredentialTestResult {
  status: string
  error?: string
  message?: string
  target?: string
  duration_ms?: number
  steps?: CredentialTestStep[]
  facts?: { label: string; value: string }[]
}

export async function adminTestCredential(name: string, host?: string): Promise<CredentialTestResult> {
  return fetchAPI(`/admin/credentials/${name}/test`, {
    method: 'POST',
    body: host ? JSON.stringify({ host }) : undefined,
  })
}

// --- Admin: Resources ---

export interface AdminResource {
  id: string
  name: string
  type: string
  description: string
  config?: Record<string, unknown>
  created_at?: string
  updated_at?: string
}

export interface ResourceWorkloads {
  deployments: { name: string; replicas: number }[]
  statefulsets: { name: string; replicas: number }[]
  daemonsets: { name: string; desired: number }[]
}

export interface NamespacePodStats {
  total: number
  running: number
  pending: number
  failed: number
}

export interface NamespaceInfo {
  name: string
  pods: NamespacePodStats
  deployments: number
  statefulsets: number
  daemonsets: number
  status: 'healthy' | 'unhealthy' | 'pending' | 'empty'
}

export interface ResourceOverview {
  name: string
  namespaces: number
  pods: NamespacePodStats
  deployments: number
  statefulsets: number
  daemonsets: number
  health_percent: number
}

export async function adminListResources(): Promise<AdminResource[]> {
  return fetchAPI('/admin/resources')
}

export async function adminGetResource(name: string, full?: boolean): Promise<AdminResource> {
  return fetchAPI(`/admin/resources/${name}${full ? '?full=true' : ''}`)
}

export async function adminCreateResource(data: { name: string; type: string; config: Record<string, unknown>; description?: string }): Promise<AdminResource> {
  return fetchAPI('/admin/resources', { method: 'POST', body: JSON.stringify(data) })
}

export async function adminUpdateResource(name: string, data: { type?: string; config?: Record<string, unknown>; description?: string }): Promise<AdminResource> {
  return fetchAPI(`/admin/resources/${name}`, { method: 'PUT', body: JSON.stringify(data) })
}

export async function adminDeleteResource(name: string): Promise<void> {
  await fetchAPI(`/admin/resources/${name}`, { method: 'DELETE' })
}

export async function adminTestResource(name: string): Promise<{ status: string; error?: string; message?: string }> {
  return fetchAPI(`/admin/resources/${name}/test`, { method: 'POST' })
}

export async function adminListResourceNamespaces(name: string): Promise<NamespaceInfo[]> {
  return fetchAPI(`/admin/resources/${name}/namespaces`)
}

export async function adminGetResourceOverview(name: string): Promise<ResourceOverview> {
  return fetchAPI(`/admin/resources/${name}/overview`)
}

export async function adminListResourceWorkloads(name: string, namespace: string): Promise<ResourceWorkloads> {
  return fetchAPI(`/admin/resources/${name}/namespaces/${namespace}/workloads`)
}

export function resourceStreamURL(name: string, namespace: string, kind: string, workload: string): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${window.location.host}/api/admin/resources/${name}/namespaces/${namespace}/workloads/${kind}/${workload}/stream`
}

// --- Admin: Storage Resources ---

export interface StorageObject {
  key: string
  name: string
  size: number
  last_modified: string
}

export interface StorageDirectory {
  name: string
  path: string
}

export interface StorageListResult {
  path: string
  directories: StorageDirectory[]
  objects: StorageObject[]
}

export interface StorageOverview {
  name: string
  type: string
  object_count: number
  total_size_bytes: number
}

export async function adminGetStorageOverview(name: string): Promise<StorageOverview> {
  return fetchAPI(`/admin/resources/${name}/overview`)
}

export async function adminListStorageObjects(name: string, prefix?: string): Promise<StorageObject[]> {
  const params = prefix ? `?prefix=${encodeURIComponent(prefix)}&flat=true` : '?flat=true'
  return fetchAPI(`/admin/resources/${name}/storage/objects${params}`)
}

export async function adminListStorageDirectory(name: string, path?: string): Promise<StorageListResult> {
  const params = path ? `?path=${encodeURIComponent(path)}` : ''
  return fetchAPI(`/admin/resources/${name}/storage/objects${params}`)
}

export function storageObjectStreamURL(name: string, key: string): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${window.location.host}/api/admin/resources/${name}/storage/stream/${encodeURIComponent(key)}`
}

export type LogViewMode = 'stream' | 'file' | 'live'

export function appendLiveMode(url: string, mode: LogViewMode): string {
  if (mode === 'live') return `${url}${url.includes('?') ? '&' : '?'}mode=live`
  return url
}

export function storageObjectContentURL(name: string, key: string): string {
  return `/api/admin/resources/${name}/storage/content/${encodeURIComponent(key)}`
}

// --- Workspace Service Storage ---

export async function listServiceStorageObjects(workspace: string, service: string, path?: string): Promise<StorageListResult> {
  const params = path ? `?path=${encodeURIComponent(path)}` : ''
  return fetchAPI(`/ws/${workspace}/svc/${service}/storage/objects${params}`)
}

export function serviceStorageStreamURL(workspace: string, service: string, key: string): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${window.location.host}/api/ws/${workspace}/svc/${service}/storage/stream?key=${encodeURIComponent(key)}`
}

export function serviceStorageContentURL(workspace: string, service: string, key: string): string {
  return `/api/ws/${workspace}/svc/${service}/storage/content/${encodeURIComponent(key)}`
}

// --- Admin: Settings ---

export async function adminGetSettings(): Promise<Record<string, string>> {
  return fetchAPI('/admin/settings')
}

export async function adminUpdateSettings(settings: Record<string, string>): Promise<Record<string, string>> {
  return fetchAPI('/admin/settings', { method: 'PUT', body: JSON.stringify(settings) })
}

// --- Public Config ---

export async function fetchConfig(): Promise<AppConfig> {
  return fetchAPI('/config')
}

// --- Stats ---

export async function fetchStats(): Promise<GroupedStats> {
  return fetchAPI('/stats')
}

export interface CheckResult {
  status: 'up' | 'down'
  error?: string
  instances?: number
}

// --- Standalone Environments ---

export async function listStandaloneEnvs(): Promise<StandaloneEnvironment[]> {
  return fetchAPI('/env')
}

export async function listStandaloneEnvServices(envName: string): Promise<Service[]> {
  return (await fetchAPI<Service[]>(`/env/${envName}/svc`)) ?? []
}

export async function checkStandaloneEnvService(envName: string, svcName: string): Promise<CheckResult> {
  return fetchAPI(`/env/${envName}/svc/${svcName}/check`)
}

export function standaloneEnvStreamURL(envName: string, svcName: string): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${window.location.host}/api/env/${envName}/svc/${svcName}/stream`
}

// --- Standalone Services ---

export async function listStandaloneServices(): Promise<StandaloneService[]> {
  return fetchAPI('/svc')
}

export async function checkStandaloneService(svcName: string): Promise<CheckResult> {
  return fetchAPI(`/svc/${svcName}/check`)
}

export function standaloneServiceStreamURL(svcName: string): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${window.location.host}/api/svc/${svcName}/stream`
}

// --- Admin: Standalone Environments ---

export async function adminListStandaloneEnvs(): Promise<StandaloneEnvironment[]> {
  return fetchAPI('/admin/environments')
}

export async function adminCreateStandaloneEnv(data: { name: string; description?: string; services?: unknown[]; targets?: unknown[] }): Promise<StandaloneEnvironment> {
  return fetchAPI('/admin/environments', { method: 'POST', body: JSON.stringify(data) })
}

export async function adminUpdateStandaloneEnv(name: string, data: unknown): Promise<void> {
  await fetchAPI(`/admin/environments/${name}`, { method: 'PUT', body: JSON.stringify(data) })
}

export async function adminDeleteStandaloneEnv(name: string): Promise<void> {
  await fetchAPI(`/admin/environments/${name}`, { method: 'DELETE' })
}

// --- Admin: Standalone Services ---

export async function adminListStandaloneServices(): Promise<StandaloneService[]> {
  return fetchAPI('/admin/services')
}

export async function adminCreateStandaloneService(data: { name: string; description?: string; provider: string; config?: Record<string, unknown>; target?: unknown }): Promise<StandaloneService> {
  return fetchAPI('/admin/services', { method: 'POST', body: JSON.stringify(data) })
}

export async function adminUpdateStandaloneService(name: string, data: unknown): Promise<void> {
  await fetchAPI(`/admin/services/${name}`, { method: 'PUT', body: JSON.stringify(data) })
}

export async function adminDeleteStandaloneService(name: string): Promise<void> {
  await fetchAPI(`/admin/services/${name}`, { method: 'DELETE' })
}

export async function listWorkspaces(): Promise<Workspace[]> {
  return fetchAPI('/ws')
}

export async function listEnvironments(workspace: string): Promise<Environment[]> {
  return fetchAPI(`/ws/${workspace}/env`)
}

export async function listWorkspaceServices(workspace: string): Promise<{ name: string; friendly_name: string; provider: string; environments: number }[]> {
  return fetchAPI(`/ws/${workspace}/svc`)
}

export async function listServiceEnvironments(workspace: string, service: string): Promise<Environment[]> {
  return fetchAPI(`/ws/${workspace}/svc/${service}/env`)
}

export async function listServices(workspace: string, env: string): Promise<Service[]> {
  return (await fetchAPI<Service[]>(`/ws/${workspace}/env/${env}/svc`)) ?? []
}

export async function listInstances(workspace: string, env: string, service: string): Promise<Instance[]> {
  return (await fetchAPI<Instance[]>(`/ws/${workspace}/env/${env}/svc/${service}/instances`)) ?? []
}

export async function checkService(workspace: string, env: string, service: string): Promise<CheckResult> {
  return fetchAPI(`/ws/${workspace}/env/${env}/svc/${service}/check`)
}

export function streamURL(workspace: string, env: string, service: string): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${window.location.host}/api/ws/${workspace}/env/${env}/svc/${service}/stream`
}

// --- File Browser ---

export async function listLogFiles(ws: string, env: string, svc: string): Promise<{ files: LogFile[]; log_dir: string }> {
  return fetchAPI(`/ws/${ws}/env/${env}/svc/${svc}/files`)
}

export async function readFilePage(ws: string, env: string, svc: string, filename: string, page?: number, pageSize?: number): Promise<FilePage> {
  const params = new URLSearchParams()
  if (page) params.set('page', String(page))
  if (pageSize) params.set('page_size', String(pageSize))
  const qs = params.toString()
  return fetchAPI(`/ws/${ws}/env/${env}/svc/${svc}/files/${encodeURIComponent(filename)}${qs ? '?' + qs : ''}`)
}

export async function searchFiles(ws: string, env: string, svc: string, req: { pattern: string; files?: string[]; max_hits?: number; use_regex?: boolean }): Promise<{ results: FileSearchResult[]; truncated: boolean }> {
  return fetchAPI(`/ws/${ws}/env/${env}/svc/${svc}/files/search`, {
    method: 'POST',
    body: JSON.stringify(req),
  })
}

export function fileDownloadURL(ws: string, env: string, svc: string, filename: string): string {
  return `/api/ws/${ws}/env/${env}/svc/${svc}/files/${encodeURIComponent(filename)}/download`
}

/**
 * Starts a native browser download of an authenticated API URL. The server swaps the session
 * for a single-use, one-minute ticket bound to this path, so the token never appears in the URL
 * and large files still stream straight to disk.
 */
export async function startDownload(url: string): Promise<void> {
  const { ticket } = await fetchAPI<{ ticket: string }>('/download-tickets', {
    method: 'POST',
    body: JSON.stringify({ path: url }),
  })
  const a = document.createElement('a')
  a.href = `${url}${url.includes('?') ? '&' : '?'}dl=${encodeURIComponent(ticket)}`
  a.download = ''
  document.body.appendChild(a)
  a.click()
  a.remove()
}
