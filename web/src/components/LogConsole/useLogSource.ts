import { useCallback, useEffect, useRef, useState } from 'react'
import { useLogStream } from '../../lib/useLogStream'
import { useStaticLogFetch } from '../../lib/useStaticLogFetch'
import type { LogViewMode } from '../../lib/api'
import type { DotStatus } from '../ui/StatusDot'

export interface LogSourceProps {
  workspace?: string
  environment?: string
  service?: string
  streamUrl?: string
  maxLines?: number
  /** Storage resource + object key; enables the "Load file" mode. */
  resourceName?: string
  objectKey?: string
}

const MODE_MESSAGES: Record<LogViewMode, string> = {
  stream: 'Switching to stream mode…',
  live: 'Switching to live mode…',
  file: 'Loading file content…',
}

/** One service's logs: WebSocket stream (stream/live) or a one-shot HTTP file fetch. */
export function useLogSource({ workspace, environment, service, streamUrl, maxLines, resourceName, objectKey }: LogSourceProps) {
  const [viewMode, setViewModeState] = useState<LogViewMode>('stream')
  const [notice, setNotice] = useState('')
  const isFirstMode = useRef(true)

  const ws = useLogStream(workspace ?? '', environment ?? '', service ?? '', streamUrl, maxLines, viewMode)
  const file = useStaticLogFetch(resourceName ?? '', objectKey ?? '', viewMode === 'file')
  const isFile = viewMode === 'file'

  const setViewMode = useCallback((mode: LogViewMode) => {
    if (!isFirstMode.current) setNotice(MODE_MESSAGES[mode])
    isFirstMode.current = false
    setViewModeState(mode)
  }, [])

  useEffect(() => {
    if (!notice) return
    const t = setTimeout(() => setNotice(''), 3000)
    return () => clearTimeout(t)
  }, [notice])

  const paused = isFile ? false : ws.paused
  const connected = isFile ? !file.loading : ws.connected
  const status: { status: DotStatus; label: string } = isFile
    ? file.error ? { status: 'error', label: 'Failed' } : file.loading ? { status: 'warn', label: 'Loading' } : { status: 'ok', label: 'File' }
    : !ws.connected ? { status: 'warn', label: 'Connecting' } : paused ? { status: 'idle', label: 'Paused' } : { status: 'live', label: 'Live' }

  return {
    logs: isFile ? file.logs : ws.logs,
    version: isFile ? file.version : ws.version,
    historyEndIndex: isFile ? -1 : ws.historyEndIndex,
    connected,
    paused,
    togglePause: ws.togglePause,
    clear: isFile ? file.clear : ws.clear,
    error: isFile ? file.error : '',
    notice,
    viewMode,
    setViewMode,
    hasFileMode: !!(resourceName && objectKey),
    status,
  }
}

export type LogSource = ReturnType<typeof useLogSource>
