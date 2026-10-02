import { X } from 'lucide-react'
import IconButton from '../ui/IconButton'
import SourceDot from '../ui/SourceDot'
import StatusDot from '../ui/StatusDot'
import LogView from './LogView'

interface Props {
  workspace: string
  environment: string
  service: string
  label: string
  panelId: string
  streamUrl?: string
  onClose: () => void
  maxLines?: number
  resourceName?: string
  objectKey?: string
}

/** Compact log viewer for one pane of the split dashboard. */
export default function LogPanel({ label, panelId, onClose, ...sourceProps }: Props) {
  const { environment, service, objectKey } = sourceProps

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-card border border-line bg-surface shadow-sm">
      <LogView
        {...sourceProps}
        compact
        exportName={`${service || objectKey || 'logs'}-${environment || 'export'}.log`}
        header={source => (
          <div className="flex h-9 shrink-0 items-center gap-2 border-b border-line bg-surface-sunken pr-1 pl-3">
            <SourceDot name={panelId} />
            <span className="min-w-0 flex-1 truncate text-xs font-medium text-fg" title={label}>{label}</span>
            <span className="hidden max-w-48 truncate text-2xs text-fg-muted sm:inline">{environment}</span>
            <StatusDot status={source.status.status} label={source.status.label} className="text-2xs" />
            <IconButton label="Close pane" size="xs" variant="danger" onClick={onClose}>
              <X className="size-3.5" />
            </IconButton>
          </div>
        )}
      />
    </div>
  )
}
