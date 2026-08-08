import { useState, useEffect } from 'react'
import { ChevronRight } from 'lucide-react'
import { listWorkspaceServices } from '../../lib/api'
import EntityIcon, { EntityIconRaw } from '../ui/EntityIcon'
import type { Workspace } from '../../lib/types'
import ProviderIcon, { providerDisplayName } from '../ui/ProviderIcon'
import Badge, { providerVariant } from '../ui/Badge'
import LayoutToggle from '../ui/LayoutToggle'
import CollectionGrid from '../ui/CollectionGrid'
import { useLayoutToggle } from '../../lib/useLayoutToggle'
import PageHeader from '../ui/PageHeader'
import Spinner from '../ui/Spinner'
import EmptyState from '../ui/EmptyState'
import Card from '../ui/Card'
import DataTable from '../ui/DataTable'

interface Props {
  workspace: Workspace
  onSelectService: (svcName: string, svcLabel: string) => void
}

export default function WorkspaceServicesView({ workspace, onSelectService }: Props) {
  const [services, setServices] = useState<{ name: string; friendly_name: string; provider: string; environments: number }[]>([])
  const [loading, setLoading] = useState(true)
  const { layout, changeLayout } = useLayoutToggle('avalok-ws-svc-layout')

  useEffect(() => {
    listWorkspaceServices(workspace.name)
      .then(setServices)
      .catch(err => console.error('Failed to load services:', err))
      .finally(() => setLoading(false))
  }, [workspace.name])

  if (loading) return <Spinner label="Loading services..." />

  return (
    <div className="flex-1 overflow-auto">
      <div className="px-8 lg:px-16 py-8">
        <PageHeader
          title={workspace.name}
          description={workspace.description}
          actions={<LayoutToggle layout={layout} onChange={changeLayout} />}
        />

        {services.length === 0 ? (
          <EmptyState
            icon={<EntityIconRaw kind="service" className="w-7 h-7 text-emerald-400 opacity-60" />}
            iconBg="bg-emerald-500/10"
            title="No services"
            description="No services found in this workspace."
          />
        ) : layout === 'list' ? (
          <DataTable
            columns={[
              {
                key: 'name',
                header: 'Service',
                render: (svc) => (
                  <div className="flex items-center gap-3">
                    <EntityIcon kind="service" />
                    <div>
                      <div className="font-medium text-[var(--text-primary)]">{svc.friendly_name || svc.name}</div>
                      {svc.friendly_name && svc.friendly_name !== svc.name && (
                        <div className="text-xs text-[var(--text-muted)]">{svc.name}</div>
                      )}
                    </div>
                  </div>
                ),
              },
              {
                key: 'provider',
                header: 'Provider',
                align: 'right' as const,
                render: (svc) => (
                  <Badge variant={providerVariant(svc.provider)}>
                    <ProviderIcon provider={svc.provider} className="w-3 h-3" />
                    {providerDisplayName(svc.provider)}
                  </Badge>
                ),
              },
              {
                key: 'environments',
                header: 'Environments',
                className: 'w-36',
                render: (svc) => (
                  <span className="flex items-center gap-1.5 text-[var(--text-secondary)]">
                    <EntityIconRaw kind="environment" className="w-3.5 h-3.5" />
                    {svc.environments}
                  </span>
                ),
              },
              {
                key: 'nav',
                header: '',
                className: 'w-10',
                render: () => <ChevronRight className="w-4 h-4 text-[var(--text-muted)]" />,
              },
            ]}
            data={services}
            keyFn={svc => svc.name}
            onRowClick={svc => onSelectService(svc.name, svc.friendly_name || svc.name)}
          />
        ) : (
          <CollectionGrid>
            {services.map(svc => (
              <Card key={svc.name} hover padding="md" className="cursor-pointer" onClick={() => onSelectService(svc.name, svc.friendly_name || svc.name)}>
                <EntityIcon kind="service" className="mb-3" />
                <div className="text-sm font-medium text-[var(--text-primary)]">{svc.friendly_name || svc.name}</div>
                {svc.friendly_name && svc.friendly_name !== svc.name && (
                  <div className="text-xs text-[var(--text-muted)] mt-0.5">{svc.name}</div>
                )}
                <div className="flex items-center justify-between w-full mt-4 pt-3 border-t border-[var(--border-subtle)]">
                  <Badge variant={providerVariant(svc.provider)} className="text-[10px]">
                    <ProviderIcon provider={svc.provider} className="w-3 h-3" />
                    {providerDisplayName(svc.provider)}
                  </Badge>
                  <div className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)]">
                    <EntityIconRaw kind="environment" className="w-3 h-3" />
                    {svc.environments} env{svc.environments !== 1 ? 's' : ''}
                  </div>
                </div>
              </Card>
            ))}
          </CollectionGrid>
        )}
      </div>
    </div>
  )
}
