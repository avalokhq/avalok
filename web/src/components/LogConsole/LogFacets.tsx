import { cn } from '../../lib/cn'
import { LOG_LEVELS } from '../../lib/parseLevel'
import { toneDot } from '../../lib/statusTone'
import type { LogEntry } from '../../lib/types'
import SourceDot from '../ui/SourceDot'
import Button from '../ui/Button'
import { LEVEL_META, type Facet, type LogViewState } from './useLogViewState'

const MAX_VALUES = 30

function FacetRow({ label, leading, count, active, onToggle }: {
  label: string
  leading: React.ReactNode
  count: number
  active: boolean
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={active}
      onClick={onToggle}
      title={label}
      className={cn(
        'flex h-7 w-full cursor-pointer items-center gap-2 rounded-control px-2 text-left text-xs transition-colors hover:bg-hover',
        active ? 'text-fg' : 'text-fg-faint line-through decoration-fg-faint/60',
      )}
    >
      <span className={cn('flex size-3.5 shrink-0 items-center justify-center', !active && 'opacity-40')}>{leading}</span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <span className="tabular-nums text-fg-muted">{count.toLocaleString()}</span>
    </button>
  )
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-0.5">
      <h3 className="px-2 pb-1 text-2xs font-medium uppercase tracking-wide text-fg-muted">{title}</h3>
      {children}
    </section>
  )
}

/** Level / source / instance facets with live counts, left of the full-page log. */
export default function LogFacets<T extends LogEntry>({ view }: { view: LogViewState<T> }) {
  const { counts, excluded, filtered, inRange } = view

  const facetValues = (facet: Facet) =>
    [...counts[facet].entries()].sort((a, b) => b[1] - a[1]).slice(0, MAX_VALUES)

  const renderFacet = (facet: Facet, title: string) => {
    const values = facetValues(facet)
    if (values.length < 2 && excluded[facet].size === 0) return null
    return (
      <Group title={title}>
        {values.map(([value, count]) => (
          <FacetRow
            key={value}
            label={value}
            leading={<SourceDot name={value} />}
            count={count}
            active={!excluded[facet].has(value)}
            onToggle={() => view.toggleFacet(facet, value)}
          />
        ))}
      </Group>
    )
  }

  return (
    <aside aria-label="Log filters" className="flex w-56 shrink-0 flex-col overflow-y-auto border-r border-line bg-surface">
      <div className="border-b border-line px-4 py-3">
        <div className="text-xs text-fg-muted">Showing</div>
        <div className="text-sm font-medium tabular-nums text-fg">
          {filtered.length.toLocaleString()} <span className="font-normal text-fg-muted">of {inRange.length.toLocaleString()}</span>
        </div>
        {view.filtersActive && (
          <Button variant="link" size="sm" className="mt-1 h-auto p-0 text-xs" onClick={view.resetFilters}>Reset filters</Button>
        )}
      </div>

      <div className="space-y-4 p-2">
        <Group title="Level">
          {LOG_LEVELS.map(l => (
            <FacetRow
              key={l}
              label={LEVEL_META[l].label}
              leading={<span className={cn('size-2 rounded-full', toneDot[LEVEL_META[l].tone])} />}
              count={counts.level.get(l) ?? 0}
              active={view.levels.has(l)}
              onToggle={() => view.toggleLevel(l)}
            />
          ))}
        </Group>
        {renderFacet('source', 'Source')}
        {renderFacet('instance', 'Instance')}
      </div>
    </aside>
  )
}
