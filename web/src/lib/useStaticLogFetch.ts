import { useState, useEffect, useRef, useCallback } from 'react'
import type { LogEntry } from './types'
import { storageObjectContentURL } from './api'

export function useStaticLogFetch(resourceName: string, objectKey: string, enabled: boolean) {
  const storeRef = useRef<LogEntry[]>([])
  const [version, setVersion] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    if (!enabled || !resourceName || !objectKey) {
      storeRef.current = []
      setVersion(v => v + 1)
      return
    }

    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    storeRef.current = []
    setVersion(0)
    setLoading(true)
    setError('')

    const url = storageObjectContentURL(resourceName, objectKey)

    fetch(url, { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) {
          const text = await res.text()
          throw new Error(text || `HTTP ${res.status}`)
        }

        const reader = res.body?.getReader()
        if (!reader) {
          throw new Error('No response body')
        }

        const decoder = new TextDecoder()
        let partial = ''
        const store = storeRef.current
        let count = 0
        const batchSize = 5000

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          partial += decoder.decode(value, { stream: true })
          const lines = partial.split('\n')
          partial = lines.pop() || ''

          for (const line of lines) {
            store.push({
              type: 'log',
              line,
              timestamp: '',
              source: '',
              instance: objectKey.split('/').pop() || objectKey,
            } as LogEntry)
            count++
            if (count % batchSize === 0) {
              setVersion(v => v + 1)
              await new Promise(r => setTimeout(r, 0))
            }
          }
        }

        if (partial) {
          store.push({
            type: 'log',
            line: partial,
            timestamp: '',
            source: '',
            instance: objectKey.split('/').pop() || objectKey,
          } as LogEntry)
        }

        setVersion(v => v + 1)
        setLoading(false)
      })
      .catch((err) => {
        if (err.name === 'AbortError') return
        setError(err.message || 'Failed to load file')
        setLoading(false)
      })

    return () => {
      controller.abort()
      abortRef.current = null
    }
  }, [resourceName, objectKey, enabled])

  const clear = useCallback(() => {
    storeRef.current.length = 0
    setVersion(v => v + 1)
  }, [])

  return { logs: storeRef.current, version, loading, error, clear }
}
