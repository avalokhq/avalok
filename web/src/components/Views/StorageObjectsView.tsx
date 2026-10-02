import { useState, useEffect, useCallback } from 'react'
import { ChevronRight, RefreshCw, FileText, HardDrive, Folder, Home } from 'lucide-react'
import { cn } from '../../lib/cn'
import { formatBytes, formatDateTime, plural } from '../../lib/format'
import { adminListStorageDirectory, adminGetStorageOverview, listServiceStorageObjects } from '../../lib/api'
import type { StorageListResult, StorageOverview } from '../../lib/api'
import { resourceIconUrl } from '../ui/ProviderIcon'
import PageHeader from '../ui/PageHeader'
import Card from '../ui/Card'
import Alert from '../ui/Alert'
import Button from '../ui/Button'
import EmptyState from '../ui/EmptyState'
import IconButton from '../ui/IconButton'
import DataTable, { type Column } from '../ui/DataTable'
import { SearchInput } from '../ui/Input'
import Page from '../Layout/Page'

interface Props {
  resourceName: string
  resourceType: string
  onViewObject: (key: string, currentPath: string) => void
  initialPath?: string
  workspaceName?: string
}

interface Row {
  id: string
  name: string
  isDir: boolean
  path: string
  size?: number
  modified?: string
}

const TYPE_LABELS: Record<string, string> = {
  s3: 'S3 bucket',
  'azure-blob': 'Azure Blob container',
  'azure-file': 'Azure File share',
  gcs: 'GCS bucket',
}

function Breadcrumbs({ path, onNavigate }: { path: string; onNavigate: (path: string) => void }) {
  const parts = path.split('/').filter(Boolean)
  const crumb = (current: boolean) => cn(
    'flex items-center gap-1 rounded-control px-1.5 py-0.5 transition-colors',
    current ? 'font-medium text-fg' : 'text-fg-secondary hover:bg-hover hover:text-fg',
  )

  return (
    <nav aria-label="Path" className="flex min-w-0 flex-wrap items-center gap-1 text-xs">
      <button type="button" onClick={() => onNavigate('')} className={crumb(path === '')} aria-current={path === '' ? 'page' : undefined}>
        <Home className="size-3.5" />
        Root
      </button>
      {parts.map((part, i) => {
        const segmentPath = parts.slice(0, i + 1).join('/') + '/'
        const isLast = i === parts.length - 1
        return (
          <span key={segmentPath} className="flex items-center gap-1">
            <ChevronRight className="size-3.5 text-fg-faint" />
            <button type="button" onClick={() => onNavigate(segmentPath)} className={crumb(isLast)} aria-current={isLast ? 'page' : undefined}>
              {part}
            </button>
          </span>
        )
      })}
    </nav>
  )
}

function OverviewStrip({ overview, resourceType }: { overview: StorageOverview; resourceType: string }) {
  const iconSrc = resourceIconUrl(resourceType)
  const stats = [
    { label: 'Objects', value: overview.object_count.toLocaleString() },
    { label: 'Total size', value: formatBytes(overview.total_size_bytes) },
  ]

  return (
    <Card padding="none" className="mb-6 flex flex-wrap items-stretch divide-x divide-line">
      <div className="flex min-w-48 flex-1 items-center gap-3 px-5 py-4">
        {iconSrc && <img src={iconSrc} alt="" className="size-6" />}
        <div className="min-w-0">
          <div className="truncate text-sm font-medium text-fg">{overview.name}</div>
          <div className="text-xs text-fg-muted">{TYPE_LABELS[resourceType] || resourceType}</div>
        </div>
      </div>
      {stats.map(s => (
        <div key={s.label} className="min-w-28 flex-1 px-5 py-4">
          <div className="text-xs text-fg-muted">{s.label}</div>
          <div className="mt-1 text-xl font-semibold tracking-tight text-fg tabular-nums">{s.value}</div>
        </div>
      ))}
    </Card>
  )
}

export default function StorageObjectsView({ resourceName, resourceType, onViewObject, initialPath, workspaceName }: Props) {
  const [listing, setListing] = useState<StorageListResult | null>(null)
  const [overview, setOverview] = useState<StorageOverview | null>(null)
  const [currentPath, setCurrentPath] = useState(initialPath || '')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState('')

  const loadDirectory = useCallback((path: string, showRefresh?: boolean) => {
    if (showRefresh) setRefreshing(true)
    else setLoading(true)

    const listFn = workspaceName
      ? listServiceStorageObjects(workspaceName, resourceName, path || undefined)
      : adminListStorageDirectory(resourceName, path || undefined)

    listFn
      .then(lr => { setListing(lr); setError(null) })
      .catch(err => setError(err instanceof Error ? err.message : 'Failed to load storage data'))
      .finally(() => { setLoading(false); setRefreshing(false) })
  }, [resourceName, workspaceName])

  useEffect(() => {
    loadDirectory(initialPath || '')
    if (!workspaceName) {
      adminGetStorageOverview(resourceName).then(setOverview).catch(() => {})
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resourceName])

  function navigateTo(path: string) {
    setCurrentPath(path)
    setFilter('')
    loadDirectory(path)
  }

  const directories = listing?.directories || []
  const objects = listing?.objects || []
  const q = filter.trim().toLowerCase()

  const rows: Row[] = [
    ...directories.map(d => ({ id: `d:${d.path}`, name: d.name, isDir: true, path: d.path })),
    ...objects.map(o => ({ id: `o:${o.key}`, name: o.name, isDir: false, path: o.key, size: o.size, modified: o.last_modified })),
  ].filter(r => !q || r.name.toLowerCase().includes(q))

  const columns: Column<Row>[] = [
    {
      key: 'name',
      header: 'Name',
      // Folders stay grouped above files in either sort direction of the name column.
      sortValue: r => `${r.isDir ? 0 : 1}${r.name.toLowerCase()}`,
      render: r => (
        <span className="flex min-w-0 items-center gap-2.5">
          {r.isDir
            ? <Folder className="size-4 shrink-0 text-accent" />
            : <FileText className="size-4 shrink-0 text-fg-muted" />}
          <span className="truncate font-medium text-fg" title={r.path}>{r.name}</span>
        </span>
      ),
    },
    {
      key: 'size',
      header: 'Size',
      numeric: true,
      className: 'w-28',
      sortValue: r => r.size ?? -1,
      render: r => <span className="text-fg-secondary">{r.isDir ? '—' : formatBytes(r.size ?? 0)}</span>,
    },
    {
      key: 'modified',
      header: 'Modified',
      className: 'w-48',
      sortValue: r => r.modified || '',
      render: r => <span className="text-fg-secondary tabular-nums">{r.isDir ? '—' : formatDateTime(r.modified || '')}</span>,
    },
    {
      key: 'open',
      header: <span className="sr-only">Open</span>,
      className: 'w-10',
      render: () => <ChevronRight className="size-4 text-fg-faint" />,
    },
  ]

  return (
    <Page>
      <PageHeader
        eyebrow="Storage"
        title={resourceName}
        description={listing ? `${plural(directories.length, 'folder')} · ${plural(objects.length, 'file')}` : 'Loading…'}
        actions={
          <IconButton label="Refresh" size="md" onClick={() => loadDirectory(currentPath, true)} disabled={refreshing}>
            <RefreshCw className={cn('size-4', refreshing && 'animate-spin')} />
          </IconButton>
        }
      />

      {error && (
        <Alert tone="danger" title="Couldn't load storage" className="mb-6"
          action={<Button size="sm" variant="secondary" onClick={() => loadDirectory(currentPath, true)} loading={refreshing}>Retry</Button>}>
          {error}
        </Alert>
      )}

      {overview && <OverviewStrip overview={overview} resourceType={resourceType} />}

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Breadcrumbs path={currentPath} onNavigate={navigateTo} />
        <SearchInput value={filter} onChange={setFilter} placeholder="Filter this folder…" wrapperClassName="w-full sm:w-72" />
      </div>

      <DataTable
        columns={columns}
        data={rows}
        keyFn={r => r.id}
        onRowClick={r => (r.isDir ? navigateTo(r.path) : onViewObject(r.path, currentPath))}
        rowLabel={r => (r.isDir ? `Open folder ${r.name}` : `View ${r.name}`)}
        initialSort={{ key: 'name', dir: 'asc' }}
        loading={loading}
        empty={!error && (
          <EmptyState
            icon={<HardDrive />}
            compact
            title={q ? 'No matching items' : currentPath ? 'Empty folder' : 'No objects found'}
            description={q ? 'Try a different filter.' : currentPath ? 'This folder has no files.' : 'Check the storage connection and configuration.'}
            action={q ? <Button size="sm" variant="secondary" onClick={() => setFilter('')}>Clear filter</Button> : undefined}
          />
        )}
      />
    </Page>
  )
}
