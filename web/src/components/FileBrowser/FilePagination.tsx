import { useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import Button from '../ui/Button'
import IconButton from '../ui/IconButton'
import Input from '../ui/Input'

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
    <div className="flex shrink-0 items-center gap-2 border-t border-line bg-surface px-3 py-1.5">
      <IconButton label="Previous page" onClick={() => onPageChange(page - 1)} disabled={page <= 1}>
        <ChevronLeft className="size-4" />
      </IconButton>

      <span className="text-xs text-fg-secondary tabular-nums">
        Page <span className="font-medium text-fg">{page.toLocaleString()}</span> of{' '}
        <span className="font-medium text-fg">{totalPages.toLocaleString()}</span>
      </span>

      <IconButton label="Next page" onClick={() => onPageChange(page + 1)} disabled={page >= totalPages}>
        <ChevronRight className="size-4" />
      </IconButton>

      {totalPages > 2 && (
        <form onSubmit={handleJump} className="ml-2 flex items-center gap-2">
          <Input
            type="number"
            min={1}
            max={totalPages}
            value={jumpValue}
            onChange={e => setJumpValue(e.target.value)}
            placeholder="Go to"
            aria-label="Go to page"
            className="w-20 tabular-nums"
          />
          <Button type="submit" size="sm" variant="secondary" disabled={!jumpValue}>Go</Button>
        </form>
      )}

      <span className="ml-auto text-xs text-fg-muted tabular-nums">
        {totalLines.toLocaleString()} lines total
      </span>
    </div>
  )
}
