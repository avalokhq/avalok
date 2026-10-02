import { useCallback, useMemo, useState } from 'react'
import { useDebouncedValue } from '../../lib/useDebouncedValue'
import { levelOf, LOG_LEVELS, type LogLevel } from '../../lib/parseLevel'
import { filterByTime } from '../../lib/filterByTime'
import { assignLineNumbers } from '../../lib/assignLineNumbers'
import type { LogEntry } from '../../lib/types'
import type { Tone } from '../../lib/statusTone'
import type { TimeFilterValue } from './TimeFilter'

export type LogColumn = 'timestamp' | 'level' | 'source'
export type Facet = 'source' | 'instance'

export const FONT_SIZES = [10, 12, 14, 16, 18]

export const LEVEL_META: Record<LogLevel, { label: string; tone: Tone }> = {
  error: { label: 'Error', tone: 'danger' },
  warn: { label: 'Warn', tone: 'warning' },
  info: { label: 'Info', tone: 'info' },
  debug: { label: 'Debug', tone: 'neutral' },
}

interface Options<T extends LogEntry> {
  logs: T[]
  /** Bumped by the data source whenever `logs` is mutated in place. */
  version: number
  historyEndIndex: number
  /** Value shown in the Source column and counted by the Source facet. */
  sourceOf?: (e: T) => string
  /** Extra text matched by the search box besides the line itself. */
  searchExtra?: (e: T) => string
  /** Columns visible by default. */
  defaultColumns?: LogColumn[]
}

const stored = (key: string) => localStorage.getItem(key)

function storedFontSize(): number {
  const v = parseInt(stored('avalok-log-font-size') ?? '', 10)
  return FONT_SIZES.includes(v) ? v : 12
}

const defaultSourceOf = (e: LogEntry) => e.source

function bump(map: Map<string, number>, key: string) {
  if (key) map.set(key, (map.get(key) ?? 0) + 1)
}

/**
 * Everything a log view needs besides the data source: search, level and source facets,
 * time filter, columns, font size, wrap, follow and export. Shared by the full-page
 * console, the split panes and the merged view.
 */
export function useLogViewState<T extends LogEntry>({
  logs, version, historyEndIndex, sourceOf = defaultSourceOf, searchExtra, defaultColumns = ['level'],
}: Options<T>) {
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search, 300)
  const [levels, setLevels] = useState<Set<LogLevel>>(() => new Set(LOG_LEVELS))
  const [excluded, setExcluded] = useState<Record<Facet, Set<string>>>(() => ({ source: new Set(), instance: new Set() }))
  const [timeFilter, setTimeFilter] = useState<TimeFilterValue>({ source: 'live' })
  const [columns, setColumns] = useState<Set<LogColumn>>(() => new Set(defaultColumns))
  const [fontSize, setFontSizeState] = useState(storedFontSize)
  const [wrap, setWrap] = useState(true)
  const [relativeLineNumbers, setRelativeLineNumbers] = useState(() => stored('avalok-relative-linenums') === 'true')
  const [follow, setFollow] = useState(true)
  // Bumped by "scroll to bottom" so the list jumps even when follow was already on.
  const [jumpToken, setJumpToken] = useState(0)

  const { filtered, inRange, counts } = useMemo(() => {
    void version
    assignLineNumbers(logs, relativeLineNumbers, historyEndIndex)
    const inRange = filterByTime(logs, timeFilter) as T[]
    const counts = {
      level: new Map<string, number>(),
      source: new Map<string, number>(),
      instance: new Map<string, number>(),
    }
    const q = debouncedSearch.toLowerCase()
    const filtered: T[] = []
    for (const e of inRange) {
      const level = levelOf(e)
      const src = sourceOf(e)
      bump(counts.level, level)
      bump(counts.source, src)
      bump(counts.instance, e.instance)
      if (!levels.has(level)) continue
      if (src && excluded.source.has(src)) continue
      if (e.instance && excluded.instance.has(e.instance)) continue
      if (q && !e.line?.toLowerCase().includes(q) && !searchExtra?.(e).toLowerCase().includes(q)) continue
      filtered.push(e)
    }
    return { filtered, inRange, counts }
  // sourceOf/searchExtra are expected to be stable module-level functions.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, logs, historyEndIndex, relativeLineNumbers, timeFilter, debouncedSearch, levels, excluded])

  const toggleLevel = useCallback((level: LogLevel) => {
    setLevels(prev => {
      const next = new Set(prev)
      if (next.has(level)) next.delete(level)
      else next.add(level)
      return next
    })
  }, [])

  const toggleFacet = useCallback((facet: Facet, value: string) => {
    setExcluded(prev => {
      const next = new Set(prev[facet])
      if (next.has(value)) next.delete(value)
      else next.add(value)
      return { ...prev, [facet]: next }
    })
  }, [])

  const resetFilters = useCallback(() => {
    setLevels(new Set(LOG_LEVELS))
    setExcluded({ source: new Set(), instance: new Set() })
    setSearch('')
  }, [])

  const toggleColumn = useCallback((col: LogColumn) => {
    setColumns(prev => {
      const next = new Set(prev)
      if (next.has(col)) next.delete(col)
      else next.add(col)
      return next
    })
  }, [])

  const setFontSize = useCallback((size: number) => {
    setFontSizeState(size)
    localStorage.setItem('avalok-log-font-size', String(size))
  }, [])

  const toggleRelativeLineNumbers = useCallback(() => {
    setRelativeLineNumbers(prev => {
      localStorage.setItem('avalok-relative-linenums', String(!prev))
      return !prev
    })
  }, [])

  const scrollToBottom = useCallback(() => {
    setFollow(true)
    setJumpToken(t => t + 1)
  }, [])

  /** Downloads the currently visible lines as a .log file. */
  const exportLines = useCallback((filename: string, prefix?: (e: T) => string) => {
    const text = filtered.map(l => `${prefix?.(l) ?? ''}${l.timestamp ? `${l.timestamp} ` : ''}${l.line}`).join('\n')
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }))
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }, [filtered])

  const filtersActive = levels.size < LOG_LEVELS.length || excluded.source.size > 0 || excluded.instance.size > 0

  return {
    search, setSearch, debouncedSearch,
    levels, toggleLevel,
    excluded, toggleFacet, resetFilters, filtersActive,
    timeFilter, setTimeFilter,
    columns, toggleColumn,
    fontSize, setFontSize,
    wrap, toggleWrap: useCallback(() => setWrap(w => !w), []),
    relativeLineNumbers, toggleRelativeLineNumbers,
    follow, setFollow, scrollToBottom, jumpToken,
    filtered, inRange, counts, total: logs.length,
    sourceOf, exportLines,
  }
}

export type LogViewState<T extends LogEntry = LogEntry> = ReturnType<typeof useLogViewState<T>>
