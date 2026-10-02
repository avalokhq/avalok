import { useState, useEffect } from 'react'
import { ArrowRight, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react'
import { cn } from '../../lib/cn'
import { useDeleteEntity } from '../../lib/useDeleteEntity'
import { adminListStandaloneServices, adminDeleteStandaloneService } from '../../lib/api'
import type { StandaloneService } from '../../lib/types'
import { EntityIconRaw } from '../ui/EntityIcon'
import EntityCollection from '../ui/EntityCollection'
import ProviderIcon, { providerDisplayName } from '../ui/ProviderIcon'
import PageHeader from '../ui/PageHeader'
import Button from '../ui/Button'
import IconButton from '../ui/IconButton'
import Alert from '../ui/Alert'
import EmptyState from '../ui/EmptyState'
import type { MenuItem } from '../ui/Dropdown'
import Page from '../Layout/Page'

interface Props {
  onSelect?: (svc: StandaloneService) => void
  onCreateService?: () => void
  onEditService?: (name: string) => void
}

export default function ManageServicesPage({ onSelect, onCreateService, onEditService }: Props) {
  const [services, setServices] = useState<StandaloneService[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function load() {
    setRefreshing(true)
    adminListStandaloneServices()
      .then(svcs => { setServices(svcs || []); setError(null) })
      .catch(err => setError(err instanceof Error ? err.message : 'Failed to load services'))
      .finally(() => { setLoading(false); setRefreshing(false) })
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load() }, [])

  const { busyName, deleteEntity } = useDeleteEntity({ noun: 'service', remove: adminDeleteStandaloneService, onDeleted: load })

  function menuItems(svc: StandaloneService): MenuItem[] {
    return [
      ...(onSelect ? [{ label: 'View logs', icon: <ArrowRight />, onClick: () => onSelect(svc) }] : []),
      ...(onEditService ? [{ label: 'Edit', icon: <Pencil />, onClick: () => onEditService(svc.name) }] : []),
      { separator: true as const },
      { label: 'Delete', icon: <Trash2 />, danger: true, onClick: () => deleteEntity(svc.name) },
    ]
  }

  return (
    <Page>
      <PageHeader
        eyebrow="Manage"
        title="Services"
        description="Standalone log sources: a single host, container or file you stream directly."
        actions={
          <>
            <IconButton label="Refresh" size="md" onClick={load} disabled={refreshing}>
              <RefreshCw className={cn('size-4', refreshing && 'animate-spin')} />
            </IconButton>
            {onCreateService && <Button leftIcon={<Plus />} onClick={onCreateService}>Create service</Button>}
          </>
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
        name={svc => svc.name}
        description={svc => svc.description || ''}
        icon={svc => <ProviderIcon provider={svc.provider} />}
        meta={svc => (
          <span className="flex min-w-0 items-center gap-1.5">
            <ProviderIcon provider={svc.provider} className="size-3.5 shrink-0" />
            <span className="truncate">{providerDisplayName(svc.provider)}</span>
          </span>
        )}
        metaHeader="Provider"
        searchText={svc => [svc.name, svc.description, svc.provider, providerDisplayName(svc.provider)]}
        searchPlaceholder="Filter by name, description or provider…"
        actionLabel="View logs"
        onOpen={onSelect && (svc => () => onSelect(svc))}
        menuItems={menuItems}
        busyKey={busyName}
        layoutKey="avalok-manage-svc-layout"
        loading={loading}
        noun="services"
        empty={!error && (
          <EmptyState
            icon={<EntityIconRaw kind="service" />}
            tone="success"
            title="No standalone services yet"
            description="Create a service to stream logs from a single host, container or file."
            action={onCreateService && <Button leftIcon={<Plus />} onClick={onCreateService}>Create service</Button>}
          />
        )}
      />
    </Page>
  )
}
