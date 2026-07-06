import { useState } from 'react'
import { FileText, FileArchive, ArrowUpDown, Search, X } from 'lucide-react'
import { cn } from '../../lib/cn'
import type { LogFile } from '../../lib/types'

interface Props {
  files: LogFile[]
  logDir: string
  selected: string | null
  onSelect: (name: string) => void
}

type SortKey = 'name' | 'size' | 'date'
type SortDir = 'asc' | 'desc'

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const diff = now.getTime() - d.getTime()
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days}d ago`
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export default function FileList({ files, logDir, selected, onSelect }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>('date')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [filterOpen, setFilterOpen] = useState(false)
  const [filter, setFilter] = useState('')

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir(key === 'name' ? 'asc' : 'desc')
    }
  }

  const filtered = filter
    ? files.filter(f => f.name.toLowerCase().includes(filter.toLowerCase()))
    : files

  const sorted = [...filtered].sort((a, b) => {
    let cmp = 0
    switch (sortKey) {
      case 'name': cmp = a.name.localeCompare(b.name); break
      case 'size': cmp = a.size - b.size; break
      case 'date': cmp = new Date(a.mod_time).getTime() - new Date(b.mod_time).getTime(); break
    }
    return sortDir === 'asc' ? cmp : -cmp
  })

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2 border-b border-[var(--border-default)]">
        <div className="flex items-center gap-1.5">
          <div className="text-xs text-[var(--text-muted)] truncate flex-1" title={logDir}>
            {logDir}
          </div>
          <button
            onClick={() => { setFilterOpen(v => !v); if (filterOpen) setFilter('') }}
            className={cn(
              'p-1 rounded transition-colors shrink-0',
              filterOpen
                ? 'text-[var(--text-accent)] bg-[var(--bg-active)]'
                : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
            )}
            title="Filter files"
          >
            <Search className="w-3 h-3" />
          </button>
        </div>

        {filterOpen && (
          <div className="relative mt-1.5">
            <input
              type="text"
              value={filter}
              onChange={e => setFilter(e.target.value)}
              placeholder="Filter files..."
              autoFocus
              className="w-full pl-2 pr-6 py-1 text-xs rounded border border-[var(--border-default)] bg-[var(--bg-app)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--text-accent)]"
            />
            {filter && (
              <button
                onClick={() => setFilter('')}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        )}

        <div className="flex items-center gap-2 mt-1.5">
          {(['name', 'size', 'date'] as SortKey[]).map(key => (
            <button
              key={key}
              onClick={() => toggleSort(key)}
              className={cn(
                'text-[10px] px-1.5 py-0.5 rounded transition-colors flex items-center gap-0.5',
                sortKey === key
                  ? 'text-[var(--text-accent)] bg-[var(--bg-active)]'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
              )}
            >
              {key}
              {sortKey === key && (
                <ArrowUpDown className="w-2.5 h-2.5" />
              )}
            </button>
          ))}
          <span className="ml-auto text-[10px] text-[var(--text-muted)]">
            {filter ? `${filtered.length}/${files.length}` : `${files.length}`} files
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {sorted.map(file => (
          <button
            key={file.name}
            onClick={() => onSelect(file.name)}
            className={cn(
              'w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors border-l-2',
              selected === file.name
                ? 'bg-[var(--bg-active)] border-l-[var(--text-accent)]'
                : 'border-l-transparent hover:bg-[var(--bg-hover)]'
            )}
          >
            {file.is_compressed ? (
              <FileArchive className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            ) : (
              <FileText className="w-3.5 h-3.5 text-[var(--text-muted)] shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium text-[var(--text-primary)] truncate">
                {file.name}
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-[10px] text-[var(--text-muted)]">
                  {formatSize(file.size)}
                </span>
                <span className="text-[10px] text-[var(--text-muted)]">
                  {formatDate(file.mod_time)}
                </span>
                {file.is_compressed && (
                  <span className="text-[10px] px-1 rounded bg-amber-500/10 text-amber-400">
                    {file.compression}
                  </span>
                )}
              </div>
            </div>
          </button>
        ))}
        {sorted.length === 0 && filter && (
          <div className="text-center py-6 text-xs text-[var(--text-muted)]">
            No files matching "{filter}"
          </div>
        )}
      </div>
    </div>
  )
}
