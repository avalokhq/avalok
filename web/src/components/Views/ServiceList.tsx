import { useCallback, useEffect, useState } from 'react'
import { FolderOpen, PlugZap, RefreshCw, ScrollText, Target } from 'lucide-react'
import { cn } from '../../lib/cn'
import type { CheckResult } from '../../lib/api'
import type { Service } from '../../lib/types'
import EntityCollection from '../ui/EntityCollection'
import { EntityIconRaw } from '../ui/EntityIcon'
import ProviderIcon, { providerDisplayName } from '../ui/ProviderIcon'
import PageHeader from '../ui/PageHeader'
import IconButton from '../ui/IconButton'
import Button from '../ui/Button'
import Alert from '../ui/Alert'
import EmptyState from '../ui/EmptyState'
import type { MenuItem } from '../ui/Dropdown'
import type { DotStatus } from '../ui/StatusDot'
import Page from '../Layout/Page'

const CLOUD_STORAGE_PROVIDERS = new Set(['s3', 'azure-blob', 'azure-file', 'gcs'])

type Health = { state: 'checking' } | { state: 'up' | 'down'; error?: string }

interface Props {
  title: string
  description?: string
  eyebrow?: string
  /** Changes whenever the list should reload (e.g. "ws/env"). */
  sourceKey: string
  load: () => Promise<Service[]>
  check: (serviceName: string) => Promise<CheckResult>
  onViewLogs: (service: Service) => void
  onBrowseFiles?: (service: Service) => void
  /** Cloud storage services open the object browser instead of logs. */
  onBrowseStorage?: (service: Service) => void
  layoutKey: string
}

/** Services inside an environment (workspace or standalone), with live reachability checks. */
export default function ServiceList({ title, description, eyebrow, sourceKey, load, check, onViewLogs, onBrowseFiles, onBrowseStorage, layoutKey }: Props) {
  const [services, setServices] = useState<Service[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [health, setHealth] = useState<Record<string, Health>>({})

  const runCheck = useCallback((name: string) => {
    setHealth(prev => ({ ...prev, [name]: { state: 'checking' } }))
    check(name)
      .then(r => setHealth(prev => ({ ...prev, [name]: { state: r.status, error: r.error } })))
      .catch(err => setHealth(prev => ({ ...prev, [name]: { state: 'down', error: err instanceof Error ? err.message : undefined } })))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceKey])

  const loadAll = useCallback(() => {
    setLoading(true)
    load()
      .then(list => {
        setServices(list || [])
        setError(null)
        for (const svc of list || []) runCheck(svc.name)
      })
      .catch(err => setError(err instanceof Error ? err.message : 'Failed to load services'))
      .finally(() => setLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceKey])

  useEffect(() => { loadAll() }, [loadAll])

  const isStorage = (svc: Service) => CLOUD_STORAGE_PROVIDERS.has(svc.provider) && !!onBrowseStorage
  const open = (svc: Service) => (isStorage(svc) ? onBrowseStorage!(svc) : onViewLogs(svc))
  const checking = Object.values(health).some(h => h.state === 'checking')
  const up = services.filter(s => health[s.name]?.state === 'up').length
  const down = services.filter(s => health[s.name]?.state === 'down').length

  function status(svc: Service): { status: DotStatus; label: string } | undefined {
    const h = health[svc.name]
    if (!h) return undefined
    if (h.state === 'checking') return { status: 'warn', label: 'Checking connection…' }
    if (h.state === 'up') return { status: 'ok', label: 'Reachable' }
    return { status: 'error', label: h.error ? `Unreachable: ${h.error}` : 'Unreachable' }
  }

  function menuItems(svc: Service): MenuItem[] {
    return [
      isStorage(svc)
        ? { label: 'Browse storage', icon: <FolderOpen />, onClick: () => onBrowseStorage!(svc) }
        : { label: 'View logs', icon: <ScrollText />, onClick: () => onViewLogs(svc) },
      ...(svc.has_log_dir && onBrowseFiles ? [{ label: 'Browse log files', icon: <FolderOpen />, onClick: () => onBrowseFiles(svc) }] : []),
      { separator: true as const },
      { label: 'Check connection', icon: <PlugZap />, disabled: health[svc.name]?.state === 'checking', onClick: () => runCheck(svc.name) },
    ]
  }

  const summary = services.length > 0 && !loading
    ? `${services.length} service${services.length === 1 ? '' : 's'} · ${up} reachable${down > 0 ? ` · ${down} unreachable` : ''}`
    : undefined

  return (
    <Page>
      <PageHeader
        eyebrow={eyebrow}
        title={title}
        description={[description, summary].filter(Boolean).join(' — ') || undefined}
        actions={
          <IconButton label="Refresh and re-check" size="md" onClick={loadAll} disabled={loading || checking}>
            <RefreshCw className={cn('size-4', (loading || checking) && 'animate-spin')} />
          </IconButton>
        }
      />

      {error && (
        <Alert tone="danger" title="Couldn't load services" className="mb-6"
          action={<Button size="sm" variant="secondary" onClick={loadAll}>Retry</Button>}>
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
        status={status}
        meta={svc => (
          <>
            <span className="flex min-w-0 items-center gap-1.5">
              <ProviderIcon provider={svc.provider} className="size-3.5 shrink-0" />
              <span className="truncate">{providerDisplayName(svc.provider)}</span>
            </span>
            {svc.target && (
              <span className="flex min-w-0 items-center gap-1.5" title="Target">
                <Target className="size-3.5 shrink-0" />
                <span className="truncate">{svc.target}</span>
              </span>
            )}
          </>
        )}
        searchText={svc => [svc.name, svc.friendly_name, svc.provider, providerDisplayName(svc.provider), svc.target]}
        searchPlaceholder="Filter by name, provider or target…"
        actionLabel={svc => (isStorage(svc) ? 'Browse' : 'View logs')}
        onOpen={svc => () => open(svc)}
        menuItems={menuItems}
        layoutKey={layoutKey}
        loading={loading}
        noun="services"
        empty={!error && (
          <EmptyState
            icon={<EntityIconRaw kind="service" />}
            tone="success"
            title="No services"
            description="This environment has no services configured."
          />
        )}
      />
    </Page>
  )
}
