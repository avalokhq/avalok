import { useState, useEffect, useCallback } from 'react'
import { Layers, RefreshCw, Server } from 'lucide-react'
import { cn } from '../../lib/cn'
import { plural } from '../../lib/format'
import type { Tone } from '../../lib/statusTone'
import { adminListResourceWorkloads } from '../../lib/api'
import type { ResourceWorkloads } from '../../lib/api'
import PageHeader from '../ui/PageHeader'
import Alert from '../ui/Alert'
import Badge from '../ui/Badge'
import Button from '../ui/Button'
import EmptyState from '../ui/EmptyState'
import IconButton from '../ui/IconButton'
import EntityCollection from '../ui/EntityCollection'
import FilterChip from '../ui/FilterChip'
import Page from '../Layout/Page'

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

const KINDS: { kind: string; label: string; tone: Tone }[] = [
  { kind: 'deployment', label: 'Deployment', tone: 'info' },
  { kind: 'statefulset', label: 'StatefulSet', tone: 'accent' },
  { kind: 'daemonset', label: 'DaemonSet', tone: 'warning' },
]
const KIND_TONE = Object.fromEntries(KINDS.map(k => [k.kind, k.tone])) as Record<string, Tone>

export default function ResourceWorkloadsView({ resourceName, namespace, onViewLogs }: Props) {
  const [workloads, setWorkloads] = useState<Workload[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [kindFilter, setKindFilter] = useState<string | null>(null)

  const load = useCallback(() => {
    setRefreshing(true)
    adminListResourceWorkloads(resourceName, namespace)
      .then((data: ResourceWorkloads) => {
        setWorkloads([
          ...(data.deployments || []).map(d => ({ name: d.name, kind: 'deployment', kindLabel: 'Deployment', count: d.replicas })),
          ...(data.statefulsets || []).map(s => ({ name: s.name, kind: 'statefulset', kindLabel: 'StatefulSet', count: s.replicas })),
          ...(data.daemonsets || []).map(d => ({ name: d.name, kind: 'daemonset', kindLabel: 'DaemonSet', count: d.desired })),
        ])
        setError(null)
      })
      .catch(err => setError(err instanceof Error ? err.message : 'Failed to load workloads'))
      .finally(() => { setLoading(false); setRefreshing(false) })
  }, [resourceName, namespace])

  useEffect(() => { load() }, [load])

  const counts = Object.fromEntries(KINDS.map(k => [k.kind, workloads.filter(w => w.kind === k.kind).length]))

  return (
    <Page>
      <PageHeader
        eyebrow={resourceName}
        title={namespace}
        description="Pick a workload to stream its logs."
        actions={
          <IconButton label="Refresh" size="md" onClick={load} disabled={refreshing}>
            <RefreshCw className={cn('size-4', refreshing && 'animate-spin')} />
          </IconButton>
        }
      />

      {error && (
        <Alert tone="danger" title="Couldn't load workloads" className="mb-6"
          action={<Button size="sm" variant="secondary" onClick={load} loading={refreshing}>Retry</Button>}>
          {error}
        </Alert>
      )}

      <EntityCollection
        items={workloads}
        keyFn={w => `${w.kind}:${w.name}`}
        kind={() => 'resource'}
        kindLabel={w => w.kindLabel}
        name={w => w.name}
        icon={() => <Server />}
        badges={w => <Badge tone={KIND_TONE[w.kind] ?? 'neutral'} size="sm">{w.kindLabel}</Badge>}
        meta={w => <span className="flex items-center gap-1.5 tabular-nums"><Layers className="size-3.5" />{plural(w.count, 'replica')}</span>}
        metaHeader="Replicas"
        searchText={w => [w.name, w.kindLabel]}
        searchPlaceholder="Filter workloads…"
        actionLabel="View logs"
        onOpen={w => () => onViewLogs(w.kind, w.name)}
        layoutKey="avalok-res-wl-layout"
        loading={loading}
        noun="workloads"
        filters={KINDS.filter(k => counts[k.kind] > 0).map(k => (
          <FilterChip key={k.kind} label={`${k.label}s`} count={counts[k.kind]}
            active={kindFilter === k.kind} tone={k.tone} onToggle={() => setKindFilter(kindFilter === k.kind ? null : k.kind)} />
        ))}
        filter={w => !kindFilter || w.kind === kindFilter}
        filterActive={!!kindFilter}
        onClearFilters={() => setKindFilter(null)}
        empty={!error && (
          <EmptyState icon={<Server />} title="No workloads found" description="This namespace has no deployments, statefulsets or daemonsets." />
        )}
      />
    </Page>
  )
}
