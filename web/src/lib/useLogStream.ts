import { useState, useEffect, useRef, useCallback } from 'react'
import type { LogEntry } from './types'
import { streamURL } from './api'

const DEFAULT_MAX_LINES = 10000
const BLINK_GAP_MS = 2000
const FLUSH_INTERVAL_MS = 100

export function useLogStream(workspace: string, env: string, service: string, customStreamURL?: string, maxLines = DEFAULT_MAX_LINES) {
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
  const trimThreshold = Math.ceil(maxLines * 2.0)

  useEffect(() => {
    if (!customStreamURL && (!workspace || !env || !service)) return

    storeRef.current = []
    setVersion(0)

    const url = customStreamURL || streamURL(workspace, env, service)
    const ws = new WebSocket(url)
    wsRef.current = ws
    lastReceivedRef.current = Date.now()

    ws.onopen = () => setConnected(true)
    ws.onclose = () => setConnected(false)
    ws.onerror = () => setConnected(false)

    ws.onmessage = (event) => {
      const entry: LogEntry = JSON.parse(event.data)
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
          store.splice(0, store.length - maxLines)
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
  }, [workspace, env, service, customStreamURL])

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
    setVersion(v => v + 1)
  }, [])

  return { logs: storeRef.current, version, connected, paused, togglePause, clear }
}
