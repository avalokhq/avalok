import { useState, useEffect, useRef, useCallback } from 'react'
import type { LogEntry } from './types'
import { streamURL, appendLiveMode } from './api'
import type { LogViewMode } from './api'

const DEFAULT_MAX_LINES = 10000
const BLINK_GAP_MS = 2000
const FLUSH_INTERVAL_MS = 100

export function useLogStream(workspace: string, env: string, service: string, customStreamURL?: string, maxLines = DEFAULT_MAX_LINES, viewMode: LogViewMode = 'stream') {
  const storeRef = useRef<LogEntry[]>([])
  const [version, setVersion] = useState(0)
  const [connected, setConnected] = useState(false)
  const [paused, setPaused] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)
  const pausedRef = useRef(false)
  const lastReceivedRef = useRef(0)
  const bufferRef = useRef<LogEntry[]>([])
  const rafRef = useRef(0)
  const lastFlushRef = useRef(0)
  const historyEndIndexRef = useRef<number>(-1)
  const historyReceivedRef = useRef(false)
  const trimThreshold = Math.ceil(maxLines * 2.0)

  const disabled = viewMode === 'file'

  useEffect(() => {
    if (disabled) return
    if (!customStreamURL && (!workspace || !env || !service)) return

    storeRef.current = []
    historyEndIndexRef.current = -1
    historyReceivedRef.current = false
    setVersion(0)

    const baseUrl = customStreamURL || streamURL(workspace, env, service)
    const url = appendLiveMode(baseUrl, viewMode)
    const ws = new WebSocket(url)
    wsRef.current = ws
    lastReceivedRef.current = Date.now()

    ws.onopen = () => setConnected(true)
    ws.onclose = () => setConnected(false)
    ws.onerror = () => setConnected(false)

    ws.onmessage = (event) => {
      const entry: LogEntry = JSON.parse(event.data)

      if (entry.type === 'history_end') {
        const store = storeRef.current
        const batch = bufferRef.current
        bufferRef.current = []
        for (let i = 0; i < batch.length; i++) store.push(batch[i])
        historyEndIndexRef.current = store.length
        historyReceivedRef.current = true
        lastFlushRef.current = performance.now()
        setVersion(v => v + 1)
        return
      }

      if (entry.type === 'error') {
        bufferRef.current.push({ ...entry, line: `ERROR: ${entry.error}` })
        return
      }

      const now = Date.now()
      if (now - lastReceivedRef.current >= BLINK_GAP_MS) {
        entry._blinkAt = now
      }
      lastReceivedRef.current = now

      bufferRef.current.push(entry)
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
      ws.close()
      wsRef.current = null
      cancelAnimationFrame(rafRef.current)
      bufferRef.current = []
      setConnected(false)
    }
  }, [workspace, env, service, customStreamURL, viewMode, disabled])

  const togglePause = useCallback(() => {
    const next = !pausedRef.current
    pausedRef.current = next
    setPaused(next)
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ action: next ? 'pause' : 'resume' }))
    }
  }, [])

  const clear = useCallback(() => {
    storeRef.current.length = 0
    historyEndIndexRef.current = -1
    setVersion(v => v + 1)
  }, [])

  return { logs: storeRef.current, version, connected, paused, togglePause, clear, historyEndIndex: historyEndIndexRef.current }
}
