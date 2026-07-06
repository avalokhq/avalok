import { useState, useCallback } from 'react'
import { Search, X, FileText, Loader2 } from 'lucide-react'
import { cn } from '../../lib/cn'
import { searchFiles } from '../../lib/api'
import type { FileSearchResult } from '../../lib/types'

interface Props {
  workspace: string
  environment: string
  service: string
  onNavigate: (file: string, line: number) => void
  onClose: () => void
}

export default function FileSearch({ workspace, environment, service, onNavigate, onClose }: Props) {
  const [query, setQuery] = useState('')
  const [useRegex, setUseRegex] = useState(false)
  const [results, setResults] = useState<FileSearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [truncated, setTruncated] = useState(false)
  const [searched, setSearched] = useState(false)

  const handleSearch = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    if (!query.trim()) return

    setLoading(true)
    setSearched(true)
    try {
      const res = await searchFiles(workspace, environment, service, {
        pattern: query,
        use_regex: useRegex,
        max_hits: 500,
      })
      setResults(res.results)
      setTruncated(res.truncated)
    } catch {
      setResults([])
    } finally {
      setLoading(false)
    }
  }, [workspace, environment, service, query, useRegex])

  const grouped = results.reduce<Record<string, FileSearchResult[]>>((acc, r) => {
    if (!acc[r.file]) acc[r.file] = []
    acc[r.file].push(r)
    return acc
  }, {})

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2 border-b border-[var(--border-default)]">
        <div className="flex items-center gap-2 mb-2">
          <Search className="w-3.5 h-3.5 text-[var(--text-muted)]" />
          <span className="text-xs font-medium text-[var(--text-primary)]">Search Files</span>
          <button
            onClick={onClose}
            className="ml-auto p-0.5 rounded text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
        <form onSubmit={handleSearch} className="flex gap-1.5">
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search pattern..."
            autoFocus
            className="flex-1 px-2 py-1 text-xs rounded border border-[var(--border-default)] bg-[var(--bg-app)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--text-accent)]"
          />
          <button
            type="button"
            onClick={() => setUseRegex(v => !v)}
            className={cn(
              'px-1.5 py-1 text-[10px] rounded border transition-colors',
              useRegex
                ? 'border-[var(--text-accent)] text-[var(--text-accent)] bg-[var(--bg-active)]'
                : 'border-[var(--border-default)] text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
            )}
            title="Use regex"
          >
            .*
          </button>
          <button
            type="submit"
            disabled={loading || !query.trim()}
            className="px-2 py-1 text-xs rounded bg-[var(--text-accent)] text-white hover:opacity-90 transition-opacity disabled:opacity-40"
          >
            {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Search'}
          </button>
        </form>
      </div>

      <div className="flex-1 overflow-auto">
        {loading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 text-[var(--text-accent)] animate-spin" />
          </div>
        )}

        {!loading && searched && results.length === 0 && (
          <div className="text-center py-8 text-xs text-[var(--text-muted)]">
            No matches found
          </div>
        )}

        {!loading && results.length > 0 && (
          <div>
            {truncated && (
              <div className="px-3 py-1.5 text-[10px] text-amber-400 bg-amber-500/10 border-b border-amber-500/20">
                Results truncated. Refine your search for more specific results.
              </div>
            )}

            <div className="text-[10px] text-[var(--text-muted)] px-3 py-1.5 border-b border-[var(--border-default)]">
              {results.length} matches in {Object.keys(grouped).length} files
            </div>

            {Object.entries(grouped).map(([file, hits]) => (
              <div key={file}>
                <div className="flex items-center gap-1.5 px-3 py-1 bg-[var(--bg-elevated)] border-b border-[var(--border-default)]">
                  <FileText className="w-3 h-3 text-[var(--text-muted)]" />
                  <span className="text-[11px] font-medium text-[var(--text-secondary)]">{file}</span>
                  <span className="text-[10px] text-[var(--text-muted)]">({hits.length})</span>
                </div>
                {hits.map((hit, i) => (
                  <button
                    key={i}
                    onClick={() => onNavigate(hit.file, hit.line)}
                    className="w-full text-left px-3 py-1 hover:bg-[var(--bg-hover)] transition-colors border-b border-[var(--border-subtle)] flex items-start gap-2"
                  >
                    <span className="text-[10px] text-[var(--text-muted)] shrink-0 w-8 text-right mt-px">
                      {hit.line}
                    </span>
                    <span className="text-[11px] text-[var(--text-primary)] font-mono truncate">
                      {hit.content}
                    </span>
                  </button>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
