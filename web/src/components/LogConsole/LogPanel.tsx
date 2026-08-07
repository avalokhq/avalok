import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import { X, Columns3, Eye, EyeOff, ArrowDownToLine } from 'lucide-react'
import { cn } from '../../lib/cn'
import { useLogStream } from '../../lib/useLogStream'
import { useStaticLogFetch } from '../../lib/useStaticLogFetch'
import { useDebouncedValue } from '../../lib/useDebouncedValue'
import LogToolbar from './LogToolbar'
import LogLines from './LogLines'
import SourceDot from '../ui/SourceDot'
import type { LogEntry } from '../../lib/types'
import { parseLevel } from '../../lib/parseLevel'
import { filterByTime } from '../../lib/filterByTime'
import type { TimeFilterValue } from './TimeFilter'
import type { LogViewMode } from '../../lib/api'

interface Props {
  workspace: string
  environment: string
  service: string
  label: string
  panelId: string
  streamUrl?: string
  onClose: () => void
  maxLines?: number
  resourceName?: string
  objectKey?: string
}

function getStoredFontSize(): number {
  const v = localStorage.getItem('avalok-log-font-size')
  return v ? parseInt(v, 10) : 12
}

export default function LogPanel({ workspace, environment, service, label, panelId, streamUrl, onClose, maxLines, resourceName, objectKey }: Props) {
  const [timeFilter, setTimeFilter] = useState<TimeFilterValue>({ source: 'live' })
  const [viewMode, setViewMode] = useState<LogViewMode>('stream')
  const [overrideMsg, setOverrideMsg] = useState('')
  const isFirstMode = useRef(true)

  const wsData = useLogStream(workspace, environment, service, streamUrl, maxLines, viewMode)
  const fileData = useStaticLogFetch(resourceName ?? '', objectKey ?? '', viewMode === 'file')

  const isFileMode = viewMode === 'file'
  const logs = isFileMode ? fileData.logs : wsData.logs
  const version = isFileMode ? fileData.version : wsData.version
  const connected = isFileMode ? !fileData.loading : wsData.connected
  const paused = isFileMode ? false : wsData.paused

  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search, 300)
  const [follow, setFollow] = useState(true)
  const [showTimestamp, setShowTimestamp] = useState(false)
  const [showSource, setShowSource] = useState(false)
  const [levelFilter, setLevelFilter] = useState<Set<string>>(() => new Set(['error', 'warn', 'info', 'debug']))
  const [showColumnMenu, setShowColumnMenu] = useState(false)
  const [fontSize, setFontSize] = useState(getStoredFontSize)
  const [wrap, setWrap] = useState(true)
  const scrollKickRef = useRef(0)

  const hasFileMode = !!(resourceName && objectKey)

  const handleViewModeChange = useCallback((mode: LogViewMode) => {
    if (!isFirstMode.current) {
      const msg =
        mode === 'file' ? 'Loading file content...' :
        mode === 'live' ? 'Switching to live mode...' :
        'Switching to stream mode...'
      setOverrideMsg(msg)
    }
    isFirstMode.current = false
    setViewMode(mode)
  }, [])

  useEffect(() => {
    if (!overrideMsg) return
    const t = setTimeout(() => setOverrideMsg(''), 3000)
    return () => clearTimeout(t)
  }, [overrideMsg])

  const handleFontSizeChange = useCallback((size: number) => {
    setFontSize(size)
    localStorage.setItem('avalok-log-font-size', String(size))
  }, [])

  const filtered = useMemo(() => {
    void version
    let result = filterByTime(logs as LogEntry[], timeFilter)
    if (levelFilter.size < 4) {
      result = result.filter(l => levelFilter.has(parseLevel(l.line)))
    }
    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase()
      result = result.filter(l => l.line.toLowerCase().includes(q))
    }
    return result
  }, [version, debouncedSearch, levelFilter, timeFilter])

  const toggleLevel = useCallback((level: string) => {
    setLevelFilter(prev => {
      const next = new Set(prev)
      next.has(level) ? next.delete(level) : next.add(level)
      return next
    })
  }, [])

  const handleTogglePause = useCallback(() => {
    if (paused && follow) {
      scrollKickRef.current++
    }
    wsData.togglePause()
  }, [paused, follow, wsData.togglePause])

  const toggleFollow = useCallback(() => {
    setFollow(prev => !prev)
  }, [])

  const scrollToBottom = useCallback(() => {
    scrollKickRef.current++
    setFollow(true)
  }, [])

  const handleClear = useCallback(() => {
    if (isFileMode) {
      fileData.clear()
    } else {
      wsData.clear()
    }
  }, [isFileMode, fileData.clear, wsData.clear])

  const download = useCallback(() => {
    const text = filtered.map(l => {
      const ts = l.timestamp ? `${l.timestamp} ` : ''
      return `${ts}${l.line}`
    }).join('\n')
    const blob = new Blob([text], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${service || objectKey || 'logs'}-${environment || 'export'}.log`
    a.click()
    URL.revokeObjectURL(url)
  }, [filtered, service, environment, objectKey])

  return (
    <div className="flex flex-col overflow-hidden border border-[var(--border-default)] rounded-lg bg-[var(--bg-surface)]">
      {/* Panel header */}
      <div className="flex items-center gap-2 px-3 h-9 shrink-0 border-b border-[var(--border-default)] bg-[var(--bg-elevated)]">
        <SourceDot name={panelId} size="sm" />
        <span className={cn(
          'w-1.5 h-1.5 rounded-full shrink-0',
          connected ? 'bg-[var(--accent-bright)]' : isFileMode && fileData.loading ? 'bg-amber-400 animate-pulse' : 'bg-red-400'
        )} />
        <span className="text-xs font-medium text-[var(--text-primary)] truncate flex-1">{label}</span>
        <span className="text-[10px] text-[var(--text-muted)] truncate max-w-[200px]">
          {environment}
        </span>

        <div className="relative">
          <button
            onClick={() => setShowColumnMenu(v => !v)}
            className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition-colors"
          >
            <Columns3 className="w-3 h-3" />
          </button>
          {showColumnMenu && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowColumnMenu(false)} />
              <div className="absolute right-0 top-full mt-1 z-20 py-1 w-36 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-strong)] shadow-[var(--shadow-dialog)]">
                <button
                  onClick={() => setShowTimestamp(v => !v)}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"
                >
                  {showTimestamp ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                  Timestamp
                </button>
                <button
                  onClick={() => setShowSource(v => !v)}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"
                >
                  {showSource ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                  Source
                </button>
              </div>
            </>
          )}
        </div>

        {paused && (
          <span className="text-[10px] text-red-400 bg-red-500/10 px-1.5 py-0.5 rounded">
            Paused
          </span>
        )}

        <button
          onClick={download}
          className="p-1 rounded text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 transition-colors"
          title="Export logs"
        >
          <ArrowDownToLine className="w-3 h-3" />
        </button>

        <button
          onClick={onClose}
          className="p-1 rounded text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 transition-colors"
          title="Close panel"
        >
          <X className="w-3 h-3" />
        </button>
      </div>

      {/* Override banner */}
      {overrideMsg && (
        <div className="flex items-center justify-center gap-2 px-3 py-1 bg-amber-500/10 border-b border-amber-500/20 text-[10px] text-amber-400">
          <span className="inline-block w-2.5 h-2.5 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
          {overrideMsg}
        </div>
      )}

      {/* File loading error */}
      {isFileMode && fileData.error && (
        <div className="flex items-center justify-center gap-2 px-3 py-1 bg-red-500/10 border-b border-red-500/20 text-[10px] text-red-400">
          Failed to load: {fileData.error}
        </div>
      )}

      {/* Toolbar */}
      <LogToolbar
        search={search}
        onSearchChange={setSearch}
        paused={paused}
        onTogglePause={handleTogglePause}
        onClear={handleClear}
        onScrollToBottom={scrollToBottom}
        lineCount={filtered.length}
        totalCount={logs.length}
        follow={follow}
        onToggleFollow={toggleFollow}
        levelFilter={levelFilter}
        onToggleLevel={toggleLevel}
        fontSize={fontSize}
        onFontSizeChange={handleFontSizeChange}
        wrap={wrap}
        onToggleWrap={() => setWrap(v => !v)}
        timeFilter={timeFilter}
        onTimeFilterChange={setTimeFilter}
        viewMode={viewMode}
        onViewModeChange={handleViewModeChange}
        hasFileMode={hasFileMode}
      />

      {/* Log lines */}
      <div className="flex-1 min-h-0">
        <LogLines
          logs={filtered}
          follow={follow && !paused}
          showTimestamp={showTimestamp}
          showSource={showSource}
          search={debouncedSearch}
          fontSize={fontSize}
          wrap={wrap}
          totalCount={logs.length}
          connected={connected}
        />
      </div>
    </div>
  )
}
