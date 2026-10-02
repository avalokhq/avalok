import { useEffect, useRef, useState } from 'react'
import { ChevronRight, SearchX } from 'lucide-react'
import { cn } from '../../lib/cn'
import { useLayoutToggle } from '../../lib/useLayoutToggle'
import Button from './Button'
import CollectionGrid from './CollectionGrid'
import DataTable, { type Column } from './DataTable'
import EmptyState from './EmptyState'
import EntityCard, { TileStatus } from './EntityCard'
import { entityStyle, type EntityKind } from './EntityIcon'
import { ActionMenu, type MenuItem } from './Dropdown'
import { SearchInput } from './Input'
import LayoutToggle from './LayoutToggle'
import Skeleton from './Skeleton'
import type { DotStatus } from './StatusDot'


type Per<T, R> = (item: T) => R

export interface EntityCollectionProps<T> {
  items: T[]
  keyFn: Per<T, string>
  /** Entity kind: drives tile color, icon and the uppercase label. */
  kind: EntityKind | Per<T, EntityKind>
  /** Overrides the uppercase kind label (e.g. "Namespace", "Deployment"). */
  kindLabel?: Per<T, string | undefined>
  name: Per<T, string>
  description?: Per<T, string | undefined>
  /** Icon inside the tile (defaults to the kind icon), e.g. a ProviderIcon. */
  icon?: Per<T, React.ReactNode>
  status?: Per<T, { status: DotStatus; label: string } | undefined>
  badges?: Per<T, React.ReactNode>
  /** Counts / provider etc. Table: right-aligned details column. Grid: card footer. */
  meta?: Per<T, React.ReactNode>
  metaHeader?: string
  /** Extra table-only columns, placed between Name and Details. */
  columns?: Column<T>[]
  /** Strings matched by the filter box (defaults to name + description). */
  searchText?: Per<T, (string | null | undefined)[]>
  searchPlaceholder?: string
  /** Call-to-action shown on cards and used for row labels, e.g. "Open", "View logs". */
  actionLabel?: string | Per<T, string>
  onOpen?: Per<T, (() => void) | undefined>
  menuItems?: Per<T, MenuItem[] | undefined>
  /** Key of the item that is mid-mutation (dimmed). */
  busyKey?: string | null
  /** localStorage key remembering list/grid choice. */
  layoutKey: string
  defaultLayout?: 'list' | 'grid'
  loading?: boolean
  /** Shown when there are no items at all. */
  empty: React.ReactNode
  /** Extra filter controls (chips) next to the search box. */
  filters?: React.ReactNode
  /** Extra predicate applied with the search (e.g. chip selection). */
  filter?: Per<T, boolean>
  /** True when `filter` is narrowing the list; "Clear filters" also calls `onClearFilters`. */
  filterActive?: boolean
  onClearFilters?: () => void
  /** Noun used in the "no matches" message, e.g. "services". */
  noun?: string
  className?: string
}

/**
 * The one list pattern for entities: filter box + layout toggle, then a DataTable (list) or EntityCard grid.
 * Every entity page (dashboard, manage pages, drill-downs) renders through this so they look and behave the same.
 */
export default function EntityCollection<T>({
  items, keyFn, kind, kindLabel, name, description, icon, status, badges, meta, metaHeader = 'Details', columns = [],
  searchText, searchPlaceholder = 'Filter by name or description…', actionLabel = 'Open', onOpen, menuItems, busyKey,
  layoutKey, defaultLayout, loading, empty, filters, filter, filterActive, onClearFilters, noun = 'items', className,
}: EntityCollectionProps<T>) {
  const { layout, changeLayout } = useLayoutToggle(layoutKey, defaultLayout)
  const [query, setQuery] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)

  // "/" focuses the filter box (unless typing somewhere already)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return
      if ((e.target as HTMLElement).closest?.('input, textarea, select, [contenteditable="true"]')) return
      e.preventDefault()
      searchRef.current?.focus()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const kindOf = (item: T) => (typeof kind === 'function' ? kind(item) : kind)
  const labelOf = (item: T) => (typeof actionLabel === 'function' ? actionLabel(item) : actionLabel)

  const q = query.trim().toLowerCase()
  const visible = items.filter(item => {
    if (filter && !filter(item)) return false
    if (!q) return true
    const fields = searchText ? searchText(item) : [name(item), description?.(item)]
    return fields.some(s => s?.toLowerCase().includes(q))
  })
  const filtering = q !== '' || !!filterActive

  function clearFilters() {
    setQuery('')
    onClearFilters?.()
  }

  const hasMenus = !!menuItems && items.some(item => (menuItems(item)?.length ?? 0) > 0)

  function renderTile(item: T) {
    const style = entityStyle(kindOf(item))
    const Icon = style.Icon
    const st = status?.(item)
    return (
      <div className={cn('relative flex size-8 shrink-0 items-center justify-center rounded-control [&_img]:size-4 [&_svg]:size-4', style.bg, style.color)}>
        {icon?.(item) ?? <Icon />}
        {st && <TileStatus {...st} />}
      </div>
    )
  }

  const tableColumns: Column<T>[] = [
    {
      key: 'name',
      header: 'Name',
      sortValue: name,
      render: item => {
        const desc = description?.(item)
        return (
          <div className="flex items-center gap-3">
            {renderTile(item)}
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="truncate font-medium text-fg transition-colors group-hover:text-accent">{name(item)}</span>
                {badges?.(item)}
              </div>
              {desc && <div className="mt-0.5 line-clamp-1 text-xs text-fg-muted">{desc}</div>}
            </div>
          </div>
        )
      },
    },
    ...columns,
    ...(meta ? [{
      key: 'meta',
      header: metaHeader,
      align: 'right' as const,
      render: (item: T) => <div className="flex items-center justify-end gap-3 text-xs text-fg-secondary">{meta(item)}</div>,
    }] : []),
    ...(hasMenus ? [{
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      className: 'w-12',
      render: (item: T) => {
        const m = menuItems!(item)
        return m && m.length > 0 ? <ActionMenu items={m} label={`Actions for ${name(item)}`} /> : null
      },
    }] : []),
    ...(onOpen ? [{
      key: 'open',
      header: <span className="sr-only">Open</span>,
      className: 'w-10',
      render: (item: T) => onOpen(item)
        ? <ChevronRight className="size-4 text-fg-faint transition-[color,transform] duration-150 group-hover:translate-x-0.5 group-hover:text-accent" />
        : null,
    }] : []),
  ]

  if (loading) {
    return layout === 'list'
      ? <DataTable columns={tableColumns} data={[]} keyFn={keyFn} loading className={className} />
      : <CollectionGrid className={className}>{[0, 1, 2, 3, 4, 5].map(i => <Skeleton.Card key={i} />)}</CollectionGrid>
  }

  if (items.length === 0) return <div className={className}>{empty}</div>

  const noMatches = (
    <EmptyState
      compact
      tone="neutral"
      icon={<SearchX />}
      title="No matches"
      description={q ? <>Nothing matches &ldquo;{query.trim()}&rdquo;.</> : `No ${noun} match the current filters.`}
      action={<Button variant="secondary" size="sm" onClick={clearFilters}>Clear filters</Button>}
    />
  )

  return (
    <div className={className}>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <SearchInput
          ref={searchRef}
          value={query}
          onChange={setQuery}
          shortcut="/"
          placeholder={searchPlaceholder}
          aria-label={`Filter ${noun}`}
          wrapperClassName="w-full sm:w-80"
        />
        {filters && <div role="group" aria-label="Filters" className="flex flex-wrap items-center gap-1.5">{filters}</div>}
        <div className="ml-auto flex items-center gap-3">
          {filtering && (
            <span aria-live="polite" className="text-xs tabular-nums text-fg-muted">
              {visible.length} of {items.length}
            </span>
          )}
          <LayoutToggle layout={layout} onChange={changeLayout} />
        </div>
      </div>

      {layout === 'list' ? (
        <DataTable
          columns={tableColumns}
          data={visible}
          keyFn={keyFn}
          onRowClick={onOpen ? item => onOpen(item)?.() : undefined}
          rowLabel={item => `${labelOf(item)} ${name(item)}`}
          empty={noMatches}
        />
      ) : visible.length === 0 ? (
        <div className="rounded-card border border-dashed border-line">{noMatches}</div>
      ) : (
        <CollectionGrid>
          {visible.map((item, i) => (
            <EntityCard
              key={keyFn(item)}
              index={i}
              kind={kindOf(item)}
              kindLabel={kindLabel?.(item)}
              name={name(item)}
              description={description?.(item)}
              icon={icon?.(item)}
              status={status?.(item)}
              badges={badges?.(item)}
              meta={meta?.(item)}
              actionLabel={labelOf(item)}
              onOpen={onOpen?.(item)}
              menuItems={menuItems?.(item)}
              busy={busyKey === keyFn(item)}
            />
          ))}
        </CollectionGrid>
      )}
    </div>
  )
}
