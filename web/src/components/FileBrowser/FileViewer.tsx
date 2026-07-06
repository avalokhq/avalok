import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { AlertTriangle, Download, FileDown, Loader2, Search, X, ChevronUp, ChevronDown } from 'lucide-react'
import { cn } from '../../lib/cn'
import { readFilePage, fileDownloadURL } from '../../lib/api'
import type { FilePage } from '../../lib/types'
import FilePagination from './FilePagination'

interface Props {
  workspace: string
  environment: string
  service: string
  filename: string
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
}

function highlightMatches(line: string, query: string): React.ReactNode {
  if (!query) return line
  const idx = line.toLowerCase().indexOf(query.toLowerCase())
  if (idx === -1) return line
  return (
    <>
      {line.slice(0, idx)}
      <mark className="bg-amber-400/30 text-inherit rounded-sm px-0.5">{line.slice(idx, idx + query.length)}</mark>
      {highlightMatches(line.slice(idx + query.length), query)}
    </>
  )
}

export default function FileViewer({ workspace, environment, service, filename }: Props) {
  const [data, setData] = useState<FilePage | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const contentRef = useRef<HTMLDivElement>(null)

  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [currentMatch, setCurrentMatch] = useState(0)
  const searchInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setPage(1)
    setData(null)
    setError(null)
    setSearchOpen(false)
    setSearchQuery('')
  }, [filename])

  useEffect(() => {
    setLoading(true)
    setError(null)
    readFilePage(workspace, environment, service, filename, page)
      .then(setData)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [workspace, environment, service, filename, page])

  useEffect(() => {
    contentRef.current?.scrollTo(0, 0)
  }, [page])

  const matchingLines = useMemo(() => {
    if (!searchQuery || !data?.lines) return []
    const q = searchQuery.toLowerCase()
    const indices: number[] = []
    data.lines.forEach((line, i) => {
      if (line.toLowerCase().includes(q)) indices.push(i)
    })
    return indices
  }, [searchQuery, data?.lines])

  useEffect(() => {
    setCurrentMatch(0)
  }, [searchQuery])

  const scrollToMatch = useCallback((idx: number) => {
    if (matchingLines.length === 0) return
    const lineIdx = matchingLines[idx]
    const rows = contentRef.current?.querySelectorAll('tr')
    if (rows && rows[lineIdx]) {
      rows[lineIdx].scrollIntoView({ block: 'center', behavior: 'smooth' })
    }
  }, [matchingLines])

  function nextMatch() {
    if (matchingLines.length === 0) return
    const next = (currentMatch + 1) % matchingLines.length
    setCurrentMatch(next)
    scrollToMatch(next)
  }

  function prevMatch() {
    if (matchingLines.length === 0) return
    const prev = (currentMatch - 1 + matchingLines.length) % matchingLines.length
    setCurrentMatch(prev)
    scrollToMatch(prev)
  }

  function handleSearchKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (e.shiftKey) prevMatch()
      else nextMatch()
    }
    if (e.key === 'Escape') {
      setSearchOpen(false)
      setSearchQuery('')
    }
  }

  function downloadPage() {
    if (!data?.lines) return
    const startLine = (data.page - 1) * data.page_size + 1
    const text = data.lines.map((line, i) => `${startLine + i}: ${line}`).join('\n')
    const blob = new Blob([text], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    const base = filename.replace(/\.[^.]+$/, '')
    a.download = `${base}_page${data.page}.txt`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  function handlePageChange(newPage: number) {
    setPage(newPage)
  }

  if (loading && !data) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-6 h-6 text-[var(--text-accent)] animate-spin" />
          <span className="text-sm text-[var(--text-secondary)]">Loading file...</span>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-sm text-red-400">{error}</div>
      </div>
    )
  }

  if (!data) return null

  const startLine = (data.page - 1) * data.page_size + 1
  const downloadUrl = fileDownloadURL(workspace, environment, service, filename)

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* File header */}
      <div className="flex items-center gap-3 px-3 py-1.5 border-b border-[var(--border-default)] bg-[var(--bg-surface)]">
        <span className="text-xs font-medium text-[var(--text-primary)] truncate">{filename}</span>
        <span className="text-[10px] text-[var(--text-muted)] shrink-0">{formatSize(data.file_size)}</span>

        {loading && <Loader2 className="w-3 h-3 text-[var(--text-accent)] animate-spin shrink-0" />}

        <div className="ml-auto flex items-center gap-1">
          <button
            onClick={() => { setSearchOpen(v => !v); if (!searchOpen) setTimeout(() => searchInputRef.current?.focus(), 0) }}
            className={cn(
              'p-1 rounded transition-colors shrink-0',
              searchOpen
                ? 'text-[var(--text-accent)] bg-[var(--bg-active)]'
                : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
            )}
            title="Search in file"
          >
            <Search className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={downloadPage}
            className="p-1 rounded text-[var(--text-muted)] hover:text-blue-400 hover:bg-blue-500/10 transition-colors shrink-0"
            title="Download this page"
          >
            <FileDown className="w-3.5 h-3.5" />
          </button>
          <a
            href={downloadUrl}
            download
            className="p-1 rounded text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 transition-colors shrink-0"
            title="Download full file"
          >
            <Download className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>

      {/* Search bar */}
      {searchOpen && (
        <div className="flex items-center gap-2 px-3 py-1.5 border-b border-[var(--border-default)] bg-[var(--bg-surface)]">
          <Search className="w-3 h-3 text-[var(--text-muted)] shrink-0" />
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            placeholder="Search in page..."
            className="flex-1 text-xs bg-transparent text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none"
          />
          {searchQuery && (
            <span className="text-[10px] text-[var(--text-muted)] shrink-0">
              {matchingLines.length > 0 ? `${currentMatch + 1}/${matchingLines.length}` : 'No matches'}
            </span>
          )}
          <button onClick={prevMatch} disabled={matchingLines.length === 0} className="p-0.5 rounded text-[var(--text-muted)] hover:text-[var(--text-secondary)] disabled:opacity-30" title="Previous match">
            <ChevronUp className="w-3.5 h-3.5" />
          </button>
          <button onClick={nextMatch} disabled={matchingLines.length === 0} className="p-0.5 rounded text-[var(--text-muted)] hover:text-[var(--text-secondary)] disabled:opacity-30" title="Next match">
            <ChevronDown className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => { setSearchOpen(false); setSearchQuery('') }}
            className="p-0.5 rounded text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Decompression warning */}
      {data.warning && (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-500/10 border-b border-amber-500/20">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <span className="text-[11px] text-amber-300">{data.warning}</span>
        </div>
      )}

      {/* Large file warning */}
      {data.file_size > 100 * 1024 * 1024 && data.page === 1 && (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-500/10 border-b border-amber-500/20">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <span className="text-[11px] text-amber-300">
            Large file ({formatSize(data.file_size)}). Content is split into {data.total_pages} pages.
          </span>
        </div>
      )}

      {/* Content */}
      <div
        ref={contentRef}
        className="flex-1 overflow-auto font-mono text-xs leading-5 select-text"
      >
        <table className="w-full border-collapse">
          <tbody>
            {(data.lines || []).map((line, i) => {
              const isMatch = searchQuery && matchingLines.includes(i)
              const isCurrentMatch = isMatch && matchingLines[currentMatch] === i
              return (
                <tr
                  key={i}
                  className={cn(
                    'hover:bg-[var(--bg-hover)] group',
                    isCurrentMatch && 'bg-amber-400/10',
                    isMatch && !isCurrentMatch && 'bg-amber-400/5'
                  )}
                >
                  <td className="px-3 py-0 text-right text-[var(--text-muted)] select-none w-12 shrink-0 align-top opacity-50 group-hover:opacity-100">
                    {startLine + i}
                  </td>
                  <td className="px-2 py-0 text-[var(--text-primary)] whitespace-pre-wrap break-all">
                    {searchQuery ? highlightMatches(line, searchQuery) : line}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {data.lines?.length === 0 && (
          <div className="flex items-center justify-center py-12 text-sm text-[var(--text-muted)]">
            File is empty
          </div>
        )}
      </div>

      {/* Pagination */}
      {data.total_pages > 1 && (
        <FilePagination
          page={data.page}
          totalPages={data.total_pages}
          totalLines={data.total_lines}
          onPageChange={handlePageChange}
        />
      )}
    </div>
  )
}
