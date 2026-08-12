import { useRef, useEffect } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { cn } from '../../lib/cn'
import SourceDot from '../ui/SourceDot'
import type { LogEntry } from '../../lib/types'
import { parseLevel } from '../../lib/parseLevel'

interface Props {
  logs: LogEntry[]
  follow: boolean
  showTimestamp: boolean
  showSource: boolean
  search: string
  fontSize: number
  wrap: boolean
  totalCount?: number
  connected?: boolean
}

const BLINK_DURATION = 2000

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

function estimateRowHeight(fontSize: number): number {
  return fontSize + 10
}

export default function LogLines({ logs, follow, showTimestamp, showSource, search, fontSize, wrap, totalCount = 0, connected }: Props) {
  const parentRef = useRef<HTMLDivElement>(null)
  const rowHeight = estimateRowHeight(fontSize)
  const lineNumWidth = `${Math.max(4, String(logs.length).length) + 1}ch`

  const virtualizer = useVirtualizer({
    count: logs.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => rowHeight,
    overscan: 30,
  })

  useEffect(() => {
    if (follow && logs.length > 0) {
      virtualizer.scrollToIndex(logs.length - 1, { align: 'end' })
    }
  }, [logs.length, follow, virtualizer])

  if (logs.length === 0) {
    const message = totalCount > 0
      ? 'No matching logs found'
      : connected
        ? 'Loading logs...'
        : 'Connecting...'
    return (
      <div className="h-full flex items-center justify-center text-sm text-[var(--text-muted)]">
        {message}
      </div>
    )
  }

  const now = Date.now()

  return (
    <div
      ref={parentRef}
      className="h-full overflow-auto log-scroll"
      style={{ background: 'var(--log-bg)' }}
    >
      <div
        style={{
          height: virtualizer.getTotalSize(),
          width: '100%',
          position: 'relative',
        }}
      >
        {virtualizer.getVirtualItems().map(vRow => {
          const entry = logs[vRow.index]
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
              {/* Line number */}
              <span className="shrink-0 pr-3 text-right text-[var(--text-muted)] select-none tabular-nums" style={{ width: lineNumWidth }}>
                {vRow.index + 1}
              </span>

              {/* Timestamp */}
              {showTimestamp && entry.timestamp && (
                <span className="shrink-0 pr-3 text-[var(--text-muted)] tabular-nums overflow-hidden" style={{ width: '13ch' }}>
                  {formatTimestamp(entry.timestamp)}
                </span>
              )}

              {/* Source dot + name */}
              {showSource && entry.source && (
                <span className="shrink-0 pr-3 flex items-center gap-1.5 whitespace-nowrap">
                  <SourceDot name={entry.source + (entry.instance || '')} />
                  <span className="text-[var(--text-secondary)]">
                    {entry.instance || entry.source}
                  </span>
                </span>
              )}

              {/* Log message */}
              <span className={cn('flex-1', wrap ? 'whitespace-pre-wrap break-all' : 'whitespace-pre')}>
                {highlightSearch(entry.line, search)}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
