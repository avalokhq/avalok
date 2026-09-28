import type { LogEntry } from './types'

export function assignLineNumbers(
  entries: LogEntry[],
  relativeMode: boolean,
  historyEndIndex: number,
): void {
  if (!relativeMode || historyEndIndex <= 0) {
    for (let i = 0; i < entries.length; i++) {
      entries[i]._lineNum = i + 1
    }
    return
  }

  for (let i = 0; i < entries.length; i++) {
    entries[i]._lineNum = i - historyEndIndex + 1
  }
}
