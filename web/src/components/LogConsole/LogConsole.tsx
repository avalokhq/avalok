import { ArrowLeft, FolderOpen } from 'lucide-react'
import IconButton from '../ui/IconButton'
import Button from '../ui/Button'
import StatusDot from '../ui/StatusDot'
import LogView from './LogView'

interface Props {
  workspace?: string
  environment?: string
  service?: string
  streamUrl?: string
  label: string
  onBack: () => void
  hasLogDir?: boolean
  onBrowseFiles?: () => void
  maxLines?: number
  resourceName?: string
  objectKey?: string
}

/** Full-page log viewer for one source. */
export default function LogConsole({ label, onBack, hasLogDir, onBrowseFiles, ...sourceProps }: Props) {
  const { workspace, environment, service, objectKey } = sourceProps

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <LogView
        {...sourceProps}
        facets
        exportName={`${service || objectKey || 'logs'}-${environment || 'export'}.log`}
        header={source => (
          <div className="flex h-12 shrink-0 items-center gap-3 border-b border-line bg-surface px-3">
            <IconButton label="Back" size="md" onClick={onBack}>
              <ArrowLeft className="size-4" />
            </IconButton>

            <div className="flex min-w-0 items-baseline gap-2">
              <h1 className="truncate text-base font-semibold text-fg">{label}</h1>
              {workspace && (
                <span className="hidden truncate text-xs text-fg-muted sm:inline">
                  {workspace} / {environment} / {service}
                </span>
              )}
            </div>

            <div className="ml-auto flex items-center gap-3">
              <StatusDot status={source.status.status} label={source.status.label} />
              {hasLogDir && onBrowseFiles && (
                <Button size="sm" variant="secondary" leftIcon={<FolderOpen />} onClick={onBrowseFiles}>
                  Log files
                </Button>
              )}
            </div>
          </div>
        )}
      />
    </div>
  )
}
