import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import Alert from '../ui/Alert'
import LogToolbar from './LogToolbar'
import LogLines from './LogLines'
import LogFacets from './LogFacets'
import { useLogSource, type LogSource, type LogSourceProps } from './useLogSource'
import { useLogViewState } from './useLogViewState'

interface Props extends LogSourceProps {
  /** Header row above the toolbar; receives the live source for status and pause state. */
  header: (source: LogSource) => React.ReactNode
  /** Download name for "Export visible lines". */
  exportName: string
  /** Full-page layout: facet sidebar and level counts. */
  facets?: boolean
  /** Narrow split pane. */
  compact?: boolean
}

const displaySource = (e: { source: string; instance: string }) => e.instance || e.source

/** One service's logs: data source, toolbar, optional facet sidebar and the log table. */
export default function LogView({ header, exportName, facets, compact, ...sourceProps }: Props) {
  const source = useLogSource(sourceProps)
  const view = useLogViewState({
    logs: source.logs,
    version: source.version,
    historyEndIndex: source.historyEndIndex,
    sourceOf: displaySource,
  })
  const [facetsOpen, setFacetsOpen] = useState(() => !!facets && localStorage.getItem('avalok-log-facets') !== 'false')

  const toggleFacets = () => {
    setFacetsOpen(open => {
      localStorage.setItem('avalok-log-facets', String(!open))
      return !open
    })
  }

  return (
    <>
      {header(source)}

      {source.notice && (
        <div role="status" className="flex shrink-0 items-center justify-center gap-2 border-b border-line bg-info-soft px-3 py-1.5 text-xs text-info">
          <Loader2 className="size-3.5 animate-spin" />
          {source.notice}
        </div>
      )}

      {source.error && (
        <Alert tone="danger" className="m-2 shrink-0">Couldn't load the file: {source.error}</Alert>
      )}

      <LogToolbar
        view={view}
        paused={source.paused}
        onTogglePause={source.togglePause}
        onClear={source.clear}
        onExport={() => view.exportLines(exportName)}
        viewMode={source.viewMode}
        onViewModeChange={source.setViewMode}
        hasFileMode={source.hasFileMode}
        facetsOpen={facets ? facetsOpen : undefined}
        onToggleFacets={facets ? toggleFacets : undefined}
        compact={compact}
      />

      <div className="flex min-h-0 flex-1">
        {facets && facetsOpen && <LogFacets view={view} />}
        <div className="min-w-0 flex-1">
          <LogLines view={view} connected={source.connected} paused={source.paused} />
        </div>
      </div>
    </>
  )
}
