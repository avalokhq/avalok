import { useState, useEffect, useCallback } from 'react'
import { RefreshCw, Shield, Box } from 'lucide-react'
import { cn } from '../../lib/cn'
import { plural } from '../../lib/format'
import { toneText, type Tone } from '../../lib/statusTone'
import { adminListResourceNamespaces, adminGetResourceOverview } from '../../lib/api'
import type { NamespaceInfo, ResourceOverview } from '../../lib/api'
import type { DotStatus } from '../ui/StatusDot'
import PageHeader from '../ui/PageHeader'
import Card from '../ui/Card'
import Alert from '../ui/Alert'
import Button from '../ui/Button'
import EmptyState from '../ui/EmptyState'
import IconButton from '../ui/IconButton'
import EntityCollection from '../ui/EntityCollection'
import Page from '../Layout/Page'

const K8S_LOGO = 'https://cdn.jsdelivr.net/gh/selfhst/icons@main/webp/kubernetes.webp'

interface Props {
  resourceName: string
  onSelect: (namespace: string) => void
}

const NS_STATUS: Record<string, { status: DotStatus; label: string }> = {
  healthy: { status: 'ok', label: 'Healthy' },
  unhealthy: { status: 'error', label: 'Unhealthy' },
  pending: { status: 'warn', label: 'Pending' },
}

function healthTone(percent: number): Tone {
  return percent >= 90 ? 'success' : percent >= 70 ? 'warning' : 'danger'
}

function OverviewStrip({ overview }: { overview: ResourceOverview }) {
  const stats = [
    { label: 'Namespaces', value: overview.namespaces },
    { label: 'Pods', value: overview.pods.total },
    { label: 'Deployments', value: overview.deployments },
    { label: 'StatefulSets', value: overview.statefulsets },
    { label: 'DaemonSets', value: overview.daemonsets },
  ]

  return (
    <Card padding="none" className="mb-6 flex flex-wrap items-stretch divide-x divide-line">
      {stats.map(s => (
        <div key={s.label} className="min-w-28 flex-1 px-5 py-4">
          <div className="text-xs text-fg-muted">{s.label}</div>
          <div className="mt-1 text-xl font-semibold tracking-tight text-fg tabular-nums">{s.value}</div>
        </div>
      ))}
      <div className="min-w-28 flex-1 px-5 py-4">
        <div className="text-xs text-fg-muted">Health</div>
        <div className={cn('mt-1 flex items-center gap-1.5 text-xl font-semibold tracking-tight tabular-nums', toneText[healthTone(overview.health_percent)])}>
          <Shield className="size-4" />
          {overview.health_percent}%
        </div>
      </div>
    </Card>
  )
}

export default function ResourceNamespacesView({ resourceName, onSelect }: Props) {
  const [namespaces, setNamespaces] = useState<NamespaceInfo[]>([])
  const [overview, setOverview] = useState<ResourceOverview | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    setRefreshing(true)
    Promise.all([
      adminListResourceNamespaces(resourceName),
      adminGetResourceOverview(resourceName),
    ])
      .then(([ns, ov]) => {
        setNamespaces(ns || [])
        setOverview(ov)
        setError(null)
      })
      .catch(err => setError(err instanceof Error ? err.message : 'Failed to load cluster data'))
      .finally(() => {
        setLoading(false)
        setRefreshing(false)
      })
  }, [resourceName])

  useEffect(() => { load() }, [load])

  return (
    <Page>
      <PageHeader
        eyebrow="Kubernetes"
        title={resourceName}
        description={loading ? 'Loading namespaces…' : `${plural(namespaces.length, 'namespace')} · pick one to see its workloads`}
        actions={
          <IconButton label="Refresh" size="md" onClick={load} disabled={refreshing}>
            <RefreshCw className={cn('size-4', refreshing && 'animate-spin')} />
          </IconButton>
        }
      />

      {error && (
        <Alert tone="danger" title="Couldn't load cluster data" className="mb-6"
          action={<Button size="sm" variant="secondary" onClick={load} loading={refreshing}>Retry</Button>}>
          {error}
        </Alert>
      )}

      {loading ? (
        <div className="skeleton mb-6 h-20 rounded-card" />
      ) : overview && <OverviewStrip overview={overview} />}

      <EntityCollection
        items={namespaces}
        keyFn={ns => ns.name}
        kind="resource"
        kindLabel={() => 'Namespace'}
        name={ns => ns.name}
        icon={() => <img src={K8S_LOGO} alt="" />}
        status={ns => NS_STATUS[ns.status] ?? { status: 'idle', label: 'No workloads' }}
        meta={ns => (
          <span className="flex items-center gap-3 tabular-nums">
            <span title="Pods" className="flex items-center gap-1"><Box className="size-3.5" />{ns.pods.total}</span>
            <span title="Deployments">{ns.deployments} deploy</span>
            <span title="StatefulSets">{ns.statefulsets} sts</span>
            <span title="DaemonSets">{ns.daemonsets} ds</span>
          </span>
        )}
        metaHeader="Workloads"
        searchPlaceholder="Filter namespaces…"
        actionLabel="Workloads"
        onOpen={ns => () => onSelect(ns.name)}
        layoutKey="avalok-res-ns-layout"
        loading={loading}
        noun="namespaces"
        empty={!error && (
          <EmptyState
            icon={<img src={K8S_LOGO} alt="" className="size-7 opacity-60" />}
            title="No namespaces found"
            description="Check the cluster connection and try again."
          />
        )}
      />
    </Page>
  )
}
