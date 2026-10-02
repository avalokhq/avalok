import { useCallback, useEffect, useState } from 'react'
import { RefreshCw, Target } from 'lucide-react'
import { cn } from '../../lib/cn'
import { plural } from '../../lib/format'
import type { Environment } from '../../lib/types'
import EntityCollection from '../ui/EntityCollection'
import { EntityIconRaw } from '../ui/EntityIcon'
import PageHeader from '../ui/PageHeader'
import IconButton from '../ui/IconButton'
import Button from '../ui/Button'
import Alert from '../ui/Alert'
import EmptyState from '../ui/EmptyState'
import Page from '../Layout/Page'

interface Props {
  title: string
  description?: string
  eyebrow?: string
  /** Changes whenever the list should reload. */
  sourceKey: string
  load: () => Promise<Environment[]>
  onSelect: (env: Environment) => void
  layoutKey: string
  emptyDescription: string
}

/** Environments of a workspace (optionally narrowed to one service). */
export default function EnvironmentList({ title, description, eyebrow, sourceKey, load, onSelect, layoutKey, emptyDescription }: Props) {
  const [envs, setEnvs] = useState<Environment[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadAll = useCallback(() => {
    setRefreshing(true)
    load()
      .then(list => { setEnvs(list || []); setError(null) })
      .catch(err => setError(err instanceof Error ? err.message : 'Failed to load environments'))
      .finally(() => { setLoading(false); setRefreshing(false) })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceKey])

  useEffect(() => { loadAll() }, [loadAll])

  return (
    <Page>
      <PageHeader
        eyebrow={eyebrow}
        title={title}
        description={description}
        actions={
          <IconButton label="Refresh" size="md" onClick={loadAll} disabled={refreshing}>
            <RefreshCw className={cn('size-4', refreshing && 'animate-spin')} />
          </IconButton>
        }
      />

      {error && (
        <Alert tone="danger" title="Couldn't load environments" className="mb-6"
          action={<Button size="sm" variant="secondary" onClick={loadAll} loading={refreshing}>Retry</Button>}>
          {error}
        </Alert>
      )}

      <EntityCollection
        items={envs}
        keyFn={env => env.name}
        kind="environment"
        name={env => env.name}
        meta={env => <span className="flex items-center gap-1.5"><Target className="size-3.5" />{plural(env.targets, 'target')}</span>}
        onOpen={env => () => onSelect(env)}
        layoutKey={layoutKey}
        loading={loading}
        noun="environments"
        empty={!error && (
          <EmptyState icon={<EntityIconRaw kind="environment" />} tone="info" title="No environments" description={emptyDescription} />
        )}
      />
    </Page>
  )
}
