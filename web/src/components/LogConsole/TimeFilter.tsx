import { useState, useRef, useEffect } from 'react'
import { Clock, X, ChevronDown } from 'lucide-react'
import { cn } from '../../lib/cn'

export type TimeSource = 'live' | 'log'

export interface TimeFilterValue {
  since?: string
  until?: string
  source: TimeSource
}

type Mode = 'relative' | 'absolute'

interface RelativeState {
  amount: number
  unit: 'minutes' | 'hours' | 'days'
}

const PRESETS: { label: string; amount: number; unit: RelativeState['unit'] }[] = [
  { label: '5m', amount: 5, unit: 'minutes' },
  { label: '15m', amount: 15, unit: 'minutes' },
  { label: '30m', amount: 30, unit: 'minutes' },
  { label: '1h', amount: 1, unit: 'hours' },
  { label: '6h', amount: 6, unit: 'hours' },
  { label: '24h', amount: 24, unit: 'hours' },
  { label: '7d', amount: 7, unit: 'days' },
]

function computeSince(rel: RelativeState): string {
  const ms = rel.amount * (rel.unit === 'minutes' ? 60 : rel.unit === 'hours' ? 3600 : 86400) * 1000
  return new Date(Date.now() - ms).toISOString()
}

function toLocalDatetime(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function formatActiveLabel(mode: Mode, rel: RelativeState, absFrom: string, absTo: string): string {
  if (mode === 'relative') {
    const u = rel.unit === 'minutes' ? 'min' : rel.unit === 'hours' ? 'hr' : 'd'
    return `${rel.amount}${u} ago`
  }
  const from = absFrom ? new Date(absFrom).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }) : '...'
  const to = absTo ? new Date(absTo).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }) : 'now'
  return `${from} – ${to}`
}

interface Props {
  value: TimeFilterValue
  onChange: (v: TimeFilterValue) => void
}

export default function TimeFilter({ value, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<Mode>('relative')
  const [rel, setRel] = useState<RelativeState>({ amount: 15, unit: 'minutes' })
  const [absFrom, setAbsFrom] = useState('')
  const [absTo, setAbsTo] = useState('')
  const popRef = useRef<HTMLDivElement>(null)
  const active = !!(value.since || value.until)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (popRef.current && !popRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const applyRelative = (r?: RelativeState) => {
    const use = r ?? rel
    if (r) setRel(use)
    onChange({ since: computeSince(use), source: value.source })
    setOpen(false)
  }

  const applyAbsolute = () => {
    if (!absFrom) return
    const since = new Date(absFrom).toISOString()
    const until = absTo ? new Date(absTo).toISOString() : undefined
    onChange({ since, until, source: value.source })
    setOpen(false)
  }

  const clearFilter = () => {
    onChange({ source: value.source })
    setOpen(false)
  }

  const toggleSource = () => {
    const next: TimeSource = value.source === 'live' ? 'log' : 'live'
    onChange({ ...value, source: next })
  }

  return (
    <div className="relative flex items-center" ref={popRef}>
      {/* Source toggle */}
      <button
        onClick={toggleSource}
        className={cn(
          'px-2 py-1 rounded-l-md text-[10px] font-medium border transition-colors',
          value.source === 'live'
            ? 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30'
            : 'bg-amber-500/15 text-amber-400 border-amber-500/30'
        )}
        title={value.source === 'live' ? 'Using server receive time — click to switch to log timestamp' : 'Using parsed log timestamp — click to switch to server receive time'}
      >
        {value.source === 'live' ? 'Live' : 'Log'}
      </button>

      <button
        onClick={() => setOpen(v => !v)}
        className={cn(
          'flex items-center gap-1.5 px-2 py-1 rounded-r-md text-xs transition-colors border border-l-0',
          active
            ? 'bg-accent-500/15 text-accent-400 border-accent-500/30 hover:bg-accent-500/25'
            : 'text-[var(--text-muted)] border-[var(--border-default)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
        )}
        title="Time filter"
      >
        <Clock className="w-3.5 h-3.5 shrink-0" />
        {active ? (
          <span className="max-w-[160px] truncate">{formatActiveLabel(mode, rel, absFrom, absTo)}</span>
        ) : (
          <>
            <span>Time</span>
            <ChevronDown className="w-3 h-3" />
          </>
        )}
      </button>

      {active && (
        <button
          onClick={(e) => { e.stopPropagation(); clearFilter() }}
          className="ml-0.5 p-0.5 rounded text-accent-400 hover:text-accent-300 hover:bg-accent-500/15 transition-colors shrink-0"
          title="Clear time filter"
        >
          <X className="w-3 h-3" />
        </button>
      )}

      {open && (
        <div className="absolute left-0 top-full mt-1.5 z-30 w-72 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-default)] shadow-xl overflow-hidden">
          {/* Source info */}
          <div className="px-3 py-2 border-b border-[var(--border-default)] bg-[var(--bg-elevated)]">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] font-medium">Timestamp source</span>
              <div className="flex rounded-md overflow-hidden border border-[var(--border-default)]">
                <button
                  onClick={() => onChange({ ...value, source: 'live' })}
                  className={cn(
                    'px-2 py-0.5 text-[10px] font-medium transition-colors',
                    value.source === 'live'
                      ? 'bg-cyan-500/20 text-cyan-400'
                      : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                  )}
                >
                  Live
                </button>
                <button
                  onClick={() => onChange({ ...value, source: 'log' })}
                  className={cn(
                    'px-2 py-0.5 text-[10px] font-medium transition-colors border-l border-[var(--border-default)]',
                    value.source === 'log'
                      ? 'bg-amber-500/20 text-amber-400'
                      : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                  )}
                >
                  Log
                </button>
              </div>
            </div>
            <p className="text-[10px] text-[var(--text-muted)] mt-1">
              {value.source === 'live'
                ? 'Filter by when Avalok received the log'
                : 'Filter by timestamp parsed from the log line'}
            </p>
          </div>

          {/* Mode tabs */}
          <div className="flex border-b border-[var(--border-default)]">
            <button
              onClick={() => setMode('relative')}
              className={cn(
                'flex-1 py-2 text-xs font-medium transition-colors',
                mode === 'relative'
                  ? 'text-accent-400 border-b-2 border-accent-400 bg-accent-500/5'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
              )}
            >
              Relative
            </button>
            <button
              onClick={() => setMode('absolute')}
              className={cn(
                'flex-1 py-2 text-xs font-medium transition-colors',
                mode === 'absolute'
                  ? 'text-accent-400 border-b-2 border-accent-400 bg-accent-500/5'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
              )}
            >
              Absolute
            </button>
          </div>

          {mode === 'relative' ? (
            <div className="p-3 space-y-3">
              <div className="flex flex-wrap gap-1.5">
                {PRESETS.map(p => (
                  <button
                    key={p.label}
                    onClick={() => applyRelative({ amount: p.amount, unit: p.unit })}
                    className={cn(
                      'px-2.5 py-1 rounded-md text-xs font-medium transition-colors',
                      rel.amount === p.amount && rel.unit === p.unit && active
                        ? 'bg-accent-500/20 text-accent-400 ring-1 ring-accent-500/30'
                        : 'bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'
                    )}
                  >
                    {p.label}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  value={rel.amount}
                  onChange={e => setRel(prev => ({ ...prev, amount: Math.max(1, parseInt(e.target.value) || 1) }))}
                  className="w-16 px-2 py-1.5 rounded-md bg-[var(--bg-elevated)] border border-[var(--border-default)] text-xs text-[var(--text-primary)] text-center focus:outline-none focus:border-accent-500 transition-colors"
                />
                <select
                  value={rel.unit}
                  onChange={e => setRel(prev => ({ ...prev, unit: e.target.value as RelativeState['unit'] }))}
                  className="flex-1 px-2 py-1.5 rounded-md bg-[var(--bg-elevated)] border border-[var(--border-default)] text-xs text-[var(--text-primary)] focus:outline-none focus:border-accent-500 transition-colors appearance-none cursor-pointer"
                >
                  <option value="minutes">minutes ago</option>
                  <option value="hours">hours ago</option>
                  <option value="days">days ago</option>
                </select>
                <button
                  onClick={() => applyRelative()}
                  className="px-3 py-1.5 rounded-md bg-accent-600 text-white text-xs font-medium hover:bg-accent-500 transition-colors"
                >
                  Apply
                </button>
              </div>
            </div>
          ) : (
            <div className="p-3 space-y-3">
              <div className="space-y-2">
                <label className="block text-[10px] uppercase tracking-wider text-[var(--text-muted)] font-medium">From</label>
                <input
                  type="datetime-local"
                  value={absFrom}
                  max={toLocalDatetime(new Date())}
                  onChange={e => setAbsFrom(e.target.value)}
                  className="w-full px-2 py-1.5 rounded-md bg-[var(--bg-elevated)] border border-[var(--border-default)] text-xs text-[var(--text-primary)] focus:outline-none focus:border-accent-500 transition-colors [color-scheme:dark]"
                />
              </div>
              <div className="space-y-2">
                <label className="block text-[10px] uppercase tracking-wider text-[var(--text-muted)] font-medium">To <span className="normal-case text-[var(--text-muted)]">(leave empty for live)</span></label>
                <input
                  type="datetime-local"
                  value={absTo}
                  max={toLocalDatetime(new Date())}
                  onChange={e => setAbsTo(e.target.value)}
                  className="w-full px-2 py-1.5 rounded-md bg-[var(--bg-elevated)] border border-[var(--border-default)] text-xs text-[var(--text-primary)] focus:outline-none focus:border-accent-500 transition-colors [color-scheme:dark]"
                />
              </div>
              <button
                onClick={applyAbsolute}
                disabled={!absFrom}
                className={cn(
                  'w-full py-1.5 rounded-md text-xs font-medium transition-colors',
                  absFrom
                    ? 'bg-accent-600 text-white hover:bg-accent-500'
                    : 'bg-[var(--bg-elevated)] text-[var(--text-muted)] cursor-not-allowed'
                )}
              >
                Apply Range
              </button>
            </div>
          )}

          {active && (
            <div className="px-3 pb-3">
              <button
                onClick={clearFilter}
                className="w-full py-1.5 rounded-md text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)] bg-[var(--bg-elevated)] hover:bg-[var(--bg-hover)] transition-colors"
              >
                Clear Filter
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
