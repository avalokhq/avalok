import { useEffect, useState } from 'react'
import { Server } from 'lucide-react'
import { cn } from '../../lib/cn'
import { fetchHealth } from '../../lib/api'
import StatusDot from '../ui/StatusDot'
import Tooltip from '../ui/Tooltip'
import Modal from '../ui/Modal'
import Button from '../ui/Button'

const POLL_MS = 30_000

type State = 'checking' | 'ok' | 'down'

/** Real server reachability (polls /api/health). Lives in the sidebar footer. */
export default function StatusIndicator({ collapsed }: { collapsed?: boolean }) {
  const [state, setState] = useState<State>('checking')
  const [checkedAt, setCheckedAt] = useState<Date | null>(null)
  const [open, setOpen] = useState(false)

  async function check() {
    try {
      // Network errors and non-JSON (proxy error pages) both throw.
      await fetchHealth()
      setState('ok')
    } catch {
      setState('down')
    }
    setCheckedAt(new Date())
  }

  useEffect(() => {
    let alive = true
    const run = () => { if (alive) void check() }
    run()
    const t = setInterval(run, POLL_MS)
    window.addEventListener('online', run)
    return () => {
      alive = false
      clearInterval(t)
      window.removeEventListener('online', run)
    }
  }, [])

  const dot = state === 'ok' ? 'live' : state === 'down' ? 'error' : 'idle'
  const label = state === 'ok' ? 'All systems normal' : state === 'down' ? 'Server unreachable' : 'Checking…'

  const button = (
    <button
      type="button"
      onClick={() => setOpen(true)}
      className={cn(
        'flex h-8 w-full cursor-pointer items-center gap-2.5 rounded-control text-xs text-fg-muted transition-colors hover:bg-hover hover:text-fg',
        collapsed ? 'justify-center' : 'px-2.5',
      )}
    >
      <StatusDot status={dot} />
      {!collapsed && <span className="truncate">{label}</span>}
    </button>
  )

  return (
    <>
      {collapsed ? <Tooltip content={label} side="right">{button}</Tooltip> : button}
      {open && (
        <Modal
          title="System status"
          size="sm"
          onClose={() => setOpen(false)}
          footer={<Button variant="secondary" size="sm" onClick={() => void check()}>Check again</Button>}
        >
          <div className="flex items-center gap-3 rounded-card border border-line bg-surface-sunken px-3 py-2.5">
            <Server className="size-4 text-fg-muted" />
            <span className="flex-1 text-sm text-fg">Avalok server</span>
            <StatusDot status={dot} label={state === 'ok' ? 'Reachable' : state === 'down' ? 'Unreachable' : 'Checking'} />
          </div>
          {checkedAt && (
            <p className="mt-3 text-xs text-fg-muted">
              Last checked {checkedAt.toLocaleTimeString()} · refreshes every 30s
            </p>
          )}
        </Modal>
      )}
    </>
  )
}
