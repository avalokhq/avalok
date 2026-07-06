import {
  Search,
  Pause,
  Play,
  Trash2,
  ArrowDown,
  X,
  Minus,
  Plus,
  ChevronsDown,
} from 'lucide-react'
import { cn } from '../../lib/cn'
import TimeFilter, { type TimeFilterValue } from './TimeFilter'

interface Props {
  search: string
  onSearchChange: (v: string) => void
  paused: boolean
  onTogglePause: () => void
  onClear: () => void
  onScrollToBottom: () => void
  lineCount: number
  totalCount: number
  follow: boolean
  onToggleFollow: () => void
  levelFilter: Set<string>
  onToggleLevel: (level: string) => void
  fontSize: number
  onFontSizeChange: (size: number) => void
  timeFilter?: TimeFilterValue
  onTimeFilterChange?: (v: TimeFilterValue) => void
}

const LEVELS = [
  { key: 'error', label: 'Error', color: 'bg-red-500' },
  { key: 'warn', label: 'Warn', color: 'bg-amber-500' },
  { key: 'info', label: 'Info', color: 'bg-blue-500' },
  { key: 'debug', label: 'Debug', color: 'bg-chrome-500' },
]

const FONT_SIZES = [10, 12, 14, 16, 18]

export default function LogToolbar({
  search, onSearchChange, paused, onTogglePause, onClear, onScrollToBottom,
  lineCount, totalCount, follow, onToggleFollow, levelFilter, onToggleLevel,
  fontSize, onFontSizeChange, timeFilter, onTimeFilterChange,
}: Props) {
  const sizeIdx = FONT_SIZES.indexOf(fontSize)
  const canDecrease = sizeIdx > 0
  const canIncrease = sizeIdx < FONT_SIZES.length - 1

  return (
    <div className="flex items-center gap-2 px-3 h-10 shrink-0 border-b border-[var(--border-default)] bg-[var(--bg-surface)]">
      {/* Search */}
      <div className="relative flex-1 max-w-xs">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--text-muted)]" />
        <input
          type="text"
          value={search}
          onChange={e => onSearchChange(e.target.value)}
          placeholder="Search logs..."
          className="w-full pl-8 pr-7 py-1 rounded-md bg-[var(--bg-elevated)] border border-[var(--border-default)] text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--text-accent)] transition-colors"
        />
        {search && (
          <button
            onClick={() => onSearchChange('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
          >
            <X className="w-3 h-3" />
          </button>
        )}
      </div>

      {/* Level filters */}
      <div className="flex items-center gap-0.5 border-l border-[var(--border-default)] pl-2 ml-1">
        {LEVELS.map(l => {
          const active = levelFilter.has(l.key)
          return (
            <button
              key={l.key}
              onClick={() => onToggleLevel(l.key)}
              className={cn(
                'flex items-center gap-1 px-2 py-0.5 rounded text-xs transition-colors',
                active
                  ? 'bg-[var(--bg-active)] text-[var(--text-primary)]'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
              )}
              title={`${active ? 'Hide' : 'Show'} ${l.label} logs`}
            >
              <span className={cn('w-1.5 h-1.5 rounded-full', active ? l.color : 'bg-chrome-700')} />
              {l.label}
            </button>
          )
        })}
      </div>

      {/* Time filter */}
      {onTimeFilterChange && (
        <div className="border-l border-[var(--border-default)] pl-2 ml-1">
          <TimeFilter value={timeFilter ?? { source: 'live' }} onChange={onTimeFilterChange} />
        </div>
      )}

      <div className="flex-1" />

      {/* Font size */}
      <div className="flex items-center gap-0.5 border-l border-[var(--border-default)] pl-2">
        <button
          onClick={() => canDecrease && onFontSizeChange(FONT_SIZES[sizeIdx - 1])}
          disabled={!canDecrease}
          className={cn(
            'p-1 rounded-md transition-colors',
            canDecrease
              ? 'text-accent-400 hover:text-accent-300 hover:bg-accent-500/10'
              : 'text-[var(--text-muted)] opacity-30 cursor-not-allowed'
          )}
          title="Decrease font size"
        >
          <Minus className="w-3 h-3" />
        </button>
        <span className="text-[10px] text-[var(--text-muted)] tabular-nums w-5 text-center">{fontSize}</span>
        <button
          onClick={() => canIncrease && onFontSizeChange(FONT_SIZES[sizeIdx + 1])}
          disabled={!canIncrease}
          className={cn(
            'p-1 rounded-md transition-colors',
            canIncrease
              ? 'text-accent-400 hover:text-accent-300 hover:bg-accent-500/10'
              : 'text-[var(--text-muted)] opacity-30 cursor-not-allowed'
          )}
          title="Increase font size"
        >
          <Plus className="w-3 h-3" />
        </button>
      </div>

      {/* Line count */}
      <span className="text-xs text-[var(--text-muted)] tabular-nums">
        {lineCount === totalCount
          ? `${totalCount.toLocaleString()} lines`
          : `${lineCount.toLocaleString()} / ${totalCount.toLocaleString()}`
        }
      </span>

      {/* Controls */}
      <div className="flex items-center gap-1 border-l border-[var(--border-default)] pl-2">
        {/* Go to bottom — always visible */}
        <button
          onClick={onScrollToBottom}
          className="p-1.5 rounded-md text-blue-400 hover:text-blue-300 hover:bg-blue-500/10 transition-colors"
          title="Scroll to bottom"
        >
          <ArrowDown className="w-3.5 h-3.5" />
        </button>

        {/* Follow mode toggle */}
        <button
          onClick={onToggleFollow}
          className={cn(
            'p-1.5 rounded-md transition-colors',
            follow
              ? 'text-cyan-400 bg-cyan-500/15 hover:bg-cyan-500/25'
              : 'text-[var(--text-muted)] hover:text-cyan-400 hover:bg-cyan-500/10'
          )}
          title={follow ? 'Follow mode ON' : 'Follow mode OFF'}
        >
          <ChevronsDown className="w-3.5 h-3.5" />
        </button>

        {/* Pause / Play */}
        <button
          onClick={onTogglePause}
          className={cn(
            'p-1.5 rounded-md transition-colors',
            paused
              ? 'text-red-400 bg-red-500/15 hover:bg-red-500/25'
              : 'text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20'
          )}
          title={paused ? 'Resume' : 'Pause'}
        >
          {paused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
        </button>

        {/* Clear */}
        <button
          onClick={onClear}
          className="p-1.5 rounded-md text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 transition-colors"
          title="Clear logs"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}
