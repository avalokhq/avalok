import { useState, useEffect } from 'react'
import { ArrowRight, Pencil, Plus, RefreshCw, Server, Trash2 } from 'lucide-react'
import { cn } from '../../lib/cn'
import { plural } from '../../lib/format'
import { useDeleteEntity } from '../../lib/useDeleteEntity'
import { adminListStandaloneEnvs, adminDeleteStandaloneEnv } from '../../lib/api'
import type { StandaloneEnvironment } from '../../lib/types'
import { EntityIconRaw } from '../ui/EntityIcon'
import EntityCollection from '../ui/EntityCollection'
import PageHeader from '../ui/PageHeader'
import Button from '../ui/Button'
import IconButton from '../ui/IconButton'
import Alert from '../ui/Alert'
import EmptyState from '../ui/EmptyState'
import type { MenuItem } from '../ui/Dropdown'
import Page from '../Layout/Page'

interface Props {
  onSelect?: (env: StandaloneEnvironment) => void
  onCreateEnvironment?: () => void
  onEditEnvironment?: (name: string) => void
}

export default function ManageEnvironmentsPage({ onSelect, onCreateEnvironment, onEditEnvironment }: Props) {
  const [environments, setEnvironments] = useState<StandaloneEnvironment[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function load() {
    setRefreshing(true)
    adminListStandaloneEnvs()
      .then(envs => { setEnvironments(envs || []); setError(null) })
      .catch(err => setError(err instanceof Error ? err.message : 'Failed to load environments'))
      .finally(() => { setLoading(false); setRefreshing(false) })
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load() }, [])

  const { busyName, deleteEntity } = useDeleteEntity({ noun: 'environment', remove: adminDeleteStandaloneEnv, onDeleted: load })

  function menuItems(env: StandaloneEnvironment): MenuItem[] {
    return [
      ...(onSelect ? [{ label: 'Open', icon: <ArrowRight />, onClick: () => onSelect(env) }] : []),
      ...(onEditEnvironment ? [{ label: 'Edit', icon: <Pencil />, onClick: () => onEditEnvironment(env.name) }] : []),
      { separator: true as const },
      { label: 'Delete', icon: <Trash2 />, danger: true, onClick: () => deleteEntity(env.name) },
    ]
  }

  return (
    <Page>
      <PageHeader
        eyebrow="Manage"
        title="Environments"
        description="Standalone environments: a set of services and targets outside any workspace."
        actions={
          <>
            <IconButton label="Refresh" size="md" onClick={load} disabled={refreshing}>
              <RefreshCw className={cn('size-4', refreshing && 'animate-spin')} />
            </IconButton>
            {onCreateEnvironment && <Button leftIcon={<Plus />} onClick={onCreateEnvironment}>Create environment</Button>}
          </>
        }
      />

      {error && (
        <Alert tone="danger" title="Couldn't load environments" className="mb-6"
          action={<Button size="sm" variant="secondary" onClick={load} loading={refreshing}>Retry</Button>}>
          {error}
        </Alert>
      )}

      <EntityCollection
        items={environments}
        keyFn={env => env.name}
        kind="environment"
        name={env => env.name}
        description={env => env.description || ''}
        meta={env => <span className="flex items-center gap-1.5"><Server className="size-3.5" />{plural(env.services, 'service')}</span>}
        onOpen={onSelect && (env => () => onSelect(env))}
        menuItems={menuItems}
        busyKey={busyName}
        layoutKey="avalok-manage-env-layout"
        loading={loading}
        noun="environments"
        empty={!error && (
          <EmptyState
            icon={<EntityIconRaw kind="environment" />}
            tone="info"
            title="No standalone environments yet"
            description="Create an environment to group services and targets outside a workspace."
            action={onCreateEnvironment && <Button leftIcon={<Plus />} onClick={onCreateEnvironment}>Create environment</Button>}
          />
        )}
      />
    </Page>
  )
}
