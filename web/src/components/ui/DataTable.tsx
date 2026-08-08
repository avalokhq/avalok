import { cn } from '../../lib/cn'

interface Column<T> {
  key: string
  header: string
  className?: string
  align?: 'left' | 'right' | 'center'
  render: (row: T, index: number) => React.ReactNode
}

interface DataTableProps<T> {
  columns: Column<T>[]
  data: T[]
  keyFn: (row: T) => string
  onRowClick?: (row: T) => void
  className?: string
}

export default function DataTable<T>({ columns, data, keyFn, onRowClick, className }: DataTableProps<T>) {
  return (
    <div className={cn('border border-[var(--border-default)] rounded-xl overflow-hidden', className)}>
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-[var(--bg-elevated)]">
            {columns.map(col => (
              <th key={col.key} className={cn(
                'px-4 py-2.5 text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wider',
                col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left',
                col.className,
              )}>
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, i) => (
            <tr
              key={keyFn(row)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={cn(
                'border-t border-[var(--border-subtle)]',
                onRowClick && 'cursor-pointer hover:bg-[var(--bg-hover)] transition-colors',
              )}
            >
              {columns.map(col => (
                <td key={col.key} className={cn(
                  'px-4 py-3',
                  col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : '',
                  col.className,
                )}>
                  {col.render(row, i)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
