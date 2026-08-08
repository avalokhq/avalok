import { useState, useEffect } from 'react'
import { Plus, Trash2, Pencil, ChevronRight } from 'lucide-react'
import { EntityIconRaw } from '../ui/EntityIcon'
import PageHeader from '../ui/PageHeader'
import Card from '../ui/Card'
import CollectionGrid from '../ui/CollectionGrid'
import DataTable from '../ui/DataTable'
import LayoutToggle from '../ui/LayoutToggle'
import { useLayoutToggle } from '../../lib/useLayoutToggle'
import Button from '../ui/Button'
import Alert from '../ui/Alert'
import Spinner from '../ui/Spinner'
import EmptyState from '../ui/EmptyState'
import IconButton from '../ui/IconButton'
import ProviderIcon, { providerDisplayName } from '../ui/ProviderIcon'
import { adminListStandaloneServices, adminDeleteStandaloneService } from '../../lib/api'
import type { StandaloneService } from '../../lib/types'

interface Props {
  onSelect?: (svc: StandaloneService) => void
  onCreateService?: () => void
  onEditService?: (name: string) => void
}

export default function ManageServicesPage({ onSelect, onCreateService, onEditService }: Props) {
  const [services, setServices] = useState<StandaloneService[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const { layout, changeLayout } = useLayoutToggle('avalok-manage-svc-layout')

  async function load() {
    setLoading(true)
    try { setServices(await adminListStandaloneServices() || []) } catch { setError('Failed to load services') }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  async function handleDelete(e: React.MouseEvent, name: string) {
    e.stopPropagation()
    if (!confirm(`Delete service "${name}"?`)) return
    try { await adminDeleteStandaloneService(name); load() } catch { setError('Failed to delete service') }
  }

  const columns = [
    {
      key: 'name',
      header: 'Name',
      render: (svc: StandaloneService) => (
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center shrink-0">
            <ProviderIcon provider={svc.provider} className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-medium text-[var(--text-primary)]">{svc.name}</div>
            {svc.description && <div className="text-xs text-[var(--text-secondary)] mt-0.5 line-clamp-1">{svc.description}</div>}
          </div>
        </div>
      ),
    },
    {
      key: 'provider',
      header: 'Provider',
      align: 'right' as const,
      render: (svc: StandaloneService) => (
        <span className="inline-flex items-center gap-1.5 text-xs text-[var(--text-secondary)]">
          <ProviderIcon provider={svc.provider} className="w-3 h-3" />
          {providerDisplayName(svc.provider)}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      className: 'w-24',
      render: (svc: StandaloneService) => (
        <div className="flex items-center gap-0.5 justify-end">
          <IconButton variant={'accent' as const} onClick={(e: React.MouseEvent<HTMLButtonElement>) => { e.stopPropagation(); onEditService?.(svc.name) }} title="Edit service">
            <Pencil className="w-4 h-4" />
          </IconButton>
          <IconButton variant={'danger' as const} onClick={(e: React.MouseEvent<HTMLButtonElement>) => handleDelete(e, svc.name)} title="Delete">
            <Trash2 className="w-4 h-4" />
          </IconButton>
        </div>
      ),
    },
    {
      key: 'arrow',
      header: '',
      className: 'w-8',
      render: () => <ChevronRight className="w-4 h-4 text-[var(--text-muted)]" />,
    },
  ]

  return (
    <div className="flex-1 overflow-auto">
      <div className="px-8 lg:px-16 py-8">
        <PageHeader
          title="Services"
          actions={
            <div className="flex items-center gap-2">
              {onCreateService && (
                <Button onClick={onCreateService}>
                  <Plus className="w-4 h-4" /> Create Service
                </Button>
              )}
              <LayoutToggle layout={layout} onChange={changeLayout} />
            </div>
          }
        />

        {error && <Alert variant="error" className="mb-4">{error}</Alert>}

        {loading ? <Spinner label="Loading services..." /> : (
          services.length > 0 ? (
            layout === 'list' ? (
              <DataTable columns={columns} data={services} keyFn={svc => svc.name} onRowClick={onSelect} />
            ) : (
              <CollectionGrid>
                {services.map(svc => (
                  <Card key={svc.name} hover padding="lg" onClick={() => onSelect?.(svc)} className="cursor-pointer text-left group">
                    <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center mb-3">
                      <ProviderIcon provider={svc.provider} className="w-5 h-5" />
                    </div>
                    <div className="text-sm font-medium text-[var(--text-primary)] truncate">{svc.name}</div>
                    <div className="text-xs text-[var(--text-secondary)] mt-1 line-clamp-2">{svc.description || providerDisplayName(svc.provider)}</div>
                    <div className="flex items-center gap-3 mt-4 pt-3 border-t border-[var(--border-subtle)] w-full text-xs text-[var(--text-secondary)]">
                      <span className="flex items-center gap-1">
                        <ProviderIcon provider={svc.provider} className="w-3 h-3" />
                        {providerDisplayName(svc.provider)}
                      </span>
                      <div className="ml-auto flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-all">
                        <IconButton variant="accent" onClick={e => { e.stopPropagation(); onEditService?.(svc.name) }} title="Edit">
                          <Pencil className="w-3.5 h-3.5" />
                        </IconButton>
                        <IconButton variant="danger" onClick={e => handleDelete(e, svc.name)} title="Delete">
                          <Trash2 className="w-3.5 h-3.5" />
                        </IconButton>
                      </div>
                    </div>
                  </Card>
                ))}
              </CollectionGrid>
            )
          ) : (
            <EmptyState
              icon={<EntityIconRaw kind="service" className="w-6 h-6 text-emerald-400 opacity-60" />}
              title="No standalone services yet"
              description="Create a service to get started."
            />
          )
        )}
      </div>
    </div>
  )
}
