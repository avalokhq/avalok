import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { ArrowDownToLine } from 'lucide-react'
import { cn } from '../../lib/cn'
import { streamURL } from '../../lib/api'
import { useDebouncedValue } from '../../lib/useDebouncedValue'
import LogToolbar from './LogToolbar'
import SourceDot from '../ui/SourceDot'
import type { LogEntry } from '../../lib/types'
import { parseLevel } from '../../lib/parseLevel'
import { filterByTime } from '../../lib/filterByTime'
import type { TimeFilterValue } from './TimeFilter'

interface Session {
  id: string
  workspace: string
  environment: string
  service: string
  label: string
  streamUrl?: string
}

interface Props {
  sessions: Session[]
  maxLines?: number
}

interface TaggedEntry extends LogEntry {
  sessionId: string
  sessionLabel: string
}

const DEFAULT_MAX_LINES = 10000
const BLINK_GAP_MS = 2000
const BLINK_DURATION = 2000
const FLUSH_INTERVAL_MS = 100

function formatTimestamp(ts: string): string {
  if (!ts) return ''
  try {
    const d = new Date(ts)
    return d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
      + '.' + String(d.getMilliseconds()).padStart(3, '0')
  } catch {
    return ts.substring(11, 23)
  }
}

function highlightSearch(text: string | undefined, query: string): React.ReactNode {
  if (!text) return text ?? ''
  if (!query) return text
  const idx = text.toLowerCase().indexOf(query.toLowerCase())
  if (idx === -1) return text
  return (
    <>
      {text.substring(0, idx)}
      <mark className="bg-amber-500/30 text-inherit rounded-sm px-0.5">{text.substring(idx, idx + query.length)}</mark>
      {text.substring(idx + query.length)}
    </>
  )
}

function getStoredFontSize(): number {
  const v = localStorage.getItem('avalok-log-font-size')
  return v ? parseInt(v, 10) : 12
}

function estimateRowHeight(fontSize: number): number {
  return fontSize + 10
}

export default function MergedLogPanel({ sessions, maxLines = DEFAULT_MAX_LINES }: Props) {
  const storeRef = useRef<TaggedEntry[]>([])
  const [version, setVersion] = useState(0)
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search, 300)
  const [follow, setFollow] = useState(true)
  const [paused, setPaused] = useState(false)
  const [levelFilter, setLevelFilter] = useState<Set<string>>(() => new Set(['error', 'warn', 'info', 'debug']))
  const [fontSize, setFontSize] = useState(getStoredFontSize)
  const [timeFilter, setTimeFilter] = useState<TimeFilterValue>({ source: 'live' })
  const [connected, setConnected] = useState(false)
  const wsRefs = useRef<Map<string, WebSocket>>(new Map())
  const pausedRef = useRef(false)
  const parentRef = useRef<HTMLDivElement>(null)
  const lastReceivedRef = useRef<Map<string, number>>(new Map())
  const bufferRef = useRef<TaggedEntry[]>([])
  const rafRef = useRef(0)
  const lastFlushRef = useRef(0)
  const trimThreshold = Math.ceil(maxLines * 1.5)

  const handleFontSizeChange = useCallback((size: number) => {
    setFontSize(size)
    localStorage.setItem('avalok-log-font-size', String(size))
  }, [])

  useEffect(() => {
    const currentIds = new Set(sessions.map(s => s.id))
    const existing = wsRefs.current

    for (const [id, ws] of existing) {
      if (!currentIds.has(id)) {
        ws.close()
        existing.delete(id)
        lastReceivedRef.current.delete(id)
      }
    }

    for (const session of sessions) {
      if (existing.has(session.id)) continue

      const url = session.streamUrl || streamURL(session.workspace, session.environment, session.service)
      const ws = new WebSocket(url)
      lastReceivedRef.current.set(session.id, Date.now())

      ws.onopen = () => setConnected(true)

      ws.onmessage = (event) => {
        const entry: LogEntry = JSON.parse(event.data)
        const tagged: TaggedEntry = {
          ...entry,
          sessionId: session.id,
          sessionLabel: session.label,
          line: entry.type === 'error' ? `ERROR: ${entry.error}` : entry.line,
        }

        const now = Date.now()
        const lastTime = lastReceivedRef.current.get(session.id) ?? 0
        if (now - lastTime >= BLINK_GAP_MS) {
          tagged._blinkAt = now
        }
        lastReceivedRef.current.set(session.id, now)

        bufferRef.current.push(tagged)
      }

      existing.set(session.id, ws)
    }

    function flush() {
      const now = performance.now()
      if (bufferRef.current.length > 0 && now - lastFlushRef.current >= FLUSH_INTERVAL_MS) {
        const batch = bufferRef.current
        bufferRef.current = []
        const store = storeRef.current
        for (let i = 0; i < batch.length; i++) store.push(batch[i])
        if (store.length > trimThreshold) {
          store.splice(0, store.length - maxLines)
        }
        lastFlushRef.current = now
        setVersion(v => v + 1)
      }
      rafRef.current = requestAnimationFrame(flush)
    }
    rafRef.current = requestAnimationFrame(flush)

    return () => {
      for (const ws of existing.values()) ws.close()
      existing.clear()
      cancelAnimationFrame(rafRef.current)
      bufferRef.current = []
    }
  }, [sessions.map(s => s.id).join(',')])

  const togglePause = useCallback(() => {
    const next = !pausedRef.current
    pausedRef.current = next
    setPaused(next)
    for (const ws of wsRefs.current.values()) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ action: next ? 'pause' : 'resume' }))
      }
    }
  }, [])

  const handleTogglePause = useCallback(() => {
    if (pausedRef.current && follow) {
      // resuming in follow mode — will auto-scroll via the effect
    }
    togglePause()
  }, [follow, togglePause])

  const clear = useCallback(() => {
    storeRef.current.length = 0
    setVersion(v => v + 1)
  }, [])

  const toggleLevel = useCallback((level: string) => {
    setLevelFilter(prev => {
      const next = new Set(prev)
      next.has(level) ? next.delete(level) : next.add(level)
      return next
    })
  }, [])

  const toggleFollow = useCallback(() => {
    setFollow(prev => !prev)
  }, [])

  const scrollToBottom = useCallback(() => {
    setFollow(true)
  }, [])

  const logs = storeRef.current

  const filtered = useMemo(() => {
    void version
    let result = filterByTime(logs, timeFilter)
    if (levelFilter.size < 4) {
      result = result.filter(l => levelFilter.has(parseLevel(l.line)))
    }
    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase()
      result = result.filter(l => (l.line?.toLowerCase().includes(q)) || l.sessionLabel.toLowerCase().includes(q))
    }
    return result
  }, [version, debouncedSearch, levelFilter, timeFilter])

  const download = useCallback(() => {
    const text = filtered.map(l => {
      const ts = l.timestamp ? `${l.timestamp} ` : ''
      return `[${l.sessionLabel}] ${ts}${l.line}`
    }).join('\n')
    const blob = new Blob([text], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `merged-${sessions.map(s => s.service).join('-')}.log`
    a.click()
    URL.revokeObjectURL(url)
  }, [filtered, sessions])

  const rowHeight = estimateRowHeight(fontSize)
  const shouldFollow = follow && !paused

  const virtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => rowHeight,
    overscan: 30,
  })

  useEffect(() => {
    if (shouldFollow && filtered.length > 0) {
      virtualizer.scrollToIndex(filtered.length - 1, { align: 'end' })
    }
  }, [filtered.length, shouldFollow, virtualizer])

  const now = Date.now()

  return (
    <div className="h-full flex flex-col overflow-hidden border border-[var(--border-default)] rounded-lg bg-[var(--bg-surface)]">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 h-9 shrink-0 border-b border-[var(--border-default)] bg-[var(--bg-elevated)]">
        <span className="text-xs font-medium text-[var(--text-primary)]">Merged View</span>
        <span className="text-[10px] text-[var(--text-muted)]">{sessions.length} sources</span>
        <div className="flex-1" />
        <div className="flex items-center gap-1">
          {sessions.map(s => (
            <div key={s.id} className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-[var(--bg-app)] text-[10px] text-[var(--text-secondary)]">
              <SourceDot name={s.id} />
              {s.label}
            </div>
          ))}
        </div>
        {paused && (
          <span className="text-[10px] text-red-400 bg-red-500/10 px-1.5 py-0.5 rounded">Paused</span>
        )}
        <button
          onClick={download}
          className="p-1 rounded text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 transition-colors"
          title="Export merged logs"
        >
          <ArrowDownToLine className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Toolbar */}
      <LogToolbar
        search={search}
        onSearchChange={setSearch}
        paused={paused}
        onTogglePause={handleTogglePause}
        onClear={clear}
        onScrollToBottom={scrollToBottom}
        lineCount={filtered.length}
        totalCount={logs.length}
        follow={follow}
        onToggleFollow={toggleFollow}
        levelFilter={levelFilter}
        onToggleLevel={toggleLevel}
        fontSize={fontSize}
        onFontSizeChange={handleFontSizeChange}
        timeFilter={timeFilter}
        onTimeFilterChange={setTimeFilter}
      />

      {/* Log lines */}
      {filtered.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-sm text-[var(--text-muted)]">
          {logs.length > 0 ? 'No matching logs found' : connected ? 'Loading logs...' : 'Connecting...'}
        </div>
      ) : (
        <div
          ref={parentRef}
          className="flex-1 overflow-auto log-scroll"
          style={{ background: 'var(--log-bg)' }}
        >
          <div style={{ height: virtualizer.getTotalSize(), width: '100%', position: 'relative' }}>
            {virtualizer.getVirtualItems().map(vRow => {
              const entry = filtered[vRow.index] as TaggedEntry
              const level = parseLevel(entry.line)
              const shouldBlink = entry._blinkAt != null && now - entry._blinkAt < BLINK_DURATION

              return (
                <div
                  key={vRow.index}
                  data-index={vRow.index}
                  ref={virtualizer.measureElement}
                  className={cn(
                    'absolute top-0 left-0 w-full flex items-start font-mono px-3 hover:bg-[var(--log-line-hover)] cursor-default transition-colors',
                    level === 'error' && 'log-level-error',
                    level === 'warn' && 'log-level-warn',
                    level === 'debug' && 'log-level-debug',
                    level === 'info' && 'log-level-info',
                    vRow.index % 2 === 1 && 'log-row-alt',
                    shouldBlink && 'log-new-line',
                  )}
                  style={{
                    transform: `translateY(${vRow.start}px)`,
                    fontSize: `${fontSize}px`,
                    lineHeight: `${rowHeight}px`,
                  }}
                >
                  <span className="shrink-0 w-12 pr-3 text-right text-[var(--text-muted)] select-none tabular-nums">
                    {vRow.index + 1}
                  </span>

                  {entry.timestamp && (
                    <span className="shrink-0 w-24 pr-3 text-[var(--text-muted)] tabular-nums">
                      {formatTimestamp(entry.timestamp)}
                    </span>
                  )}

                  <span className="shrink-0 w-32 pr-3 flex items-center gap-1.5 truncate">
                    <SourceDot name={entry.sessionId} />
                    <span className="truncate text-[var(--text-secondary)]">{entry.sessionLabel}</span>
                  </span>

                  <span className="flex-1 whitespace-pre-wrap break-all">
                    {highlightSearch(entry.line, debouncedSearch)}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
