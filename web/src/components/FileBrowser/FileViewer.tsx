import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { Download, FileDown, FileText, Search, ChevronUp, ChevronDown } from 'lucide-react'
import { cn } from '../../lib/cn'
import { formatBytes } from '../../lib/format'
import { readFilePage, fileDownloadURL } from '../../lib/api'
import type { FilePage } from '../../lib/types'
import Alert from '../ui/Alert'
import Button from '../ui/Button'
import EmptyState from '../ui/EmptyState'
import IconButton from '../ui/IconButton'
import Skeleton from '../ui/Skeleton'
import Tooltip from '../ui/Tooltip'
import { SpinnerIcon } from '../ui/Spinner'
import { SearchInput } from '../ui/Input'
import FilePagination from './FilePagination'

interface Props {
  workspace: string
  environment: string
  service: string
  filename: string
}

// Line-length pattern for the loading skeleton, so it reads like a file rather than a block.
const SKELETON_WIDTHS = ['w-3/4', 'w-1/2', 'w-5/6', 'w-2/3', 'w-1/3', 'w-4/5', 'w-3/5', 'w-1/2', 'w-2/3', 'w-3/4', 'w-2/5', 'w-5/6']

function highlightMatches(line: string, query: string): React.ReactNode {
  if (!query) return line
  const idx = line.toLowerCase().indexOf(query.toLowerCase())
  if (idx === -1) return line
  return (
    <>
      {line.slice(0, idx)}
      <mark className="rounded-control bg-warning-soft px-0.5 text-fg">{line.slice(idx, idx + query.length)}</mark>
      {highlightMatches(line.slice(idx + query.length), query)}
    </>
  )
}

export default function FileViewer({ workspace, environment, service, filename }: Props) {
  const [data, setData] = useState<FilePage | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [reloadKey, setReloadKey] = useState(0)
  const contentRef = useRef<HTMLDivElement>(null)

  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [currentMatch, setCurrentMatch] = useState(0)

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
      .catch(err => setError(err instanceof Error ? err.message : 'Failed to read file'))
      .finally(() => setLoading(false))
  }, [workspace, environment, service, filename, page, reloadKey])

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

  // O(1) per-row lookup while rendering (was matchingLines.includes per line).
  const matchSet = useMemo(() => new Set(matchingLines), [matchingLines])

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

  function closeSearch() {
    setSearchOpen(false)
    setSearchQuery('')
  }

  function handleSearchKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (e.shiftKey) prevMatch()
      else nextMatch()
    }
    if (e.key === 'Escape') closeSearch()
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

  if (error) {
    return (
      <div className="flex-1 p-4">
        <Alert
          tone="danger"
          title={`Couldn't read ${filename}`}
          action={<Button size="sm" variant="secondary" onClick={() => setReloadKey(k => k + 1)} loading={loading}>Retry</Button>}
        >
          {error}
        </Alert>
      </div>
    )
  }

  if (loading && !data) {
    return (
      <div className="flex min-h-0 flex-1 flex-col" aria-busy="true">
        <div className="flex h-11 shrink-0 items-center gap-3 border-b border-line bg-surface px-3">
          <Skeleton.Line width="w-48" />
          <Skeleton.Line width="w-12" className="h-2.5" />
        </div>
        <div className="flex-1 space-y-2.5 bg-surface-sunken p-4">
          {SKELETON_WIDTHS.map((w, i) => <Skeleton.Line key={i} width={w} />)}
        </div>
      </div>
    )
  }

  if (!data) return null

  const lines = data.lines || []
  const startLine = (data.page - 1) * data.page_size + 1
  const lastLine = startLine + Math.max(lines.length, 1) - 1
  // Gutter grows with the widest line number on the page (+1ch breathing room).
  const gutterWidth = `${String(lastLine).length + 1}ch`
  const currentLineIdx = matchingLines[currentMatch]
  const downloadUrl = fileDownloadURL(workspace, environment, service, filename)
  const isLarge = data.file_size > 100 * 1024 * 1024 && data.page === 1

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* File header */}
      <div className="flex h-11 shrink-0 items-center gap-3 border-b border-line bg-surface px-3">
        <FileText className="size-4 shrink-0 text-fg-muted" />
        <span className="truncate font-mono text-xs font-medium text-fg" title={filename}>{filename}</span>
        <span className="shrink-0 text-xs text-fg-muted tabular-nums">{formatBytes(data.file_size)}</span>

        {loading && <SpinnerIcon size="sm" />}

        <div className="ml-auto flex items-center gap-1">
          <IconButton
            label="Search in page"
            active={searchOpen}
            onClick={() => (searchOpen ? closeSearch() : setSearchOpen(true))}
          >
            <Search className="size-4" />
          </IconButton>
          <IconButton label="Download this page" onClick={downloadPage}>
            <FileDown className="size-4" />
          </IconButton>
          <Tooltip content="Download full file">
            <a
              href={downloadUrl}
              download
              aria-label="Download full file"
              className="inline-flex size-7 shrink-0 items-center justify-center rounded-control text-fg-muted transition-colors duration-150 hover:bg-hover hover:text-fg"
            >
              <Download className="size-4" />
            </a>
          </Tooltip>
        </div>
      </div>

      {/* Search bar */}
      {searchOpen && (
        <div className="flex shrink-0 items-center gap-2 border-b border-line bg-surface px-3 py-2">
          <SearchInput
            value={searchQuery}
            onChange={setSearchQuery}
            onKeyDown={handleSearchKeyDown}
            placeholder="Search in page…"
            aria-label="Search in page"
            autoFocus
            wrapperClassName="min-w-0 flex-1"
          />
          {searchQuery && (
            <span className="shrink-0 text-xs text-fg-muted tabular-nums" aria-live="polite">
              {matchingLines.length > 0 ? `${currentMatch + 1} of ${matchingLines.length}` : 'No matches'}
            </span>
          )}
          <IconButton label="Previous match (Shift+Enter)" onClick={prevMatch} disabled={matchingLines.length === 0}>
            <ChevronUp className="size-4" />
          </IconButton>
          <IconButton label="Next match (Enter)" onClick={nextMatch} disabled={matchingLines.length === 0}>
            <ChevronDown className="size-4" />
          </IconButton>
        </div>
      )}

      {/* Decompression / large file warnings */}
      {(data.warning || isLarge) && (
        <div className="flex shrink-0 flex-col gap-2 border-b border-line bg-surface px-3 py-2">
          {data.warning && <Alert tone="warning">{data.warning}</Alert>}
          {isLarge && (
            <Alert tone="warning">
              Large file ({formatBytes(data.file_size)}). Content is split into {data.total_pages.toLocaleString()} pages.
            </Alert>
          )}
        </div>
      )}

      {/* Content */}
      <div
        ref={contentRef}
        className="min-h-0 flex-1 select-text overflow-auto bg-surface-sunken font-mono text-xs leading-5"
      >
        {lines.length === 0 ? (
          <EmptyState compact tone="neutral" icon={<FileText />} title="File is empty" />
        ) : (
          <table className="w-full border-collapse">
            <tbody>
              {lines.map((line, i) => {
                const isMatch = searchQuery !== '' && matchSet.has(i)
                const isCurrentMatch = isMatch && currentLineIdx === i
                return (
                  <tr
                    key={i}
                    className={cn('group transition-colors hover:bg-hover', isCurrentMatch && 'bg-warning-soft hover:bg-warning-soft')}
                  >
                    <td
                      style={{ width: gutterWidth }}
                      className={cn(
                        'box-content select-none border-r border-line py-0 pl-3 pr-2 text-right align-top tabular-nums',
                        isCurrentMatch ? 'text-warning' : 'text-fg-faint group-hover:text-fg-muted',
                      )}
                    >
                      {startLine + i}
                    </td>
                    <td className="whitespace-pre-wrap break-all px-3 py-0 text-fg">
                      {isMatch ? highlightMatches(line, searchQuery) : line}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
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
