import { useState, useEffect } from 'react'
import { Server, Loader2, Check } from 'lucide-react'
import Modal from '../ui/Modal'
import Button from '../ui/Button'
import Alert from '../ui/Alert'
import Badge from '../ui/Badge'
import Checkbox from '../ui/Checkbox'
import FormField from '../ui/FormField'
import { Select } from '../ui/Input'
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

  const allWorkloads = [
    ...(workloads?.deployments || []).map(d => ({ key: `deployment:${d.name}`, kind: 'Deployment', name: d.name, count: d.replicas })),
    ...(workloads?.statefulsets || []).map(s => ({ key: `statefulset:${s.name}`, kind: 'StatefulSet', name: s.name, count: s.replicas })),
    ...(workloads?.daemonsets || []).map(d => ({ key: `daemonset:${d.name}`, kind: 'DaemonSet', name: d.name, count: d.desired })),
  ]

  return (
    <Modal
      title="Connect from Resource"
      onClose={onClose}
      footer={
        <>
          <span className="mr-auto text-xs text-fg-muted tabular-nums">
            {selected.size > 0 ? `${selected.size} workload${selected.size !== 1 ? 's' : ''} selected` : 'Select workloads to connect'}
          </span>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleConnect}
            disabled={selected.size === 0}
            loading={loading === 'connecting'}
            leftIcon={<Check />}
          >
            {loading === 'connecting' ? 'Connecting...' : 'Connect'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && <Alert tone="danger">{error}</Alert>}

        <FormField label="Cluster Resource">
          {resources.length === 0 && loading !== 'resources' ? (
            <p className="text-xs text-fg-muted">No resources available. Add a Kubernetes cluster in Settings &rarr; Resources first.</p>
          ) : (
            <Select value={selectedResource} onChange={e => handleResourceChange(e.target.value)} disabled={loading === 'resources'}>
              <option value="">Select a cluster...</option>
              {resources.map(r => (
                <option key={r.name} value={r.name}>{r.name}{r.description ? ` — ${r.description}` : ''}</option>
              ))}
            </Select>
          )}
        </FormField>

        {selectedResource && (
          <FormField label="Namespace">
            {loading === 'namespaces' ? (
              <div className="flex items-center gap-2 text-xs text-fg-muted">
                <Loader2 className="size-3 animate-spin" /> Loading namespaces...
              </div>
            ) : (
              <Select value={selectedNamespace} onChange={e => handleNamespaceChange(e.target.value)}>
                <option value="">Select a namespace...</option>
                {namespaces.map(ns => (
                  <option key={ns.name} value={ns.name}>{ns.name}</option>
                ))}
              </Select>
            )}
          </FormField>
        )}

        {selectedNamespace && workloads && (
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-xs font-medium text-fg-secondary">Workloads</span>
              {allWorkloads.length > 0 && (
                <Button
                  variant="link"
                  className="text-xs"
                  onClick={() => {
                    if (selected.size === allWorkloads.length) setSelected(new Set())
                    else setSelected(new Set(allWorkloads.map(w => w.key)))
                  }}
                >
                  {selected.size === allWorkloads.length ? 'Deselect all' : 'Select all'}
                </Button>
              )}
            </div>
            {loading === 'workloads' ? (
              <div className="flex items-center gap-2 text-xs text-fg-muted">
                <Loader2 className="size-3 animate-spin" /> Loading workloads...
              </div>
            ) : allWorkloads.length === 0 ? (
              <p className="text-xs text-fg-muted">No deployments, statefulsets, or daemonsets in this namespace.</p>
            ) : (
              <div className="max-h-48 overflow-auto rounded-card border border-line bg-surface-sunken">
                {allWorkloads.map(w => {
                  const slug = w.name.toLowerCase().replace(/[^a-z0-9-]/g, '-')
                  const exists = existingServices.some(s => s.name === slug)
                  return (
                    <div
                      key={w.key}
                      className="flex items-center gap-2 border-b border-line px-3 py-2 transition-colors hover:bg-hover last:border-b-0"
                    >
                      <Checkbox
                        checked={selected.has(w.key)}
                        onChange={() => toggleWorkload(w.key)}
                        className="min-w-0 flex-1"
                        label={
                          <span className="flex items-center gap-2">
                            <Server className="size-3 shrink-0 text-fg-muted" />
                            <span className="truncate">{w.name}</span>
                          </span>
                        }
                      />
                      {exists && <Badge tone="success" size="sm">exists</Badge>}
                      <Badge tone="neutral" size="sm">{w.kind}</Badge>
                      <span className="text-2xs text-fg-muted tabular-nums">{w.count} replica{w.count !== 1 ? 's' : ''}</span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  )
}
