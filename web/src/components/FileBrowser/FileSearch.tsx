import { useState, useCallback, useMemo } from 'react'
import { Search, X, FileText, SearchX } from 'lucide-react'
import { searchFiles } from '../../lib/api'
import { plural } from '../../lib/format'
import type { FileSearchResult } from '../../lib/types'
import Alert from '../ui/Alert'
import Button from '../ui/Button'
import EmptyState from '../ui/EmptyState'
import IconButton from '../ui/IconButton'
import Spinner from '../ui/Spinner'
import { SearchInput } from '../ui/Input'

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
  const [error, setError] = useState<string | null>(null)
  const [truncated, setTruncated] = useState(false)
  const [searched, setSearched] = useState(false)

  const runSearch = useCallback(async () => {
    if (!query.trim()) return

    setLoading(true)
    setSearched(true)
    setError(null)
    try {
      const res = await searchFiles(workspace, environment, service, {
        pattern: query,
        use_regex: useRegex,
        max_hits: 500,
      })
      setResults(res.results)
      setTruncated(res.truncated)
    } catch (err) {
      // A failed search must not look like "no matches".
      setResults([])
      setTruncated(false)
      setError(err instanceof Error ? err.message : 'Search failed')
    } finally {
      setLoading(false)
    }
  }, [workspace, environment, service, query, useRegex])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    runSearch()
  }

  const grouped = useMemo(() => results.reduce<Record<string, FileSearchResult[]>>((acc, r) => {
    if (!acc[r.file]) acc[r.file] = []
    acc[r.file].push(r)
    return acc
  }, {}), [results])
  const fileCount = Object.keys(grouped).length

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-col gap-2 border-b border-line px-3 py-2.5">
        <div className="flex items-center gap-2">
          <Search className="size-4 text-fg-muted" />
          <span className="text-sm font-medium text-fg">Search files</span>
          <IconButton label="Close search" size="xs" onClick={onClose} className="ml-auto">
            <X className="size-3.5" />
          </IconButton>
        </div>
        <form onSubmit={handleSubmit} className="flex items-center gap-2">
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder={useRegex ? 'Regular expression…' : 'Search pattern…'}
            aria-label="Search pattern"
            autoFocus
            wrapperClassName="min-w-0 flex-1"
          />
          <IconButton label={useRegex ? 'Regex on' : 'Use regex'} size="md" active={useRegex} onClick={() => setUseRegex(v => !v)}>
            <span className="font-mono text-xs">.*</span>
          </IconButton>
          <Button type="submit" size="md" loading={loading} disabled={!query.trim()}>Search</Button>
        </form>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {error ? (
          <div className="p-3">
            <Alert
              tone="danger"
              title="Search failed"
              action={<Button size="sm" variant="secondary" onClick={runSearch} loading={loading}>Retry</Button>}
            >
              {error}
            </Alert>
          </div>
        ) : loading ? (
          <Spinner size="md" label="Searching…" />
        ) : searched && results.length === 0 ? (
          <EmptyState compact tone="neutral" icon={<SearchX />} title="No matches found" description="Try a different pattern." />
        ) : results.length > 0 && (
          <div>
            {truncated && (
              <div className="p-3 pb-0">
                <Alert tone="warning">Results truncated. Refine your search for more specific results.</Alert>
              </div>
            )}

            <div className="px-3 py-2 text-2xs text-fg-muted tabular-nums">
              {results.length} {results.length === 1 ? 'match' : 'matches'} in {plural(fileCount, 'file')}
            </div>

            {Object.entries(grouped).map(([file, hits]) => (
              <div key={file}>
                <div className="sticky top-0 flex items-center gap-2 border-y border-line bg-surface-sunken px-3 py-1.5">
                  <FileText className="size-3.5 shrink-0 text-fg-muted" />
                  <span className="truncate text-xs font-medium text-fg-secondary" title={file}>{file}</span>
                  <span className="shrink-0 text-2xs text-fg-muted tabular-nums">{hits.length}</span>
                </div>
                {hits.map((hit, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => onNavigate(hit.file, hit.line)}
                    className="flex w-full cursor-pointer items-start gap-2 border-b border-line px-3 py-1 text-left transition-colors hover:bg-hover"
                  >
                    <span className="mt-px w-10 shrink-0 text-right font-mono text-2xs text-fg-muted tabular-nums">{hit.line}</span>
                    <span className="truncate font-mono text-xs text-fg">{hit.content}</span>
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
