import { useState } from 'react'
import { FileText, FileArchive, FolderOpen } from 'lucide-react'
import { formatBytes, formatDateTime } from '../../lib/format'
import type { LogFile } from '../../lib/types'
import DataTable, { type Column } from '../ui/DataTable'
import EmptyState from '../ui/EmptyState'
import Badge from '../ui/Badge'
import Button from '../ui/Button'
import { SearchInput } from '../ui/Input'

interface Props {
  files: LogFile[]
  logDir: string
  selected: string | null
  onSelect: (name: string) => void
}

const columns: Column<LogFile>[] = [
  {
    key: 'name',
    header: 'Name',
    sortValue: f => f.name.toLowerCase(),
    render: f => (
      <span className="flex min-w-0 items-center gap-2">
        {f.is_compressed
          ? <FileArchive className="size-4 shrink-0 text-warning" />
          : <FileText className="size-4 shrink-0 text-fg-muted" />}
        <span className="truncate font-medium text-fg" title={f.name}>{f.name}</span>
        {f.is_compressed && f.compression && <Badge tone="warning" size="sm" className="shrink-0">{f.compression}</Badge>}
      </span>
    ),
  },
  {
    key: 'size',
    header: 'Size',
    numeric: true,
    className: 'w-20 whitespace-nowrap',
    sortValue: f => f.size,
    render: f => <span className="text-fg-secondary">{formatBytes(f.size)}</span>,
  },
  {
    key: 'modified',
    header: 'Modified',
    className: 'whitespace-nowrap',
    sortValue: f => new Date(f.mod_time).getTime() || 0,
    render: f => <span className="text-fg-secondary tabular-nums">{formatDateTime(f.mod_time)}</span>,
  },
]

export default function FileList({ files, logDir, selected, onSelect }: Props) {
  const [filter, setFilter] = useState('')

  const q = filter.trim().toLowerCase()
  const filtered = q ? files.filter(f => f.name.toLowerCase().includes(q)) : files

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-col gap-2 border-b border-line px-3 py-2.5">
        <div className="flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate font-mono text-xs text-fg-muted" title={logDir}>{logDir}</span>
          <span className="shrink-0 text-2xs text-fg-muted tabular-nums">
            {q ? `${filtered.length} of ${files.length}` : files.length} {files.length === 1 ? 'file' : 'files'}
          </span>
        </div>
        <SearchInput value={filter} onChange={setFilter} placeholder="Filter files…" aria-label="Filter files" />
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-3">
        <DataTable
          columns={columns}
          data={filtered}
          keyFn={f => f.name}
          density="compact"
          stickyHeader
          // Newest first, like the previous default.
          initialSort={{ key: 'modified', dir: 'desc' }}
          onRowClick={f => onSelect(f.name)}
          rowLabel={f => `View ${f.name}`}
          isRowSelected={f => f.name === selected}
          empty={
            q ? (
              <EmptyState
                compact
                tone="neutral"
                icon={<FileText />}
                title="No matching files"
                description={`Nothing matches "${filter.trim()}".`}
                action={<Button size="sm" variant="secondary" onClick={() => setFilter('')}>Clear filter</Button>}
              />
            ) : (
              <EmptyState compact tone="neutral" icon={<FolderOpen />} title="Empty folder" description="This log directory has no files." />
            )
          }
        />
      </div>
    </div>
  )
}
