import { useState } from 'react'
import { Clock, X, ChevronDown } from 'lucide-react'
import { cn } from '../../lib/cn'
import Popover from '../ui/Popover'
import SegmentedControl from '../ui/SegmentedControl'
import Button from '../ui/Button'
import IconButton from '../ui/IconButton'
import Input, { Select } from '../ui/Input'

export type TimeSource = 'live' | 'log'

export interface TimeFilterValue {
  since?: string
  until?: string
  source: TimeSource
}

type Mode = 'relative' | 'absolute'

interface RelativeState {
  amount: number
  unit: 'minutes' | 'hours' | 'days'
}

const PRESETS: { label: string; amount: number; unit: RelativeState['unit'] }[] = [
  { label: '5m', amount: 5, unit: 'minutes' },
  { label: '15m', amount: 15, unit: 'minutes' },
  { label: '30m', amount: 30, unit: 'minutes' },
  { label: '1h', amount: 1, unit: 'hours' },
  { label: '6h', amount: 6, unit: 'hours' },
  { label: '24h', amount: 24, unit: 'hours' },
  { label: '7d', amount: 7, unit: 'days' },
]

function computeSince(rel: RelativeState): string {
  const ms = rel.amount * (rel.unit === 'minutes' ? 60 : rel.unit === 'hours' ? 3600 : 86400) * 1000
  return new Date(Date.now() - ms).toISOString()
}

function toLocalDatetime(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function formatActiveLabel(mode: Mode, rel: RelativeState, absFrom: string, absTo: string): string {
  if (mode === 'relative') {
    const u = rel.unit === 'minutes' ? 'min' : rel.unit === 'hours' ? 'hr' : 'd'
    return `Last ${rel.amount}${u}`
  }
  const fmt = (v: string) => new Date(v).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })
  return `${absFrom ? fmt(absFrom) : '…'} – ${absTo ? fmt(absTo) : 'now'}`
}

const SOURCE_OPTIONS = [
  { value: 'live' as const, label: 'Received', title: 'When Avalok received the line' },
  { value: 'log' as const, label: 'Log time', title: 'Timestamp parsed from the log line' },
]

const MODE_OPTIONS = [
  { value: 'relative' as const, label: 'Relative' },
  { value: 'absolute' as const, label: 'Absolute' },
]

function FieldLabel({ children, htmlFor }: { children: React.ReactNode; htmlFor?: string }) {
  return <label htmlFor={htmlFor} className="mb-1 block text-2xs font-medium uppercase tracking-wide text-fg-muted">{children}</label>
}

interface Props {
  value: TimeFilterValue
  onChange: (v: TimeFilterValue) => void
}

export default function TimeFilter({ value, onChange }: Props) {
  const [mode, setMode] = useState<Mode>('relative')
  const [rel, setRel] = useState<RelativeState>({ amount: 15, unit: 'minutes' })
  const [absFrom, setAbsFrom] = useState('')
  const [absTo, setAbsTo] = useState('')
  const active = !!(value.since || value.until)
  const nowLocal = toLocalDatetime(new Date())

  return (
    <div className="flex items-center">
      <Popover
        label="Time range"
        trigger={({ open, toggle }) => (
          <button
            type="button"
            onClick={toggle}
            aria-expanded={open}
            aria-haspopup="dialog"
            className={cn(
              'inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-control border px-2 text-xs font-medium transition-colors',
              active || open
                ? 'border-accent-line bg-accent-soft text-accent'
                : 'border-line bg-surface text-fg-secondary hover:bg-hover hover:text-fg',
            )}
          >
            <Clock className="size-3.5 shrink-0" />
            <span className="max-w-40 truncate">{active ? formatActiveLabel(mode, rel, absFrom, absTo) : 'Any time'}</span>
            {value.source === 'log' && <span className="text-2xs text-fg-muted">log time</span>}
            <ChevronDown className="size-3.5 shrink-0 opacity-70" />
          </button>
        )}
      >
        {close => {
          const applyRelative = (r: RelativeState = rel) => {
            setRel(r)
            onChange({ since: computeSince(r), source: value.source })
            close()
          }
          const applyAbsolute = () => {
            if (!absFrom) return
            onChange({ since: new Date(absFrom).toISOString(), until: absTo ? new Date(absTo).toISOString() : undefined, source: value.source })
            close()
          }
          return (
            <>
              <div className="space-y-2 border-b border-line bg-surface-sunken p-3">
                <FieldLabel>Filter by</FieldLabel>
                <SegmentedControl size="sm" label="Timestamp source" className="w-full" options={SOURCE_OPTIONS} value={value.source} onChange={source => onChange({ ...value, source })} />
              </div>

              <div className="space-y-3 p-3">
                <SegmentedControl size="sm" label="Range type" className="w-full" options={MODE_OPTIONS} value={mode} onChange={setMode} />

                {mode === 'relative' ? (
                  <>
                    <div className="flex flex-wrap gap-1.5">
                      {PRESETS.map(p => {
                        const selected = active && rel.amount === p.amount && rel.unit === p.unit
                        return (
                          <button
                            key={p.label}
                            type="button"
                            aria-pressed={selected}
                            onClick={() => applyRelative({ amount: p.amount, unit: p.unit })}
                            className={cn(
                              'h-7 cursor-pointer rounded-control border px-2.5 text-xs font-medium tabular-nums transition-colors',
                              selected ? 'border-accent-line bg-accent-soft text-accent' : 'border-line bg-surface text-fg-secondary hover:bg-hover hover:text-fg',
                            )}
                          >
                            {p.label}
                          </button>
                        )
                      })}
                    </div>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min={1}
                        aria-label="Amount"
                        value={rel.amount}
                        onChange={e => setRel(prev => ({ ...prev, amount: Math.max(1, parseInt(e.target.value) || 1) }))}
                        className="w-16 text-center tabular-nums"
                      />
                      <Select
                        aria-label="Unit"
                        value={rel.unit}
                        onChange={e => setRel(prev => ({ ...prev, unit: e.target.value as RelativeState['unit'] }))}
                        className="flex-1"
                      >
                        <option value="minutes">minutes ago</option>
                        <option value="hours">hours ago</option>
                        <option value="days">days ago</option>
                      </Select>
                      <Button size="md" onClick={() => applyRelative()}>Apply</Button>
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <FieldLabel htmlFor="tf-from">From</FieldLabel>
                      <Input id="tf-from" type="datetime-local" value={absFrom} max={nowLocal} onChange={e => setAbsFrom(e.target.value)} />
                    </div>
                    <div>
                      <FieldLabel htmlFor="tf-to">To <span className="normal-case tracking-normal">(empty = now)</span></FieldLabel>
                      <Input id="tf-to" type="datetime-local" value={absTo} max={nowLocal} onChange={e => setAbsTo(e.target.value)} />
                    </div>
                    <Button className="w-full" onClick={applyAbsolute} disabled={!absFrom}>Apply range</Button>
                  </>
                )}
              </div>
            </>
          )
        }}
      </Popover>

      {active && (
        <IconButton label="Clear time filter" size="xs" className="ml-0.5" onClick={() => onChange({ source: value.source })}>
          <X className="size-3.5" />
        </IconButton>
      )}
    </div>
  )
}
