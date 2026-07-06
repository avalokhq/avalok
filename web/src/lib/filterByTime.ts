import type { LogEntry } from './types'
import type { TimeFilterValue } from '../components/LogConsole/TimeFilter'
import { parseTimestamp } from './parseTimestamp'

export function filterByTime<T extends LogEntry>(entries: T[], filter: TimeFilterValue): T[] {
  if (!filter.since && !filter.until) return entries

  const sinceMs = filter.since ? new Date(filter.since).getTime() : -Infinity
  const untilMs = filter.until ? new Date(filter.until).getTime() : Infinity

  return entries.filter(entry => {
    let ts: number | null = null

    if (filter.source === 'log') {
      const parsed = parseTimestamp(entry.line)
      if (parsed) ts = parsed.getTime()
    } else {
      if (entry.timestamp) ts = new Date(entry.timestamp).getTime()
    }

    if (ts === null) return true
    return ts >= sinceMs && ts <= untilMs
  })
}
