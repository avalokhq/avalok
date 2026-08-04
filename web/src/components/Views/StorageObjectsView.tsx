import { useState, useEffect } from 'react'
import { ChevronRight, RefreshCw, FileText, HardDrive, Search } from 'lucide-react'
import { cn } from '../../lib/cn'
import { adminListStorageObjects, adminGetStorageOverview } from '../../lib/api'
import type { StorageObject, StorageOverview } from '../../lib/api'
import { resourceIconUrl } from '../ui/ProviderIcon'
import PageHeader from '../ui/PageHeader'
import Card from '../ui/Card'
import Alert from '../ui/Alert'
import EmptyState from '../ui/EmptyState'
import IconButton from '../ui/IconButton'
import LayoutToggle from '../ui/LayoutToggle'
import CollectionGrid from '../ui/CollectionGrid'
import { useLayoutToggle } from '../../lib/useLayoutToggle'

interface Props {
  resourceName: string
  resourceType: string
  onViewObject: (key: string) => void
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`
}

function formatTime(iso: string): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
    + ' ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

const TYPE_LABELS: Record<string, string> = {
  s3: 'S3 Bucket',
  'azure-blob': 'Azure Blob Container',
  'azure-file': 'Azure File Share',
  gcs: 'GCS Bucket',
}

function OverviewHeader({ overview, resourceType, onRefresh, refreshing }: {
  overview: StorageOverview
  resourceType: string
  onRefresh: () => void
  refreshing: boolean
}) {
  const iconSrc = resourceIconUrl(resourceType)
  const stats = [
    { label: 'Objects', value: overview.object_count },
    { label: 'Total Size', value: formatBytes(overview.total_size_bytes) },
  ]

  return (
    <Card padding="md" className="mb-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-5">
          <div className="flex items-center gap-2.5">
            {iconSrc && <img src={iconSrc} alt="" className="w-5 h-5" />}
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
          <span className="text-xs text-[var(--text-secondary)]">{TYPE_LABELS[resourceType] || resourceType}</span>
        </div>
        <IconButton onClick={onRefresh} title="Refresh">
          <RefreshCw className={cn('w-3.5 h-3.5', refreshing && 'animate-spin')} />
        </IconButton>
      </div>
    </Card>
  )
}

export default function StorageObjectsView({ resourceName, resourceType, onViewObject }: Props) {
  const [objects, setObjects] = useState<StorageObject[]>([])
  const [overview, setOverview] = useState<StorageOverview | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState('')
  const { layout, changeLayout } = useLayoutToggle('avalok-res-storage-layout')

  function load(showRefresh?: boolean) {
    if (showRefresh) setRefreshing(true)
    else setLoading(true)

    Promise.all([
      adminListStorageObjects(resourceName),
      adminGetStorageOverview(resourceName),
    ])
      .then(([objs, ov]) => {
        setObjects(objs || [])
        setOverview(ov)
        setError('')
      })
      .catch(() => setError('Failed to load storage data'))
      .finally(() => {
        setLoading(false)
        setRefreshing(false)
      })
  }

  useEffect(() => { load() }, [resourceName])

  const filtered = filter
    ? objects.filter(o => o.key.toLowerCase().includes(filter.toLowerCase()))
    : objects

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
          description={`${objects.length} object${objects.length !== 1 ? 's' : ''} — click to stream logs`}
          actions={<LayoutToggle layout={layout} onChange={changeLayout} />}
        />

        {error && <Alert className="mb-4">{error}</Alert>}

        {overview && (
          <OverviewHeader overview={overview} resourceType={resourceType} onRefresh={() => load(true)} refreshing={refreshing} />
        )}

        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--text-muted)]" />
          <input
            type="text"
            placeholder="Filter objects by key..."
            value={filter}
            onChange={e => setFilter(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-default)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--border-focus)]"
          />
        </div>

        {filtered.length === 0 ? (
          <EmptyState
            icon={<HardDrive className="w-7 h-7 opacity-40" />}
            title={filter ? 'No matching objects' : 'No objects found'}
            description={filter ? 'Try a different filter.' : 'Check the storage connection and configuration.'}
          />
        ) : layout === 'list' ? (
          <div className="grid gap-1.5">
            {filtered.map(obj => (
              <Card key={obj.key} hover padding="none" className="cursor-pointer" onClick={() => onViewObject(obj.key)}>
                <div className="flex items-center justify-between px-4 py-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <FileText className="w-3.5 h-3.5 text-[var(--text-muted)] shrink-0" />
                    <span className="text-[13px] font-medium text-[var(--text-primary)] truncate" title={obj.key}>{obj.key}</span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0 ml-3">
                    <div className="flex items-center gap-3 text-[11px] text-[var(--text-secondary)] tabular-nums">
                      <span>{formatBytes(obj.size)}</span>
                      <span>{formatTime(obj.last_modified)}</span>
                    </div>
                    <ChevronRight className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                  </div>
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <CollectionGrid>
            {filtered.map(obj => (
              <Card key={obj.key} hover padding="md" className="cursor-pointer" onClick={() => onViewObject(obj.key)}>
                <div className="flex items-center gap-2 mb-2">
                  <FileText className="w-3.5 h-3.5 text-[var(--text-muted)] shrink-0" />
                  <span className="text-sm font-medium text-[var(--text-primary)] truncate" title={obj.key}>{obj.name}</span>
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-[var(--text-secondary)] tabular-nums">
                  <span>{formatBytes(obj.size)}</span>
                  <span>{formatTime(obj.last_modified)}</span>
                </div>
              </Card>
            ))}
          </CollectionGrid>
        )}
      </div>
    </div>
  )
}
