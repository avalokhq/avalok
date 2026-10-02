import { useRef, useEffect, useLayoutEffect, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { ArrowDown } from 'lucide-react'
import { cn } from '../../lib/cn'
import { formatLogTime } from '../../lib/format'
import { levelOf, type LogLevel } from '../../lib/parseLevel'
import { toneSoft, toneText, type Tone } from '../../lib/statusTone'
import SourceDot from '../ui/SourceDot'
import type { LogEntry } from '../../lib/types'
import type { LogViewState } from './useLogViewState'

interface Props<T extends LogEntry> {
  view: LogViewState<T>
  /** Data source state, used for the empty message and to hold follow while paused. */
  connected: boolean
  paused: boolean
  /** Key for the source color dot; defaults to the displayed source name. */
  sourceKey?: (e: T) => string
}

const BLINK_DURATION = 2000
const HEADER_HEIGHT = 28
/** Distance from the bottom (px) that still counts as "at the bottom". */
const BOTTOM_SLACK = 8

const LEVEL_BADGE: Record<LogLevel, { label: string; tone: Tone }> = {
  error: { label: 'ERR', tone: 'danger' },
  warn: { label: 'WRN', tone: 'warning' },
  info: { label: 'INF', tone: 'info' },
  debug: { label: 'DBG', tone: 'neutral' },
}

function highlightSearch(text: string | undefined, query: string): React.ReactNode {
  if (!text) return text ?? ''
  if (!query) return text
  const idx = text.toLowerCase().indexOf(query.toLowerCase())
  if (idx === -1) return text
  return (
    <>
      {text.substring(0, idx)}
      <mark className="rounded-sm bg-warning-soft px-0.5 text-fg">{text.substring(idx, idx + query.length)}</mark>
      {text.substring(idx + query.length)}
    </>
  )
}

/** Fixed-width cells keep every row aligned with the header, whatever the font size. */
const CELL = { time: '13ch', level: '5ch', source: '18ch' }

/** Virtualized log table shared by the console, split panes and merged view. */
export default function LogLines<T extends LogEntry>({ view, connected, paused, sourceKey }: Props<T>) {
  const { filtered: logs, total, columns, fontSize, wrap, relativeLineNumbers, follow, setFollow, jumpToken, debouncedSearch, sourceOf } = view
  const parentRef = useRef<HTMLDivElement>(null)
  const lastInputRef = useRef(0)
  const unseenFromRef = useRef(logs.length)
  const rowHeight = fontSize + 10
  const following = follow && !paused

  const showTime = columns.has('timestamp')
  const showLevel = columns.has('level')
  const showSource = columns.has('source')

  const maxNum = Math.max(...[logs[0]?._lineNum ?? 0, logs[logs.length - 1]?._lineNum ?? 0].map(Math.abs), logs.length)
  const lineNumWidth = `${Math.max(4, String(maxNum).length + (relativeLineNumbers ? 1 : 0)) + 1}ch`

  const virtualizer = useVirtualizer({
    count: logs.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => rowHeight,
    overscan: 30,
    paddingStart: HEADER_HEIGHT,
    scrollPaddingStart: HEADER_HEIGHT,
  })

  // Unwrapped rows are absolutely positioned, so the container cannot size to them. Track the
  // widest row drawn so far and stretch every row to it; stripes and dividers then span the
  // whole horizontal scroll instead of stopping at each line's own text.
  const contentRef = useRef<HTMLDivElement>(null)
  const widthKey = `${wrap}|${fontSize}|${[...columns].join()}|${lineNumWidth}`
  const [measured, setMeasured] = useState({ key: widthKey, width: 0 })
  const contentWidth = wrap || measured.key !== widthKey ? 0 : measured.width
  useLayoutEffect(() => {
    if (wrap) return
    let max = 0
    contentRef.current?.querySelectorAll<HTMLElement>('[data-index]').forEach(row => { max = Math.max(max, row.scrollWidth) })
    if (max > contentWidth) setMeasured({ key: widthKey, width: max })
  }, [wrap, widthKey, contentWidth, logs, virtualizer.range?.startIndex, virtualizer.range?.endIndex])

  useEffect(() => {
    if (following && logs.length > 0) {
      virtualizer.scrollToIndex(logs.length - 1, { align: 'end' })
    }
  }, [logs.length, following, jumpToken, virtualizer])

  // Lines that arrived since follow was switched off, for the "N new lines" pill.
  useEffect(() => {
    if (!follow) unseenFromRef.current = logs.length
  // Only re-baseline when follow flips, not on every new line.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [follow])
  const unseen = follow ? 0 : Math.max(0, logs.length - unseenFromRef.current)

  // Follow tracks the user: scrolling up releases it, scrolling back to the bottom resumes it.
  // Only scrolls shortly after real input count, so programmatic scrolls never toggle it.
  const markInput = () => { lastInputRef.current = Date.now() }
  const onScroll = () => {
    const el = parentRef.current
    if (!el || paused || Date.now() - lastInputRef.current > 600) return
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight <= BOTTOM_SLACK
    if (atBottom !== follow) setFollow(atBottom)
  }

  if (logs.length === 0) {
    return (
      <div className="log-surface flex h-full items-center justify-center text-sm text-fg-muted">
        {total > 0 ? 'No lines match the current filters' : connected ? 'Waiting for log lines…' : 'Connecting…'}
      </div>
    )
  }

  const now = Date.now()
  const cellStyle = (width: string) => ({ width, minWidth: width })

  return (
    <div className="relative h-full">
      <div
        ref={parentRef}
        role="region"
        aria-label="Log lines"
        tabIndex={0}
        onScroll={onScroll}
        onWheel={markInput}
        onPointerDown={markInput}
        onKeyDown={markInput}
        onTouchMove={markInput}
        className="log-surface log-scroll h-full overflow-auto font-mono focus-visible:outline-none"
        style={{ fontSize: `${fontSize}px` }}
      >
        <div ref={contentRef} className="relative min-w-full" style={{ height: virtualizer.getTotalSize(), width: contentWidth || undefined }}>
          {/* Column header */}
          <div
            className="sticky top-0 z-10 flex min-w-full items-center border-b border-line bg-surface-sunken px-3 font-sans text-2xs font-medium uppercase tracking-wide text-fg-muted"
            style={{ height: HEADER_HEIGHT }}
          >
            <span className="shrink-0 pr-3 text-right" style={cellStyle(lineNumWidth)}>#</span>
            {showTime && <span className="shrink-0 pr-3" style={cellStyle(CELL.time)}>Time</span>}
            {showLevel && <span className="shrink-0 pr-3" style={cellStyle(CELL.level)}>Level</span>}
            {showSource && <span className="shrink-0 pr-3" style={cellStyle(CELL.source)}>Source</span>}
            <span className="flex-1">Message</span>
          </div>

          {virtualizer.getVirtualItems().map(vRow => {
            const entry = logs[vRow.index]
            const level = levelOf(entry)
            const badge = LEVEL_BADGE[level]
            const lineNum = entry._lineNum ?? vRow.index + 1
            const source = sourceOf(entry)

            return (
              <div
                key={vRow.index}
                data-index={vRow.index}
                ref={virtualizer.measureElement}
                className={cn(
                  'log-row absolute top-0 left-0 flex w-full items-start px-3 transition-colors hover:bg-hover',
                  !wrap && 'min-w-max',
                  vRow.index % 2 === 1 && 'log-row-alt',
                  entry._blinkAt != null && now - entry._blinkAt < BLINK_DURATION && 'log-new-line',
                  relativeLineNumbers && lineNum === 0 && 'border-dashed border-info-line',
                )}
                style={{ transform: `translateY(${vRow.start}px)`, lineHeight: `${rowHeight}px` }}
              >
                <span
                  className={cn('shrink-0 select-none pr-3 text-right tabular-nums', relativeLineNumbers && lineNum <= 0 ? 'text-info' : 'text-fg-faint')}
                  style={cellStyle(lineNumWidth)}
                >
                  {lineNum}
                </span>

                {showTime && (
                  <span className="shrink-0 overflow-hidden pr-3 tabular-nums text-fg-muted" style={cellStyle(CELL.time)}>
                    {entry.timestamp ? formatLogTime(entry.timestamp) : <span className="text-fg-faint">—</span>}
                  </span>
                )}

                {showLevel && (
                  <span className="shrink-0 pr-3" style={cellStyle(CELL.level)}>
                    <span className={cn('rounded-sm px-1 font-semibold', toneSoft[badge.tone], toneText[badge.tone])}>{badge.label}</span>
                  </span>
                )}

                {showSource && (
                  <span className="flex shrink-0 items-center gap-1.5 overflow-hidden pr-3 whitespace-nowrap" style={cellStyle(CELL.source)} title={source}>
                    {source && <SourceDot name={sourceKey?.(entry) ?? source} />}
                    <span className="truncate text-fg-secondary">{source || '—'}</span>
                  </span>
                )}

                <span className={cn('flex-1', level === 'debug' ? 'text-fg-muted' : 'text-fg', wrap ? 'whitespace-pre-wrap break-all' : 'whitespace-pre')}>
                  {highlightSearch(entry.line, debouncedSearch)}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      {!following && !paused && unseen > 0 && (
        <button
          type="button"
          onClick={view.scrollToBottom}
          className="absolute bottom-4 left-1/2 flex h-8 -translate-x-1/2 cursor-pointer items-center gap-1.5 rounded-full border border-accent-line bg-surface-raised px-3 font-sans text-xs font-medium text-accent shadow-md transition-colors hover:bg-accent-soft animate-scale-in"
        >
          <ArrowDown className="size-3.5" />
          {unseen.toLocaleString()} new {unseen === 1 ? 'line' : 'lines'}
        </button>
      )}
    </div>
  )
}
