import { useState, useEffect, useRef, useCallback } from 'react'
import { ArrowLeft, Search, FolderOpen, Loader2 } from 'lucide-react'
import { listLogFiles } from '../../lib/api'
import type { LogFile } from '../../lib/types'
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

export default function FileBrowser({ workspace, environment, service, label, onBack }: Props) {
  const [files, setFiles] = useState<LogFile[]>([])
  const [logDir, setLogDir] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [showSearch, setShowSearch] = useState(false)
  const [panelWidth, setPanelWidth] = useState(() => {
    const saved = localStorage.getItem('avalok-fb-panel-w')
    return saved ? Math.max(180, Math.min(600, parseInt(saved, 10))) : 256
  })
  const dragging = useRef(false)
  const startX = useRef(0)
  const startW = useRef(0)

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    dragging.current = true
    startX.current = e.clientX
    startW.current = panelWidth
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }, [panelWidth])

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging.current) return
    const delta = e.clientX - startX.current
    const next = Math.max(180, Math.min(600, startW.current + delta))
    setPanelWidth(next)
  }, [])

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    if (!dragging.current) return
    dragging.current = false
    ;(e.target as HTMLElement).releasePointerCapture(e.pointerId)
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
    localStorage.setItem('avalok-fb-panel-w', String(panelWidth))
  }, [panelWidth])

  useEffect(() => {
    setLoading(true)
    setError(null)
    listLogFiles(workspace, environment, service)
      .then(res => {
        setFiles(res.files)
        setLogDir(res.log_dir)
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [workspace, environment, service])

  function handleSearchNavigate(file: string, _line: number) {
    setSelectedFile(file)
    setShowSearch(false)
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-6 h-6 text-[var(--text-accent)] animate-spin" />
          <span className="text-sm text-[var(--text-secondary)]">Loading files...</span>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="text-sm text-red-400">{error}</div>
          <button
            onClick={onBack}
            className="text-xs text-[var(--text-accent)] hover:underline"
          >
            Go back
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 h-10 shrink-0 border-b border-[var(--border-default)] bg-[var(--bg-surface)]">
        <button
          onClick={onBack}
          className="p-1 rounded-md text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-2 min-w-0">
          <FolderOpen className="w-4 h-4 text-[var(--text-accent)] shrink-0" />
          <span className="text-base text-[var(--text-primary)] truncate">{label}</span>
          <span className="text-xs text-[var(--text-muted)] shrink-0">
            {workspace} / {environment} / {service}
          </span>
        </div>

        <div className="ml-auto flex items-center gap-1">
          <button
            onClick={() => setShowSearch(v => !v)}
            className={`p-1.5 rounded-md transition-colors ${
              showSearch
                ? 'text-[var(--text-accent)] bg-[var(--bg-active)]'
                : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
            }`}
            title="Search files"
          >
            <Search className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* Left panel: file list or search */}
        <div className="shrink-0 border-r border-[var(--border-default)] bg-[var(--bg-app)] flex flex-col" style={{ width: panelWidth }}>
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

        {/* Resize handle */}
        <div
          className="w-1 shrink-0 cursor-col-resize hover:bg-[var(--text-accent)] active:bg-[var(--text-accent)] transition-colors"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        />

        {/* Right panel: file viewer */}
        <div className="flex-1 flex flex-col min-w-0 bg-[var(--bg-app)]">
          {selectedFile ? (
            <FileViewer
              workspace={workspace}
              environment={environment}
              service={service}
              filename={selectedFile}
            />
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="flex flex-col items-center gap-3 text-[var(--text-muted)]">
                <FolderOpen className="w-10 h-10 opacity-30" />
                <span className="text-sm">Select a file to view</span>
                <span className="text-xs opacity-60">
                  {files.length} files in {logDir}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
