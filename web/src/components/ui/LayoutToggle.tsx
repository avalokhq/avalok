import { LayoutGrid, LayoutList } from 'lucide-react'
import { cn } from '../../lib/cn'

interface Props {
  layout: 'list' | 'grid'
  onChange: (l: 'list' | 'grid') => void
}

export default function LayoutToggle({ layout, onChange }: Props) {
  return (
    <div className="flex items-center bg-[var(--bg-elevated)] rounded-lg p-0.5 border border-[var(--border-subtle)]">
      <button
        onClick={() => onChange('list')}
        className={cn(
          'p-1.5 rounded-md transition-all',
          layout === 'list'
            ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-sm'
            : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
        )}
        title="List view"
      >
        <LayoutList className="w-4 h-4" />
      </button>
      <button
        onClick={() => onChange('grid')}
        className={cn(
          'p-1.5 rounded-md transition-all',
          layout === 'grid'
            ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-sm'
            : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
        )}
        title="Grid view"
      >
        <LayoutGrid className="w-4 h-4" />
      </button>
    </div>
  )
}
