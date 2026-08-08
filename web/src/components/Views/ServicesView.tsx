import { useState, useEffect, useCallback } from 'react'
import { Play, RefreshCw, FolderOpen } from 'lucide-react'
import { cn } from '../../lib/cn'
import { listServices, checkService } from '../../lib/api'
import type { Workspace, Environment, Service } from '../../lib/types'
import ProviderIcon, { providerDisplayName } from '../ui/ProviderIcon'
import SourceDot from '../ui/SourceDot'
import Badge, { providerVariant } from '../ui/Badge'
import LayoutToggle from '../ui/LayoutToggle'
import CollectionGrid from '../ui/CollectionGrid'
import { useLayoutToggle } from '../../lib/useLayoutToggle'
import PageHeader from '../ui/PageHeader'
import Spinner from '../ui/Spinner'
import EmptyState from '../ui/EmptyState'
import Card from '../ui/Card'
import DataTable from '../ui/DataTable'
import IconButton from '../ui/IconButton'

interface Props {
  workspace: Workspace
  environment: Environment
  onViewLogs: (service: Service) => void
  onBrowseFiles?: (service: Service) => void
}

type StatusMap = Record<string, 'up' | 'down' | 'checking'>

export default function ServicesView({ workspace, environment, onViewLogs, onBrowseFiles }: Props) {
  const [services, setServices] = useState<Service[]>([])
  const [loading, setLoading] = useState(true)
  const [statuses, setStatuses] = useState<StatusMap>({})
  const { layout, changeLayout } = useLayoutToggle('avalok-svc-layout')

  useEffect(() => {
    listServices(workspace.name, environment.name)
      .then(setServices)
      .catch(err => console.error('Failed to load services:', err))
      .finally(() => setLoading(false))
  }, [workspace.name, environment.name])

  useEffect(() => {
    if (services.length === 0) return
    for (const svc of services) {
      checkService(workspace.name, environment.name, svc.name)
        .then(r => setStatuses(prev => ({ ...prev, [svc.name]: r.status })))
        .catch(() => setStatuses(prev => ({ ...prev, [svc.name]: 'down' })))
    }
  }, [services, workspace.name, environment.name])

  const handleCheck = useCallback((svcName: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setStatuses(prev => ({ ...prev, [svcName]: 'checking' }))
    checkService(workspace.name, environment.name, svcName)
      .then(r => setStatuses(prev => ({ ...prev, [svcName]: r.status })))
      .catch(() => setStatuses(prev => ({ ...prev, [svcName]: 'down' })))
  }, [workspace.name, environment.name])

  if (loading) return <Spinner label="Loading services..." />

  return (
    <div className="flex-1 overflow-auto">
      <div className="px-8 lg:px-16 py-8">
        <PageHeader
          title={workspace.name}
          description={`${workspace.description} — ${environment.name}`}
          actions={<LayoutToggle layout={layout} onChange={changeLayout} />}
        />

        {services.length === 0 ? (
          <EmptyState
            icon={<Play className="w-7 h-7 text-[var(--text-accent)] opacity-60" />}
            iconBg="bg-accent-500/10"
            title="No services"
            description="No services in this environment."
          />
        ) : layout === 'list' ? (
          <DataTable
            columns={[
              {
                key: 'status',
                header: '',
                className: 'w-8',
                render: (svc) => <StatusDot status={statuses[svc.name]} />,
              },
              {
                key: 'name',
                header: 'Service',
                render: (svc) => {
                  const id = `${workspace.name}/${environment.name}/${svc.name}`
                  return (
                    <div className="flex items-center gap-2.5">
                      <SourceDot name={id} size="md" />
                      <div>
                        <div className="font-medium text-[var(--text-primary)]">{svc.friendly_name || svc.name}</div>
                        {svc.friendly_name && svc.friendly_name !== svc.name && (
                          <div className="text-xs text-[var(--text-muted)]">{svc.name}</div>
                        )}
                      </div>
                    </div>
                  )
                },
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
                key: 'target',
                header: 'Target',
                className: 'w-32',
                render: (svc) => svc.target ? <Badge>{svc.target}</Badge> : <span className="text-[var(--text-muted)]">-</span>,
              },
              {
                key: 'actions',
                header: '',
                className: 'w-28 text-right',
                render: (svc) => (
                  <div className="flex items-center justify-end gap-1">
                    <IconButton onClick={(e) => handleCheck(svc.name, e)} title="Check connection">
                      <RefreshCw className={cn('w-3.5 h-3.5', statuses[svc.name] === 'checking' && 'animate-spin')} />
                    </IconButton>
                    {svc.has_log_dir && onBrowseFiles && (
                      <IconButton variant="default" onClick={(e) => { e.stopPropagation(); onBrowseFiles(svc) }} title="Browse files">
                        <FolderOpen className="w-3.5 h-3.5 text-amber-400" />
                      </IconButton>
                    )}
                  </div>
                ),
              },
            ]}
            data={services}
            keyFn={svc => svc.name}
            onRowClick={onViewLogs}
          />
        ) : (
          <CollectionGrid>
            {services.map(svc => {
              const id = `${workspace.name}/${environment.name}/${svc.name}`
              const status = statuses[svc.name]
              return (
                <Card key={svc.name} hover padding="md" className="group cursor-pointer" onClick={() => onViewLogs(svc)}>
                  <div className="flex items-center gap-2.5 mb-3 w-full">
                    <StatusDot status={status} />
                    <SourceDot name={id} size="md" />
                    <Badge variant={providerVariant(svc.provider)} className="text-[10px]">
                      <ProviderIcon provider={svc.provider} className="w-3 h-3" />
                      {providerDisplayName(svc.provider)}
                    </Badge>
                    <div className="ml-auto">
                      <IconButton onClick={(e) => handleCheck(svc.name, e)} title="Check connection">
                        <RefreshCw className={cn('w-3.5 h-3.5', status === 'checking' && 'animate-spin')} />
                      </IconButton>
                    </div>
                  </div>
                  <div className="text-sm font-medium text-[var(--text-primary)]">{svc.friendly_name || svc.name}</div>
                  {svc.friendly_name && svc.friendly_name !== svc.name && (
                    <div className="text-xs text-[var(--text-muted)] mt-0.5">{svc.name}</div>
                  )}
                  <div className="flex items-center justify-between w-full mt-4 pt-3 border-t border-[var(--border-subtle)]">
                    {svc.target ? <Badge>{svc.target}</Badge> : <span />}
                    <div className="flex items-center gap-2">
                      {svc.has_log_dir && onBrowseFiles && (
                        <div
                          role="button"
                          tabIndex={-1}
                          onClick={(e) => { e.stopPropagation(); onBrowseFiles(svc) }}
                          className="flex items-center gap-1 text-xs font-medium text-amber-400 opacity-0 group-hover:opacity-100 hover:underline transition-all cursor-pointer"
                        >
                          <FolderOpen className="w-3 h-3" />
                          Files
                        </div>
                      )}
                      <div className="flex items-center gap-1.5 text-xs font-medium text-[var(--text-accent)] opacity-0 group-hover:opacity-100 transition-all">
                        <Play className="w-3 h-3" />
                        View Logs
                      </div>
                    </div>
                  </div>
                </Card>
              )
            })}
          </CollectionGrid>
        )}
      </div>
    </div>
  )
}

function StatusDot({ status }: { status?: 'up' | 'down' | 'checking' }) {
  if (!status) return <span className="w-2 h-2 rounded-full bg-[var(--text-muted)] opacity-30 shrink-0" />
  if (status === 'checking') return <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse shrink-0" />
  if (status === 'up') return <span className="w-2 h-2 rounded-full bg-[var(--accent-bright)] shrink-0" />
  return <span className="w-2 h-2 rounded-full bg-red-400 shrink-0" />
}
