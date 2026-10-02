import {
  Pause, Play, Trash2, ChevronsDown, WrapText, Hash, Columns3, ArrowDownToLine, ALargeSmall, PanelLeft,
} from 'lucide-react'
import { LOG_LEVELS } from '../../lib/parseLevel'
import type { LogViewMode } from '../../lib/api'
import type { LogEntry } from '../../lib/types'
import { SearchInput } from '../ui/Input'
import IconButton from '../ui/IconButton'
import FilterChip from '../ui/FilterChip'
import SegmentedControl, { type Segment } from '../ui/SegmentedControl'
import Dropdown from '../ui/Dropdown'
import TimeFilter from './TimeFilter'
import { FONT_SIZES, LEVEL_META, type LogViewState } from './useLogViewState'

interface Props<T extends LogEntry> {
  view: LogViewState<T>
  paused: boolean
  onTogglePause: () => void
  onClear: () => void
  onExport: () => void
  viewMode?: LogViewMode
  onViewModeChange?: (mode: LogViewMode) => void
  hasFileMode?: boolean
  /** Shows the facet sidebar toggle (full-page console). */
  facetsOpen?: boolean
  onToggleFacets?: () => void
  /** Narrow panes: hide level counts and the line counter. */
  compact?: boolean
}

function Divider() {
  return <span aria-hidden className="h-5 w-px shrink-0 bg-line" />
}

export default function LogToolbar<T extends LogEntry>({
  view, paused, onTogglePause, onClear, onExport, viewMode, onViewModeChange, hasFileMode,
  facetsOpen, onToggleFacets, compact,
}: Props<T>) {
  const { filtered, total, counts } = view

  const modes: Segment<LogViewMode>[] = [
    { value: 'stream', label: 'Stream', title: 'Stream history, then follow new lines' },
    ...(hasFileMode ? [{ value: 'file' as const, label: 'File', title: 'Load the whole file over HTTP (faster for large static files)' }] : []),
    { value: 'live', label: 'Live', title: 'Skip history, show only new lines' },
  ]

  return (
    <div role="toolbar" aria-label="Log controls" className="flex shrink-0 flex-wrap items-center gap-x-2 gap-y-1.5 border-b border-line bg-surface px-3 py-1.5">
      {/* Search */}
      {onToggleFacets && (
        <IconButton label={facetsOpen ? 'Hide filters' : 'Show filters'} active={facetsOpen} onClick={onToggleFacets}>
          <PanelLeft className="size-4" />
        </IconButton>
      )}
      <SearchInput
        value={view.search}
        onChange={view.setSearch}
        placeholder="Search logs…"
        wrapperClassName="min-w-40 flex-1 basis-40 max-w-xs"
      />

      <Divider />

      {/* Time range */}
      {onViewModeChange && viewMode && (
        <SegmentedControl size="sm" label="Stream mode" options={modes} value={viewMode} onChange={onViewModeChange} />
      )}
      <TimeFilter value={view.timeFilter} onChange={view.setTimeFilter} />

      {/* Levels (the full console also has them in the facet sidebar) */}
      {!facetsOpen && (
        <>
          <Divider />
          <div className="flex items-center gap-1" role="group" aria-label="Log levels">
            {LOG_LEVELS.map(l => (
              <FilterChip
                key={l}
                label={LEVEL_META[l].label}
                tone={LEVEL_META[l].tone}
                count={compact ? undefined : counts.level.get(l) ?? 0}
                active={view.levels.has(l)}
                onToggle={() => view.toggleLevel(l)}
              />
            ))}
          </div>
        </>
      )}

      <Divider />

      {/* View */}
      <div className="flex items-center gap-0.5">
        <IconButton label={view.wrap ? 'Wrap on' : 'Wrap off'} active={view.wrap} onClick={view.toggleWrap}>
          <WrapText className="size-4" />
        </IconButton>
        {viewMode !== 'file' && (
          <IconButton
            label={view.relativeLineNumbers ? 'Line numbers relative to live start' : 'Sequential line numbers'}
            active={view.relativeLineNumbers}
            onClick={view.toggleRelativeLineNumbers}
          >
            <Hash className="size-4" />
          </IconButton>
        )}
        <Dropdown
          width={160}
          trigger={<IconButton label="Text size"><ALargeSmall className="size-4" /></IconButton>}
          items={FONT_SIZES.map(s => ({ label: `${s}px`, checked: s === view.fontSize, onClick: () => view.setFontSize(s) }))}
        />
        <Dropdown
          width={180}
          trigger={<IconButton label="Columns"><Columns3 className="size-4" /></IconButton>}
          items={[
            { label: 'Time', checked: view.columns.has('timestamp'), onClick: () => view.toggleColumn('timestamp') },
            { label: 'Level', checked: view.columns.has('level'), onClick: () => view.toggleColumn('level') },
            { label: 'Source', checked: view.columns.has('source'), onClick: () => view.toggleColumn('source') },
          ]}
        />
      </div>

      {/* Right: count + stream controls */}
      <div className="ml-auto flex items-center gap-0.5">
        {!compact && (
          <span className="mr-2 text-xs tabular-nums text-fg-muted">
            {filtered.length === total ? `${total.toLocaleString()} lines` : `${filtered.length.toLocaleString()} of ${total.toLocaleString()}`}
          </span>
        )}
        <IconButton label={view.follow ? 'Following new lines' : 'Follow new lines'} active={view.follow} onClick={() => (view.follow ? view.setFollow(false) : view.scrollToBottom())}>
          <ChevronsDown className="size-4" />
        </IconButton>
        {viewMode !== 'file' && (
          <IconButton label={paused ? 'Resume stream' : 'Pause stream'} active={paused} onClick={onTogglePause}>
            {paused ? <Play className="size-4" /> : <Pause className="size-4" />}
          </IconButton>
        )}
        <IconButton label="Export visible lines" onClick={onExport}>
          <ArrowDownToLine className="size-4" />
        </IconButton>
        <IconButton label="Clear" variant="danger" onClick={onClear}>
          <Trash2 className="size-4" />
        </IconButton>
      </div>
    </div>
  )
}
