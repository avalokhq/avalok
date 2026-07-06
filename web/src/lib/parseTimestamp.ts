export type TimestampParser = {
  name: string
  pattern: RegExp
  parse: (match: RegExpMatchArray) => Date | null
}

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
}

export const parsers: TimestampParser[] = [
  {
    name: 'iso8601',
    pattern: /(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2}))/,
    parse: (m) => {
      const raw = m[1].replace(/(\.\d{3})\d+/, '$1')
      const d = new Date(raw)
      return isNaN(d.getTime()) ? null : d
    },
  },
  {
    name: 'python-datetime',
    pattern: /(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}:\d{2})[,.](\d{1,3})/,
    parse: (m) => {
      const d = new Date(`${m[1]}T${m[2]}.${m[3].padEnd(3, '0')}Z`)
      return isNaN(d.getTime()) ? null : d
    },
  },
  {
    name: 'syslog-rfc3164',
    pattern: /([A-Z][a-z]{2})\s+(\d{1,2})\s+(\d{2}:\d{2}:\d{2})/,
    parse: (m) => {
      const mon = MONTHS[m[1].toLowerCase()]
      if (mon === undefined) return null
      const now = new Date()
      const d = new Date(now.getFullYear(), mon, parseInt(m[2]), ...m[3].split(':').map(Number) as [number, number, number])
      return isNaN(d.getTime()) ? null : d
    },
  },
  {
    name: 'bind-style',
    pattern: /(\d{1,2})-([A-Z][a-z]{2})-(\d{4})\s+(\d{2}:\d{2}:\d{2})(?:\.(\d+))?/,
    parse: (m) => {
      const mon = MONTHS[m[2].toLowerCase()]
      if (mon === undefined) return null
      const ms = m[5] ? parseInt(m[5].padEnd(3, '0').slice(0, 3)) : 0
      const d = new Date(parseInt(m[3]), mon, parseInt(m[1]), ...m[4].split(':').map(Number) as [number, number, number], ms)
      return isNaN(d.getTime()) ? null : d
    },
  },
  {
    name: 'us-date-brackets',
    pattern: /\[(\d{1,2})\/(\d{1,2})\/(\d{4})\]\s*\[(\d{1,2}):(\d{2}):(\d{2})\s*(AM|PM)\]/i,
    parse: (m) => {
      let hour = parseInt(m[4])
      const ampm = m[7].toUpperCase()
      if (ampm === 'PM' && hour !== 12) hour += 12
      if (ampm === 'AM' && hour === 12) hour = 0
      const d = new Date(parseInt(m[3]), parseInt(m[1]) - 1, parseInt(m[2]), hour, parseInt(m[5]), parseInt(m[6]))
      return isNaN(d.getTime()) ? null : d
    },
  },
  {
    name: 'common-log',
    pattern: /(\d{2})\/([A-Z][a-z]{2})\/(\d{4}):(\d{2}:\d{2}:\d{2})\s+([+-]\d{4})/,
    parse: (m) => {
      const mon = MONTHS[m[2].toLowerCase()]
      if (mon === undefined) return null
      const d = new Date(`${m[3]}-${String(mon + 1).padStart(2, '0')}-${m[1]}T${m[4]}${m[5].slice(0, 3)}:${m[5].slice(3)}`)
      return isNaN(d.getTime()) ? null : d
    },
  },
  {
    name: 'yyyy-mm-dd-hh-mm-ss',
    pattern: /(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}:\d{2})/,
    parse: (m) => {
      const d = new Date(`${m[1]}T${m[2]}Z`)
      return isNaN(d.getTime()) ? null : d
    },
  },
]

export function parseTimestamp(line: string | undefined): Date | null {
  if (!line) return null
  for (const parser of parsers) {
    const match = line.match(parser.pattern)
    if (match) {
      const result = parser.parse(match)
      if (result) return result
    }
  }
  return null
}
