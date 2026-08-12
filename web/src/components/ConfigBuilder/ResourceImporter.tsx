import { useState, useEffect } from 'react'
import { Server, Loader2, Check, X } from 'lucide-react'
import { cn } from '../../lib/cn'
import { adminListResources, adminListResourceNamespaces, adminListResourceWorkloads, adminGetResource } from '../../lib/api'
import type { AdminResource, ResourceWorkloads } from '../../lib/api'
import type { ServiceDef } from './types'
import { createId } from './types'

export interface ConnectResult {
  connection: Record<string, string>
  services: ServiceDef[]
  serviceNames: string[]
  targetName: string
}

interface Props {
  onConnect: (result: ConnectResult) => void
  onClose: () => void
  existingServices: ServiceDef[]
}

export default function ResourceImporter({ onConnect, onClose, existingServices }: Props) {
  const [resources, setResources] = useState<AdminResource[]>([])
  const [selectedResource, setSelectedResource] = useState<string>('')
  const [namespaces, setNamespaces] = useState<{ name: string }[]>([])
  const [selectedNamespace, setSelectedNamespace] = useState<string>('')
  const [workloads, setWorkloads] = useState<ResourceWorkloads | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState<string>('')
  const [error, setError] = useState('')

  useEffect(() => {
    setLoading('resources')
    adminListResources()
      .then(r => setResources((r || []).filter(res => res.type === 'kubernetes')))
      .catch(() => setError('Failed to load resources'))
      .finally(() => setLoading(''))
  }, [])

  async function handleResourceChange(name: string) {
    setSelectedResource(name)
    setSelectedNamespace('')
    setNamespaces([])
    setWorkloads(null)
    setSelected(new Set())
    if (!name) return
    setLoading('namespaces')
    try {
      const ns = await adminListResourceNamespaces(name)
      setNamespaces(ns || [])
    } catch { setError('Failed to load namespaces') }
    finally { setLoading('') }
  }

  async function handleNamespaceChange(ns: string) {
    setSelectedNamespace(ns)
    setWorkloads(null)
    setSelected(new Set())
    if (!ns) return
    setLoading('workloads')
    try {
      const w = await adminListResourceWorkloads(selectedResource, ns)
      setWorkloads(w)
    } catch { setError('Failed to load workloads') }
    finally { setLoading('') }
  }

  function toggleWorkload(key: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  async function handleConnect() {
    if (selected.size === 0) return
    setLoading('connecting')
    try {
      const res = await adminGetResource(selectedResource, true)
      const config = res.config || {}

      const existingNames = new Set(existingServices.map(s => s.name))
      const newServices: ServiceDef[] = []
      const allServiceNames: string[] = []

      for (const key of selected) {
        const [kind, name] = key.split(':')
        const slug = name.toLowerCase().replace(/[^a-z0-9-]/g, '-')

        allServiceNames.push(slug)

        if (existingNames.has(slug)) continue

        const svcConfig: Record<string, string> = {}
        if (kind === 'deployment') svcConfig.deployment = name
        else if (kind === 'statefulset') svcConfig.statefulset = name
        else if (kind === 'daemonset') svcConfig.daemonset = name

        newServices.push({
          id: createId(),
          name: slug,
          provider: 'kubernetes',
          friendly_name: name,
          resource: '',
          config: svcConfig,
        })
      }

      const connection: Record<string, string> = { namespace: selectedNamespace }
      if (config.kubeconfig_content) {
        connection.kubeconfig_content = String(config.kubeconfig_content)
        if (config.context) connection.context = String(config.context)
      } else {
        if (config.api_server_url) connection.api_server_url = String(config.api_server_url)
        if (config.bearer_token) connection.bearer_token = String(config.bearer_token)
        if (config.ca_cert) connection.ca_cert = String(config.ca_cert)
        if (config.insecure_skip_tls) connection.insecure_skip_tls = 'true'
      }

      onConnect({
        connection,
        services: newServices,
        serviceNames: allServiceNames,
        targetName: selectedResource,
      })
    } catch {
      setError('Failed to connect resource')
    } finally {
      setLoading('')
    }
  }

  const selectClass = 'w-full px-3 py-1.5 rounded-md bg-[var(--bg-elevated)] border border-[var(--border-default)] text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--text-accent)] transition-colors'
  const allWorkloads = [
    ...(workloads?.deployments || []).map(d => ({ key: `deployment:${d.name}`, kind: 'Deployment', name: d.name, count: d.replicas })),
    ...(workloads?.statefulsets || []).map(s => ({ key: `statefulset:${s.name}`, kind: 'StatefulSet', name: s.name, count: s.replicas })),
    ...(workloads?.daemonsets || []).map(d => ({ key: `daemonset:${d.name}`, kind: 'DaemonSet', name: d.name, count: d.desired })),
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="bg-[var(--bg-surface)] border border-[var(--border-strong)] rounded-2xl shadow-[var(--shadow-dialog)] w-full max-w-lg mx-4 max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border-subtle)]">
          <div className="flex items-center gap-2">
            <Server className="w-4 h-4 text-blue-400" />
            <h3 className="text-base text-[var(--text-primary)]">Connect from Resource</h3>
          </div>
          <button onClick={onClose} className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-auto p-5 space-y-4">
          {error && <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</div>}

          <div>
            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Cluster Resource</label>
            {resources.length === 0 && loading !== 'resources' ? (
              <p className="text-xs text-[var(--text-muted)]">No resources available. Add a Kubernetes cluster in Settings &rarr; Resources first.</p>
            ) : (
              <select value={selectedResource} onChange={e => handleResourceChange(e.target.value)} className={selectClass} disabled={loading === 'resources'}>
                <option value="">Select a cluster...</option>
                {resources.map(r => (
                  <option key={r.name} value={r.name}>{r.name}{r.description ? ` — ${r.description}` : ''}</option>
                ))}
              </select>
            )}
          </div>

          {selectedResource && (
            <div>
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Namespace</label>
              {loading === 'namespaces' ? (
                <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
                  <Loader2 className="w-3 h-3 animate-spin" /> Loading namespaces...
                </div>
              ) : (
                <select value={selectedNamespace} onChange={e => handleNamespaceChange(e.target.value)} className={selectClass}>
                  <option value="">Select a namespace...</option>
                  {namespaces.map(ns => (
                    <option key={ns.name} value={ns.name}>{ns.name}</option>
                  ))}
                </select>
              )}
            </div>
          )}

          {selectedNamespace && workloads && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-medium text-[var(--text-secondary)]">Workloads</label>
                {allWorkloads.length > 0 && (
                  <button
                    onClick={() => {
                      if (selected.size === allWorkloads.length) setSelected(new Set())
                      else setSelected(new Set(allWorkloads.map(w => w.key)))
                    }}
                    className="text-[10px] text-[var(--text-accent)] hover:underline"
                  >
                    {selected.size === allWorkloads.length ? 'Deselect all' : 'Select all'}
                  </button>
                )}
              </div>
              {loading === 'workloads' ? (
                <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
                  <Loader2 className="w-3 h-3 animate-spin" /> Loading workloads...
                </div>
              ) : allWorkloads.length === 0 ? (
                <p className="text-xs text-[var(--text-muted)]">No deployments, statefulsets, or daemonsets in this namespace.</p>
              ) : (
                <div className="border border-[var(--border-default)] rounded-lg bg-[var(--bg-elevated)] max-h-48 overflow-auto">
                  {allWorkloads.map(w => {
                    const slug = w.name.toLowerCase().replace(/[^a-z0-9-]/g, '-')
                    const exists = existingServices.some(s => s.name === slug)
                    return (
                      <label
                        key={w.key}
                        className="flex items-center gap-2 px-3 py-2 hover:bg-[var(--bg-hover)] cursor-pointer border-b border-[var(--border-subtle)] last:border-b-0"
                      >
                        <input
                          type="checkbox"
                          checked={selected.has(w.key)}
                          onChange={() => toggleWorkload(w.key)}
                          className="rounded border-[var(--border-default)] accent-[var(--text-accent)]"
                        />
                        <Server className="w-3 h-3 text-[var(--text-muted)]" />
                        <span className="text-sm text-[var(--text-primary)] flex-1">{w.name}</span>
                        {exists && <span className="text-[10px] text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded">exists</span>}
                        <span className="text-[10px] text-[var(--text-muted)] bg-[var(--bg-app)] px-1.5 py-0.5 rounded">{w.kind}</span>
                        <span className="text-[10px] text-[var(--text-muted)]">{w.count} replica{w.count !== 1 ? 's' : ''}</span>
                      </label>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between px-5 py-4 border-t border-[var(--border-subtle)]">
          <span className="text-xs text-[var(--text-muted)]">
            {selected.size > 0 ? `${selected.size} workload${selected.size !== 1 ? 's' : ''} selected` : 'Select workloads to connect'}
          </span>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-3 py-1.5 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
              Cancel
            </button>
            <button
              onClick={handleConnect}
              disabled={selected.size === 0 || loading === 'connecting'}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all duration-150',
                selected.size > 0
                  ? 'bg-[var(--text-accent)] text-white hover:opacity-90 hover:scale-[1.02]'
                  : 'bg-[var(--bg-elevated)] text-[var(--text-muted)] cursor-not-allowed'
              )}
            >
              {loading === 'connecting' ? (
                <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Connecting...</>
              ) : (
                <><Check className="w-3.5 h-3.5" /> Connect</>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
