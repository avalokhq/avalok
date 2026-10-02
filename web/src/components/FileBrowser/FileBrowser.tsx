import { useState, useEffect, useRef } from 'react'
import { ArrowLeft, Search, FolderOpen } from 'lucide-react'
import { listLogFiles } from '../../lib/api'
import { plural } from '../../lib/format'
import type { LogFile } from '../../lib/types'
import Alert from '../ui/Alert'
import Button from '../ui/Button'
import EmptyState from '../ui/EmptyState'
import IconButton from '../ui/IconButton'
import ResizeHandle from '../ui/ResizeHandle'
import Skeleton from '../ui/Skeleton'
import FileList from './FileList'
import FileViewer from './FileViewer'
import FileSearch from './FileSearch'

interface Props {
  workspace: string
  environment: string
  service: string
  label: string
  onBack: () => void
}

const PANEL_KEY = 'avalok-fb-panel-w'
const PANEL_MIN = 240
const PANEL_MAX = 720

const clampWidth = (w: number) => Math.max(PANEL_MIN, Math.min(PANEL_MAX, w))

export default function FileBrowser({ workspace, environment, service, label, onBack }: Props) {
  const [files, setFiles] = useState<LogFile[]>([])
  const [logDir, setLogDir] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [showSearch, setShowSearch] = useState(false)
  const [panelWidth, setPanelWidth] = useState(() => {
    const saved = parseInt(localStorage.getItem(PANEL_KEY) || '', 10)
    // Wider default than before: the list is now a Name / Size / Modified table.
    return Number.isFinite(saved) ? clampWidth(saved) : 360
  })
  // Mirrors panelWidth so onResizeEnd persists the latest value (keyboard resize calls it synchronously).
  const widthRef = useRef(panelWidth)

  useEffect(() => {
    setLoading(true)
    setError(null)
    listLogFiles(workspace, environment, service)
      .then(res => {
        setFiles(res.files)
        setLogDir(res.log_dir)
      })
      .catch(err => setError(err instanceof Error ? err.message : 'Failed to list files'))
      .finally(() => setLoading(false))
  }, [workspace, environment, service, reloadKey])

  function handleResize(delta: number) {
    const next = clampWidth(widthRef.current + delta)
    widthRef.current = next
    setPanelWidth(next)
  }

  function handleSearchNavigate(file: string, _line: number) {
    setSelectedFile(file)
    setShowSearch(false)
  }

  let body: React.ReactNode
  if (error) {
    body = (
      <div className="flex-1 p-6">
        <Alert
          tone="danger"
          title="Couldn't load files"
          action={
            <div className="flex items-center gap-2">
              <Button size="sm" variant="ghost" onClick={onBack}>Go back</Button>
              <Button size="sm" variant="secondary" onClick={() => setReloadKey(k => k + 1)} loading={loading}>Retry</Button>
            </div>
          }
        >
          {error}
        </Alert>
      </div>
    )
  } else if (loading) {
    // Same split shape as the loaded browser.
    body = (
      <div className="flex min-h-0 flex-1" aria-busy="true">
        <div className="flex shrink-0 flex-col gap-3 border-r border-line bg-surface p-3" style={{ width: panelWidth }}>
          <Skeleton.Line width="w-2/3" />
          <Skeleton className="h-8 !rounded-control" />
          {Array.from({ length: 8 }, (_, i) => <Skeleton.Line key={i} width={i % 3 === 0 ? 'w-4/5' : 'w-3/5'} />)}
        </div>
        <div className="flex-1 bg-surface-sunken" />
      </div>
    )
  } else {
    body = (
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Left panel: file list or search */}
        <div className="flex shrink-0 flex-col bg-surface" style={{ width: panelWidth }}>
          {showSearch ? (
            <FileSearch
              workspace={workspace}
              environment={environment}
              service={service}
              onNavigate={handleSearchNavigate}
              onClose={() => setShowSearch(false)}
            />
          ) : (
            <FileList
              files={files}
              logDir={logDir}
              selected={selectedFile}
              onSelect={setSelectedFile}
            />
          )}
        </div>

        <ResizeHandle
          label="Resize file list"
          onResize={handleResize}
          onResizeEnd={() => localStorage.setItem(PANEL_KEY, String(widthRef.current))}
        />

        {/* Right panel: file viewer */}
        <div className="flex min-w-0 flex-1 flex-col bg-surface-sunken">
          {selectedFile ? (
            <FileViewer
              workspace={workspace}
              environment={environment}
              service={service}
              filename={selectedFile}
            />
          ) : (
            <div className="flex flex-1 items-center justify-center">
              <EmptyState
                tone="neutral"
                icon={<FolderOpen />}
                title="Select a file to view"
                description={<>{plural(files.length, 'file')} in <span className="font-mono text-xs">{logDir}</span></>}
              />
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Header */}
      <div className="flex h-12 shrink-0 items-center gap-3 border-b border-line bg-surface px-4">
        <IconButton label="Back" onClick={onBack}>
          <ArrowLeft className="size-4" />
        </IconButton>

        <div className="flex min-w-0 items-center gap-2">
          <FolderOpen className="size-4 shrink-0 text-accent" />
          <span className="truncate text-base font-semibold text-fg">{label}</span>
          <span className="shrink-0 truncate text-xs text-fg-muted">
            {workspace} / {environment} / {service}
          </span>
        </div>

        <div className="ml-auto flex items-center gap-1">
          <IconButton
            label="Search files"
            active={showSearch}
            disabled={loading || !!error}
            onClick={() => setShowSearch(v => !v)}
          >
            <Search className="size-4" />
          </IconButton>
        </div>
      </div>

      {body}
    </div>
  )
}
