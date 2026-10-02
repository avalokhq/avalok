import { useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, ChevronsUpDown, Inbox } from 'lucide-react'
import { cn } from '../../lib/cn'
import Alert from './Alert'
import Button from './Button'
import EmptyState from './EmptyState'
import Skeleton from './Skeleton'

export interface Column<T> {
  key: string
  header: React.ReactNode
  className?: string
  align?: 'left' | 'right' | 'center'
  /** Right-aligned, tabular figures. */
  numeric?: boolean
  /** Enables header sorting on this column. */
  sortValue?: (row: T) => string | number | null | undefined
  render: (row: T, index: number) => React.ReactNode
}

interface DataTableProps<T> {
  columns: Column<T>[]
  data: T[]
  keyFn: (row: T) => string
  onRowClick?: (row: T) => void
  /** Accessible label for a clickable row (defaults to "Open"). */
  rowLabel?: (row: T) => string
  isRowSelected?: (row: T) => boolean
  density?: 'comfortable' | 'compact'
  loading?: boolean
  error?: string | null
  onRetry?: () => void
  /** Shown when data is empty (and not loading/error). */
  empty?: React.ReactNode
  /** Sticky header for tables inside a scroll container. */
  stickyHeader?: boolean
  initialSort?: { key: string; dir: 'asc' | 'desc' }
  className?: string
}

function alignClass(col: Column<unknown>) {
  if (col.numeric || col.align === 'right') return 'text-right'
  if (col.align === 'center') return 'text-center'
  return 'text-left'
}

export default function DataTable<T>({
  columns,
  data,
  keyFn,
  onRowClick,
  rowLabel,
  isRowSelected,
  density = 'comfortable',
  loading,
  error,
  onRetry,
  empty,
  stickyHeader,
  initialSort,
  className,
}: DataTableProps<T>) {
  const [sort, setSort] = useState(initialSort ?? null)

  const rows = useMemo(() => {
    if (!sort) return data
    const col = columns.find(c => c.key === sort.key)
    if (!col?.sortValue) return data
    const get = col.sortValue
    const sign = sort.dir === 'asc' ? 1 : -1
    return [...data].sort((a, b) => {
      const va = get(a)
      const vb = get(b)
      if (va == null && vb == null) return 0
      if (va == null) return 1
      if (vb == null) return -1
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * sign
      return String(va).localeCompare(String(vb), undefined, { numeric: true, sensitivity: 'base' }) * sign
    })
  }, [data, sort, columns])

  function toggleSort(key: string) {
    setSort(s => (s?.key !== key ? { key, dir: 'asc' } : s.dir === 'asc' ? { key, dir: 'desc' } : null))
  }

  const cellPad = density === 'compact' ? 'px-3 py-1.5' : 'px-4 py-3'

  if (error) {
    return (
      <Alert
        tone="danger"
        title="Couldn't load this list"
        action={onRetry && <Button size="sm" variant="secondary" onClick={onRetry}>Retry</Button>}
        className={className}
      >
        {error}
      </Alert>
    )
  }

  const showEmpty = !loading && rows.length === 0

  return (
    // overflow-clip (not hidden) keeps the rounded corners without becoming a scroll container,
    // so a sticky header still sticks to the page's scroller.
    <div className={cn('overflow-clip rounded-card border border-line bg-surface shadow-sm', className)}>
      <div className={cn(!stickyHeader && 'overflow-x-auto')}>
        <table className="w-full border-collapse text-sm">
          <thead className={cn(stickyHeader && 'sticky top-0 z-10')}>
            <tr className="bg-surface-sunken">
              {columns.map(col => {
                const sorted = sort?.key === col.key ? sort.dir : null
                return (
                  <th
                    key={col.key}
                    scope="col"
                    aria-sort={sorted === 'asc' ? 'ascending' : sorted === 'desc' ? 'descending' : undefined}
                    className={cn(
                      'whitespace-nowrap text-2xs font-semibold uppercase tracking-wider text-fg-muted',
                      density === 'compact' ? 'px-3 py-2' : 'px-4 py-2.5',
                      alignClass(col as Column<unknown>),
                      col.className,
                    )}
                  >
                    {col.sortValue ? (
                      <button
                        type="button"
                        onClick={() => toggleSort(col.key)}
                        className={cn(
                          'inline-flex cursor-pointer items-center gap-1 rounded-control uppercase tracking-wider transition-colors hover:text-fg',
                          sorted && 'text-fg',
                        )}
                      >
                        {col.header}
                        {sorted === 'asc' ? <ArrowUp className="size-3" /> : sorted === 'desc' ? <ArrowDown className="size-3" /> : <ChevronsUpDown className="size-3 opacity-50" />}
                      </button>
                    ) : col.header}
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {loading && rows.length === 0 ? (
              <Skeleton.TableRows columns={columns.length} />
            ) : (
              rows.map((row, i) => {
                const selected = isRowSelected?.(row)
                return (
                  <tr
                    key={keyFn(row)}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                    onKeyDown={onRowClick ? e => {
                      if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
                        e.preventDefault()
                        onRowClick(row)
                      }
                    } : undefined}
                    tabIndex={onRowClick ? 0 : undefined}
                    aria-label={onRowClick ? rowLabel?.(row) : undefined}
                    aria-selected={selected || undefined}
                    className={cn(
                      'border-t border-line',
                      selected && 'bg-selected',
                      onRowClick && 'cursor-pointer transition-colors hover:bg-hover focus-visible:bg-hover focus-visible:-outline-offset-2',
                    )}
                  >
                    {columns.map(col => (
                      <td
                        key={col.key}
                        className={cn(
                          cellPad,
                          'text-fg align-middle',
                          alignClass(col as Column<unknown>),
                          col.numeric && 'tabular-nums',
                          col.className,
                        )}
                      >
                        {col.render(row, i)}
                      </td>
                    ))}
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
      {showEmpty && (
        <div className="border-t border-line">
          {empty ?? <EmptyState compact tone="neutral" icon={<Inbox />} title="Nothing here yet" />}
        </div>
      )}
    </div>
  )
}
