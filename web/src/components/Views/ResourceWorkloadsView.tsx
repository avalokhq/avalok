import { useState, useEffect } from 'react'
import { Server } from 'lucide-react'
import { cn } from '../../lib/cn'
import { adminListResourceWorkloads } from '../../lib/api'
import type { ResourceWorkloads } from '../../lib/api'
import LayoutToggle from '../ui/LayoutToggle'
import CollectionGrid from '../ui/CollectionGrid'
import { useLayoutToggle } from '../../lib/useLayoutToggle'
import PageHeader from '../ui/PageHeader'
import Spinner from '../ui/Spinner'
import Alert from '../ui/Alert'
import EmptyState from '../ui/EmptyState'
import Card from '../ui/Card'
import DataTable from '../ui/DataTable'

interface Workload {
  name: string
  kind: string
  kindLabel: string
  count: number
}

interface Props {
  resourceName: string
  namespace: string
  onViewLogs: (kind: string, workload: string) => void
}

const kindColor: Record<string, string> = {
  Deployment: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  StatefulSet: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  DaemonSet: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
}

export default function ResourceWorkloadsView({ resourceName, namespace, onViewLogs }: Props) {
  const [workloads, setWorkloads] = useState<Workload[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const { layout, changeLayout } = useLayoutToggle('avalok-res-wl-layout')

  useEffect(() => {
    setLoading(true)
    adminListResourceWorkloads(resourceName, namespace)
      .then((data: ResourceWorkloads) => {
        const items: Workload[] = [
          ...(data.deployments || []).map(d => ({ name: d.name, kind: 'deployment', kindLabel: 'Deployment', count: d.replicas })),
          ...(data.statefulsets || []).map(s => ({ name: s.name, kind: 'statefulset', kindLabel: 'StatefulSet', count: s.replicas })),
          ...(data.daemonsets || []).map(d => ({ name: d.name, kind: 'daemonset', kindLabel: 'DaemonSet', count: d.desired })),
        ]
        setWorkloads(items)
      })
      .catch(() => setError('Failed to load workloads'))
      .finally(() => setLoading(false))
  }, [resourceName, namespace])

  if (loading) return <Spinner label="Loading workloads..." />

  return (
    <div className="flex-1 overflow-auto">
      <div className="px-8 lg:px-16 py-8">
        <PageHeader
          title={`${resourceName} / ${namespace}`}
          description="Click a workload to stream its logs."
          actions={<LayoutToggle layout={layout} onChange={changeLayout} />}
        />

        {error && <Alert className="mb-4">{error}</Alert>}

        {workloads.length === 0 ? (
          <EmptyState
            icon={<Server className="w-7 h-7 text-[var(--text-muted)] opacity-60" />}
            title="No workloads found"
            description="Try selecting a different namespace."
          />
        ) : layout === 'list' ? (
          <DataTable
            columns={[
              {
                key: 'name',
                header: 'Workload',
                render: (w) => (
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center shrink-0">
                      <Server className="w-4 h-4 text-emerald-400" />
                    </div>
                    <span className="font-medium text-[var(--text-primary)]">{w.name}</span>
                  </div>
                ),
              },
              {
                key: 'kind',
                header: 'Kind',
                className: 'w-32',
                render: (w) => (
                  <span className={cn('text-[10px] px-1.5 py-0.5 rounded border font-medium', kindColor[w.kindLabel] || 'text-[var(--text-muted)]')}>
                    {w.kindLabel}
                  </span>
                ),
              },
              {
                key: 'replicas',
                header: 'Replicas',
                className: 'w-24',
                render: (w) => (
                  <span className="text-[var(--text-secondary)] tabular-nums">{w.count}</span>
                ),
              },
            ]}
            data={workloads}
            keyFn={w => `${w.kind}:${w.name}`}
            onRowClick={w => onViewLogs(w.kind, w.name)}
          />
        ) : (
          <CollectionGrid>
            {workloads.map(w => (
              <Card key={`${w.kind}:${w.name}`} hover padding="md" className="cursor-pointer" onClick={() => onViewLogs(w.kind, w.name)}>
                <div className="flex items-center justify-between w-full mb-3">
                  <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                    <Server className="w-4 h-4 text-emerald-400" />
                  </div>
                  <span className={cn('text-[10px] px-1.5 py-0.5 rounded border font-medium', kindColor[w.kindLabel] || 'text-[var(--text-muted)]')}>
                    {w.kindLabel}
                  </span>
                </div>
                <div className="text-sm font-medium text-[var(--text-primary)] truncate w-full">{w.name}</div>
                <div className="text-[11px] text-[var(--text-muted)] mt-1">{w.count} replica{w.count !== 1 ? 's' : ''}</div>
              </Card>
            ))}
          </CollectionGrid>
        )}
      </div>
    </div>
  )
}
