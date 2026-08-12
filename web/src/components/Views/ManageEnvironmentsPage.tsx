import { useState, useEffect } from 'react'
import { Plus, Trash2, Pencil, Server, ChevronRight } from 'lucide-react'
import EntityIcon, { EntityIconRaw } from '../ui/EntityIcon'
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
import { adminListStandaloneEnvs, adminDeleteStandaloneEnv } from '../../lib/api'
import type { StandaloneEnvironment } from '../../lib/types'

interface Props {
  onSelect?: (env: StandaloneEnvironment) => void
  onCreateEnvironment?: () => void
  onEditEnvironment?: (name: string) => void
}

export default function ManageEnvironmentsPage({ onSelect, onCreateEnvironment, onEditEnvironment }: Props) {
  const [environments, setEnvironments] = useState<StandaloneEnvironment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const { layout, changeLayout } = useLayoutToggle('avalok-manage-env-layout')

  async function load() {
    setLoading(true)
    try { setEnvironments(await adminListStandaloneEnvs() || []) } catch { setError('Failed to load environments') }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  async function handleDelete(e: React.MouseEvent, name: string) {
    e.stopPropagation()
    if (!confirm(`Delete environment "${name}"?`)) return
    try { await adminDeleteStandaloneEnv(name); load() } catch { setError('Failed to delete environment') }
  }

  const columns = [
    {
      key: 'name',
      header: 'Name',
      render: (env: StandaloneEnvironment) => (
        <div className="flex items-center gap-3">
          <EntityIcon kind="environment" />
          <div className="min-w-0">
            <div className="text-sm font-medium text-[var(--text-primary)]">{env.name}</div>
            {env.description && <div className="text-xs text-[var(--text-secondary)] mt-0.5 line-clamp-1">{env.description}</div>}
          </div>
        </div>
      ),
    },
    {
      key: 'details',
      header: 'Details',
      align: 'right' as const,
      render: (env: StandaloneEnvironment) => (
        <div className="flex items-center justify-end gap-1 text-xs text-[var(--text-secondary)]">
          <Server className="w-3 h-3" />{env.services} service{env.services !== 1 ? 's' : ''}
        </div>
      ),
    },
    {
      key: 'actions',
      header: '',
      className: 'w-24',
      render: (env: StandaloneEnvironment) => (
        <div className="flex items-center gap-0.5 justify-end">
          <IconButton variant={'accent' as const} onClick={(e: React.MouseEvent<HTMLButtonElement>) => { e.stopPropagation(); onEditEnvironment?.(env.name) }} title="Edit environment">
            <Pencil className="w-4 h-4" />
          </IconButton>
          <IconButton variant={'danger' as const} onClick={(e: React.MouseEvent<HTMLButtonElement>) => handleDelete(e, env.name)} title="Delete">
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
          title="Environments"
          actions={
            <div className="flex items-center gap-2">
              {onCreateEnvironment && (
                <Button onClick={onCreateEnvironment}>
                  <Plus className="w-4 h-4" /> Create Environment
                </Button>
              )}
              <LayoutToggle layout={layout} onChange={changeLayout} />
            </div>
          }
        />

        {error && <Alert variant="error" className="mb-4">{error}</Alert>}

        {loading ? <Spinner label="Loading environments..." /> : (
          environments.length > 0 ? (
            layout === 'list' ? (
              <DataTable columns={columns} data={environments} keyFn={env => env.name} onRowClick={onSelect} />
            ) : (
              <CollectionGrid>
                {environments.map(env => (
                  <Card key={env.name} hover padding="lg" onClick={() => onSelect?.(env)} className="cursor-pointer text-left group">
                    <EntityIcon kind="environment" className="mb-3" />
                    <div className="text-sm font-medium text-[var(--text-primary)] truncate">{env.name}</div>
                    <div className="text-xs text-[var(--text-secondary)] mt-1 line-clamp-2">{env.description || 'No description'}</div>
                    <div className="flex items-center gap-1.5 mt-4 pt-3 border-t border-[var(--border-subtle)] w-full text-xs text-[var(--text-secondary)]">
                      <Server className="w-3 h-3" />{env.services} service{env.services !== 1 ? 's' : ''}
                      <div className="ml-auto flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-all">
                        <IconButton variant="accent" onClick={e => { e.stopPropagation(); onEditEnvironment?.(env.name) }} title="Edit">
                          <Pencil className="w-3.5 h-3.5" />
                        </IconButton>
                        <IconButton variant="danger" onClick={e => handleDelete(e, env.name)} title="Delete">
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
              icon={<EntityIconRaw kind="environment" className="w-6 h-6 text-blue-400 opacity-60" />}
              title="No standalone environments yet"
              description="Create an environment to get started."
            />
          )
        )}
      </div>
    </div>
  )
}
