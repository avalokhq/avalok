import { useState, useEffect } from 'react'
import { ChevronRight, RefreshCw, Shield } from 'lucide-react'
import { cn } from '../../lib/cn'
import { adminListResourceNamespaces, adminGetResourceOverview } from '../../lib/api'
import type { NamespaceInfo, ResourceOverview } from '../../lib/api'
import PageHeader from '../ui/PageHeader'
import Card from '../ui/Card'
import Alert from '../ui/Alert'
import EmptyState from '../ui/EmptyState'
import IconButton from '../ui/IconButton'
import LayoutToggle from '../ui/LayoutToggle'
import CollectionGrid from '../ui/CollectionGrid'
import { useLayoutToggle } from '../../lib/useLayoutToggle'

const K8S_LOGO = 'https://cdn.jsdelivr.net/gh/selfhst/icons@main/webp/kubernetes.webp'

interface Props {
  resourceName: string
  onSelect: (namespace: string) => void
}

const STATUS_DOT: Record<string, string> = {
  healthy: 'bg-[var(--accent-bright)]',
  unhealthy: 'bg-red-400',
  pending: 'bg-amber-400',
  empty: 'bg-[var(--text-muted)]',
}

function OverviewHeader({ overview, onRefresh, refreshing }: { overview: ResourceOverview; onRefresh: () => void; refreshing: boolean }) {
  const stats = [
    { label: 'Namespaces', value: overview.namespaces },
    { label: 'Pods', value: overview.pods.total },
    { label: 'Deployments', value: overview.deployments },
    { label: 'StatefulSets', value: overview.statefulsets },
    { label: 'DaemonSets', value: overview.daemonsets },
  ]

  return (
    <Card padding="md" className="mb-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-5">
          <div className="flex items-center gap-2.5">
            <img src={K8S_LOGO} alt="" className="w-5 h-5" />
            <span className="text-sm font-medium text-[var(--text-primary)]">{overview.name}</span>
          </div>
          <span className="w-px h-4 bg-[var(--border-default)]" />
          {stats.map(s => (
            <div key={s.label} className="flex items-center gap-1.5">
              <span className="text-sm font-semibold text-[var(--text-primary)] tabular-nums">{s.value}</span>
              <span className="text-[11px] text-[var(--text-secondary)]">{s.label}</span>
            </div>
          ))}
          <span className="w-px h-4 bg-[var(--border-default)]" />
          <span className={cn(
            'text-xs font-medium',
            overview.health_percent >= 90 ? 'text-emerald-400' : overview.health_percent >= 70 ? 'text-amber-400' : 'text-red-400'
          )}>
            <Shield className="w-3 h-3 inline mr-1" />
            {overview.health_percent}%
          </span>
        </div>
        <IconButton onClick={onRefresh} title="Refresh">
          <RefreshCw className={cn('w-3.5 h-3.5', refreshing && 'animate-spin')} />
        </IconButton>
      </div>
    </Card>
  )
}

export default function ResourceNamespacesView({ resourceName, onSelect }: Props) {
  const [namespaces, setNamespaces] = useState<NamespaceInfo[]>([])
  const [overview, setOverview] = useState<ResourceOverview | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const { layout, changeLayout } = useLayoutToggle('avalok-res-ns-layout')

  function load(showRefresh?: boolean) {
    if (showRefresh) setRefreshing(true)
    else setLoading(true)

    Promise.all([
      adminListResourceNamespaces(resourceName),
      adminGetResourceOverview(resourceName),
    ])
      .then(([ns, ov]) => {
        setNamespaces(ns || [])
        setOverview(ov)
        setError('')
      })
      .catch(() => setError('Failed to load cluster data'))
      .finally(() => {
        setLoading(false)
        setRefreshing(false)
      })
  }

  useEffect(() => { load() }, [resourceName])

  if (loading) {
    return (
      <div className="flex-1 overflow-auto">
        <div className="px-8 lg:px-16 py-8">
          <div className="skeleton h-12 rounded-xl mb-6" />
          <div className="grid gap-1.5">
            {Array.from({ length: 12 }).map((_, i) => <div key={i} className="skeleton h-10 rounded-xl" />)}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-auto">
      <div className="px-8 lg:px-16 py-8">
        <PageHeader
          title={resourceName}
          description={`${namespaces.length} namespace${namespaces.length !== 1 ? 's' : ''}`}
          actions={<LayoutToggle layout={layout} onChange={changeLayout} />}
        />

        {error && <Alert className="mb-4">{error}</Alert>}

        {overview && (
          <OverviewHeader overview={overview} onRefresh={() => load(true)} refreshing={refreshing} />
        )}

        {namespaces.length === 0 ? (
          <EmptyState
            icon={<img src={K8S_LOGO} alt="" className="w-7 h-7 opacity-40" />}
            title="No namespaces found"
            description="Check the cluster connection and try again."
          />
        ) : layout === 'list' ? (
          <div className="grid gap-1.5">
            {namespaces.map(ns => (
              <Card key={ns.name} hover padding="none" className="cursor-pointer" onClick={() => onSelect(ns.name)}>
                <div className="flex items-center justify-between px-4 py-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={cn('w-2 h-2 rounded-full shrink-0', STATUS_DOT[ns.status] || STATUS_DOT.empty, ns.status === 'healthy' && 'status-pulse')} />
                    <span className="text-[13px] font-medium text-[var(--text-primary)] truncate">{ns.name}</span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0 ml-3">
                    <div className="flex items-center gap-2.5 text-[11px] text-[var(--text-secondary)] tabular-nums">
                      <span title="Pods">{ns.pods.total}p</span>
                      <span title="Deployments">{ns.deployments}d</span>
                      <span title="StatefulSets">{ns.statefulsets}s</span>
                      <span title="DaemonSets">{ns.daemonsets}ds</span>
                    </div>
                    <ChevronRight className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                  </div>
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <CollectionGrid>
            {namespaces.map(ns => (
              <Card key={ns.name} hover padding="md" className="cursor-pointer" onClick={() => onSelect(ns.name)}>
                <div className="flex items-center gap-2 mb-3">
                  <span className={cn('w-2 h-2 rounded-full shrink-0', STATUS_DOT[ns.status] || STATUS_DOT.empty, ns.status === 'healthy' && 'status-pulse')} />
                  <span className="text-sm font-medium text-[var(--text-primary)] truncate">{ns.name}</span>
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-[var(--text-secondary)] tabular-nums">
                  <span title="Pods">{ns.pods.total} pods</span>
                  <span title="Deployments">{ns.deployments} deploy</span>
                  <span title="StatefulSets">{ns.statefulsets} sts</span>
                  <span title="DaemonSets">{ns.daemonsets} ds</span>
                </div>
              </Card>
            ))}
          </CollectionGrid>
        )}
      </div>
    </div>
  )
}
