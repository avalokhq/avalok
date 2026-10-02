import { useCallback, useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { cn } from '../../lib/cn'
import { plural } from '../../lib/format'
import { listWorkspaceServices } from '../../lib/api'
import type { Workspace } from '../../lib/types'
import EntityCollection from '../ui/EntityCollection'
import { EntityIconRaw } from '../ui/EntityIcon'
import ProviderIcon, { providerDisplayName } from '../ui/ProviderIcon'
import PageHeader from '../ui/PageHeader'
import IconButton from '../ui/IconButton'
import Button from '../ui/Button'
import Alert from '../ui/Alert'
import EmptyState from '../ui/EmptyState'
import Page from '../Layout/Page'

type WorkspaceService = Awaited<ReturnType<typeof listWorkspaceServices>>[number]

interface Props {
  workspace: Workspace
  onSelectService: (svcName: string, svcLabel: string) => void
}

/** Services of a workspace (service-first hierarchy). */
export default function WorkspaceServicesView({ workspace, onSelectService }: Props) {
  const [services, setServices] = useState<WorkspaceService[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    setRefreshing(true)
    listWorkspaceServices(workspace.name)
      .then(list => { setServices(list || []); setError(null) })
      .catch(err => setError(err instanceof Error ? err.message : 'Failed to load services'))
      .finally(() => { setLoading(false); setRefreshing(false) })
  }, [workspace.name])

  useEffect(() => { load() }, [load])

  return (
    <Page>
      <PageHeader
        eyebrow="Workspace"
        title={workspace.name}
        description={workspace.description}
        actions={
          <IconButton label="Refresh" size="md" onClick={load} disabled={refreshing}>
            <RefreshCw className={cn('size-4', refreshing && 'animate-spin')} />
          </IconButton>
        }
      />

      {error && (
        <Alert tone="danger" title="Couldn't load services" className="mb-6"
          action={<Button size="sm" variant="secondary" onClick={load} loading={refreshing}>Retry</Button>}>
          {error}
        </Alert>
      )}

      <EntityCollection
        items={services}
        keyFn={svc => svc.name}
        kind="service"
        name={svc => svc.friendly_name || svc.name}
        description={svc => (svc.friendly_name && svc.friendly_name !== svc.name ? svc.name : undefined)}
        icon={svc => <ProviderIcon provider={svc.provider} />}
        meta={svc => (
          <>
            <span className="flex min-w-0 items-center gap-1.5">
              <ProviderIcon provider={svc.provider} className="size-3.5 shrink-0" />
              <span className="truncate">{providerDisplayName(svc.provider)}</span>
            </span>
            <span className="flex items-center gap-1.5">
              <EntityIconRaw kind="environment" className="size-3.5" />{plural(svc.environments, 'env')}
            </span>
          </>
        )}
        searchText={svc => [svc.name, svc.friendly_name, svc.provider, providerDisplayName(svc.provider)]}
        searchPlaceholder="Filter by name or provider…"
        onOpen={svc => () => onSelectService(svc.name, svc.friendly_name || svc.name)}
        layoutKey="avalok-ws-svc-layout"
        loading={loading}
        noun="services"
        empty={!error && (
          <EmptyState icon={<EntityIconRaw kind="service" />} tone="success" title="No services" description="No services are defined in this workspace." />
        )}
      />
    </Page>
  )
}
