import { useState, useCallback, useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import { streamURL } from '../../lib/api'
import type { LogEntry } from '../../lib/types'
import SourceDot from '../ui/SourceDot'
import StatusDot from '../ui/StatusDot'
import LogToolbar from './LogToolbar'
import LogLines from './LogLines'
import { useLogViewState } from './useLogViewState'

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
  onRemoveSession?: (id: string) => void
}

interface TaggedEntry extends LogEntry {
  sessionId: string
  sessionLabel: string
}

const DEFAULT_MAX_LINES = 10000
const BLINK_GAP_MS = 2000
const FLUSH_INTERVAL_MS = 100

const sessionLabelOf = (e: TaggedEntry) => e.sessionLabel
const sessionIdOf = (e: TaggedEntry) => e.sessionId
const exportPrefix = (e: TaggedEntry) => `[${e.sessionLabel}] `

/** Several services interleaved into one stream, tagged by source. */
export default function MergedLogPanel({ sessions, maxLines = DEFAULT_MAX_LINES, onRemoveSession }: Props) {
  const storeRef = useRef<TaggedEntry[]>([])
  const [version, setVersion] = useState(0)
  const [paused, setPaused] = useState(false)
  const [openCount, setOpenCount] = useState(0)
  const wsRefs = useRef<Map<string, WebSocket>>(new Map())
  const pausedRef = useRef(false)
  const lastReceivedRef = useRef<Map<string, number>>(new Map())
  const bufferRef = useRef<TaggedEntry[]>([])
  const rafRef = useRef(0)
  const lastFlushRef = useRef(0)
  const historyEndIndexRef = useRef<number>(-1)
  const historyDoneSessionsRef = useRef<Set<string>>(new Set())
  const trimThreshold = Math.ceil(maxLines * 2.0)

  useEffect(() => {
    const currentIds = new Set(sessions.map(s => s.id))
    const existing = wsRefs.current
    const historyDone = historyDoneSessionsRef.current
    const countOpen = () => setOpenCount([...existing.values()].filter(w => w.readyState === WebSocket.OPEN).length)

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

      ws.onopen = countOpen
      ws.onclose = countOpen

      ws.onmessage = (event) => {
        const entry: LogEntry = JSON.parse(event.data)

        if (entry.type === 'history_end') {
          historyDone.add(session.id)
          if (historyDone.size >= sessions.length && historyEndIndexRef.current === -1) {
            const store = storeRef.current
            const batch = bufferRef.current
            bufferRef.current = []
            for (let i = 0; i < batch.length; i++) store.push(batch[i])
            historyEndIndexRef.current = store.length
            lastFlushRef.current = performance.now()
            setVersion(v => v + 1)
          }
          return
        }

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
          const trimCount = store.length - maxLines
          store.splice(0, trimCount)
          if (historyEndIndexRef.current > 0) {
            historyEndIndexRef.current = Math.max(0, historyEndIndexRef.current - trimCount)
          }
        }
        lastFlushRef.current = now
        setVersion(v => v + 1)
      }
      rafRef.current = requestAnimationFrame(flush)
    }
    rafRef.current = requestAnimationFrame(flush)

    return () => {
      for (const ws of existing.values()) {
        ws.onclose = null
        ws.close()
      }
      existing.clear()
      setOpenCount(0)
      cancelAnimationFrame(rafRef.current)
      bufferRef.current = []
      historyEndIndexRef.current = -1
      historyDone.clear()
    }
  // Reconnect only when the set of sessions changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const clear = useCallback(() => {
    storeRef.current.length = 0
    historyEndIndexRef.current = -1
    setVersion(v => v + 1)
  }, [])

  const view = useLogViewState({
    logs: storeRef.current,
    version,
    historyEndIndex: historyEndIndexRef.current,
    sourceOf: sessionLabelOf,
    searchExtra: sessionLabelOf,
    defaultColumns: ['timestamp', 'level', 'source'],
  })

  const connected = openCount > 0
  const status = !connected
    ? { status: 'warn' as const, label: 'Connecting' }
    : paused
      ? { status: 'idle' as const, label: 'Paused' }
      : { status: 'live' as const, label: openCount < sessions.length ? `Live ${openCount}/${sessions.length}` : 'Live' }

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-card border border-line bg-surface shadow-sm">
      <div className="flex min-h-9 shrink-0 flex-wrap items-center gap-2 border-b border-line bg-surface-sunken px-3 py-1">
        <span className="text-xs font-medium text-fg">Merged view</span>
        <span className="text-2xs text-fg-muted">{sessions.length} sources</span>
        <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-1">
          {sessions.map(s => (
            <span key={s.id} className="inline-flex h-6 items-center gap-1.5 rounded-control border border-line bg-surface pr-0.5 pl-2 text-2xs text-fg-secondary">
              <SourceDot name={s.id} />
              <span className="max-w-32 truncate">{s.label}</span>
              {onRemoveSession && (
                <button
                  type="button"
                  onClick={() => onRemoveSession(s.id)}
                  className="flex size-5 cursor-pointer items-center justify-center rounded-control text-fg-muted transition-colors hover:bg-danger-soft hover:text-danger"
                  aria-label={`Remove ${s.label}`}
                  title={`Remove ${s.label}`}
                >
                  <X className="size-3" />
                </button>
              )}
            </span>
          ))}
        </div>
        <StatusDot status={status.status} label={status.label} className="text-2xs" />
      </div>

      <LogToolbar
        view={view}
        paused={paused}
        onTogglePause={togglePause}
        onClear={clear}
        onExport={() => view.exportLines(`merged-${sessions.map(s => s.service).join('-')}.log`, exportPrefix)}
        viewMode="stream"
      />

      <div className="min-h-0 flex-1">
        <LogLines view={view} connected={connected} paused={paused} sourceKey={sessionIdOf} />
      </div>
    </div>
  )
}
