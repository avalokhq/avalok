import { useMemo } from 'react'
import { cn } from '../../lib/cn'
import { toneText, type Tone } from '../../lib/statusTone'

// Decorative backdrop for the auth screens: columns of plausible log lines drifting upward.
// Purely visual (aria-hidden, no pointer events); motion stops under prefers-reduced-motion.

type Level = 'INFO' | 'DEBUG' | 'WARN' | 'ERROR'

const LEVEL_TONE: Record<Level, Tone> = { INFO: 'info', DEBUG: 'neutral', WARN: 'warning', ERROR: 'danger' }

const SOURCES = ['api-gateway', 'auth-svc', 'payments', 'ingest-worker', 'nginx', 'postgres', 'redis', 'scheduler', 'k8s/web-7f9c', 'billing']

const MESSAGES: Record<Level, string[]> = {
  INFO: [
    'GET /v1/streams 200 12ms',
    'POST /v1/sessions 201 34ms',
    'connected to upstream 10.0.4.12:5432',
    'worker started pid=4821',
    'checkpoint complete: 1284 buffers written',
    'tail attached to /var/log/app/server.log',
    'deployment rolled out (3/3 ready)',
    'cache warmed in 214ms',
    'GET /healthz 200 1ms',
    'flushed 512 events to sink',
  ],
  DEBUG: [
    'resolving host db.internal',
    'ws frame sent bytes=1832',
    'retry policy: backoff=250ms max=5',
    'parsed config in 3ms',
    'lease renewed ttl=15s',
  ],
  WARN: [
    'slow query 1.2s: SELECT * FROM events',
    'retrying request (attempt 2/5)',
    'memory usage at 82% of limit',
    'certificate expires in 14 days',
  ],
  ERROR: [
    'connection reset by peer',
    'timeout after 30s waiting for upstream',
    'failed to rotate log: permission denied',
  ],
}

// Small deterministic PRNG so every render produces the same columns.
function mulberry32(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

interface Line { time: string; level: Level; source: string; message: string }

function buildColumn(seed: number, count: number): Line[] {
  const rand = mulberry32(seed)
  const pick = <T,>(arr: T[]) => arr[Math.floor(rand() * arr.length)]
  let ms = Math.floor(rand() * 86_400_000)
  const lines: Line[] = []
  for (let i = 0; i < count; i++) {
    ms = (ms + 40 + Math.floor(rand() * 900)) % 86_400_000
    const r = rand()
    const level: Level = r < 0.62 ? 'INFO' : r < 0.82 ? 'DEBUG' : r < 0.95 ? 'WARN' : 'ERROR'
    const h = String(Math.floor(ms / 3_600_000)).padStart(2, '0')
    const m = String(Math.floor(ms / 60_000) % 60).padStart(2, '0')
    const s = String(Math.floor(ms / 1000) % 60).padStart(2, '0')
    const f = String(ms % 1000).padStart(3, '0')
    lines.push({ time: `${h}:${m}:${s}.${f}`, level, source: pick(SOURCES), message: pick(MESSAGES[level]) })
  }
  return lines
}

// Each column scrolls at its own speed for a gentle parallax; extra columns appear on wider screens.
const COLUMNS = [
  { seed: 11, duration: 110, className: '' },
  { seed: 29, duration: 145, className: 'hidden md:block' },
  { seed: 47, duration: 125, className: 'hidden xl:block' },
  { seed: 83, duration: 160, className: 'hidden 2xl:block' },
]

const LINES_PER_COLUMN = 48

interface Props {
  /** Overall strength of the effect, 0–1. Defaults to 0.3. */
  opacity?: number
}

export default function LogStreamBackground({ opacity = 0.3 }: Props) {
  const columns = useMemo(() => COLUMNS.map(c => ({ ...c, lines: buildColumn(c.seed, LINES_PER_COLUMN) })), [])

  return (
    <div aria-hidden className="log-stream-bg select-none" style={{ opacity }}>
      <div className="grid h-full grid-cols-1 gap-8 px-6 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {columns.map(col => (
          <div key={col.seed} className={cn('min-w-0 overflow-hidden', col.className)}>
            {/* Content is rendered twice and shifted by -50% per cycle, so the loop is seamless. */}
            <div className="log-stream" style={{ '--log-stream-duration': `${col.duration}s` } as React.CSSProperties}>
              {[0, 1].map(copy => (
                <div key={copy}>
                  {col.lines.map((line, i) => (
                    <div key={i} className="truncate whitespace-nowrap font-mono text-xs leading-6 text-fg-muted">
                      <span className="tabular-nums text-fg-faint">{line.time}</span>
                      <span className={cn('ml-3 inline-block w-11 font-semibold', toneText[LEVEL_TONE[line.level]])}>{line.level}</span>
                      <span className="ml-2 text-accent">{line.source}</span>
                      <span className="ml-2">{line.message}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
