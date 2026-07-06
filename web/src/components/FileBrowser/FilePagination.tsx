import { useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '../../lib/cn'

interface Props {
  page: number
  totalPages: number
  totalLines: number
  onPageChange: (page: number) => void
}

export default function FilePagination({ page, totalPages, totalLines, onPageChange }: Props) {
  const [jumpValue, setJumpValue] = useState('')

  function handleJump(e: React.FormEvent) {
    e.preventDefault()
    const n = parseInt(jumpValue, 10)
    if (n >= 1 && n <= totalPages) {
      onPageChange(n)
      setJumpValue('')
    }
  }

  return (
    <div className="flex items-center gap-3 px-3 py-1.5 border-t border-[var(--border-default)] bg-[var(--bg-surface)]">
      <button
        onClick={() => onPageChange(page - 1)}
        disabled={page <= 1}
        className={cn(
          'p-1 rounded transition-colors',
          page <= 1
            ? 'text-[var(--text-muted)] opacity-30 cursor-not-allowed'
            : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'
        )}
      >
        <ChevronLeft className="w-4 h-4" />
      </button>

      <span className="text-xs text-[var(--text-secondary)]">
        Page <span className="font-medium text-[var(--text-primary)]">{page}</span> of{' '}
        <span className="font-medium text-[var(--text-primary)]">{totalPages}</span>
      </span>

      <button
        onClick={() => onPageChange(page + 1)}
        disabled={page >= totalPages}
        className={cn(
          'p-1 rounded transition-colors',
          page >= totalPages
            ? 'text-[var(--text-muted)] opacity-30 cursor-not-allowed'
            : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'
        )}
      >
        <ChevronRight className="w-4 h-4" />
      </button>

      {totalPages > 2 && (
        <form onSubmit={handleJump} className="flex items-center gap-1.5 ml-2">
          <input
            type="number"
            min={1}
            max={totalPages}
            value={jumpValue}
            onChange={e => setJumpValue(e.target.value)}
            placeholder="Go to"
            className="w-16 px-1.5 py-0.5 text-xs rounded border border-[var(--border-default)] bg-[var(--bg-app)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--text-accent)]"
          />
          <button
            type="submit"
            className="text-[10px] px-1.5 py-0.5 rounded text-[var(--text-accent)] hover:bg-[var(--bg-active)] transition-colors"
          >
            Go
          </button>
        </form>
      )}

      <span className="ml-auto text-[10px] text-[var(--text-muted)]">
        {totalLines.toLocaleString()} lines total
      </span>
    </div>
  )
}
