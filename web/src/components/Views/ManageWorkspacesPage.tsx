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
import FormField from '../ui/FormField'
import IconButton from '../ui/IconButton'
import { Textarea } from '../ui/Input'
import { adminListWorkspaces, adminImportWorkspace, adminDeleteWorkspace } from '../../lib/api'
import type { Workspace } from '../../lib/types'

interface Props {
  onSelect?: (ws: Workspace) => void
  onCreateWorkspace?: () => void
  onEditWorkspace?: (name: string) => void
}

export default function ManageWorkspacesPage({ onSelect, onCreateWorkspace, onEditWorkspace }: Props) {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [loading, setLoading] = useState(true)
  const [showImport, setShowImport] = useState(false)
  const [error, setError] = useState('')
  const { layout, changeLayout } = useLayoutToggle('avalok-manage-ws-layout')

  async function load() {
    setLoading(true)
    try { setWorkspaces(await adminListWorkspaces() || []) } catch { setError('Failed to load workspaces') }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  async function handleDelete(e: React.MouseEvent, name: string) {
    e.stopPropagation()
    if (!confirm(`Delete workspace "${name}"?`)) return
    try { await adminDeleteWorkspace(name); load() } catch { setError('Failed to delete workspace') }
  }

  const columns = [
    {
      key: 'name',
      header: 'Name',
      render: (ws: Workspace) => (
        <div className="flex items-center gap-3">
          <EntityIcon kind="workspace" />
          <div className="min-w-0">
            <div className="text-sm font-medium text-[var(--text-primary)]">{ws.name}</div>
            {ws.description && <div className="text-xs text-[var(--text-secondary)] mt-0.5 line-clamp-1">{ws.description}</div>}
          </div>
        </div>
      ),
    },
    {
      key: 'details',
      header: 'Details',
      align: 'right' as const,
      render: (ws: Workspace) => (
        <div className="flex items-center justify-end gap-3 text-xs text-[var(--text-secondary)]">
          <span>{ws.environments} env{ws.environments !== 1 ? 's' : ''}</span>
          <span className="flex items-center gap-1"><Server className="w-3 h-3" />{ws.services} service{ws.services !== 1 ? 's' : ''}</span>
        </div>
      ),
    },
    {
      key: 'actions',
      header: '',
      className: 'w-24',
      render: (ws: Workspace) => (
        <div className="flex items-center gap-0.5 justify-end">
          {onEditWorkspace && (
            <IconButton variant={'accent' as const} onClick={(e: React.MouseEvent<HTMLButtonElement>) => { e.stopPropagation(); onEditWorkspace(ws.name) }} title="Edit">
              <Pencil className="w-4 h-4" />
            </IconButton>
          )}
          <IconButton variant={'danger' as const} onClick={(e: React.MouseEvent<HTMLButtonElement>) => handleDelete(e, ws.name)} title="Delete">
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
          title="Workspaces"
          actions={
            <div className="flex items-center gap-2">
              <Button variant="secondary" onClick={() => setShowImport(!showImport)}>
                <Plus className="w-4 h-4" /> Import YAML
              </Button>
              {onCreateWorkspace && (
                <Button onClick={onCreateWorkspace}>
                  <Plus className="w-4 h-4" /> Create Workspace
                </Button>
              )}
              <LayoutToggle layout={layout} onChange={changeLayout} />
            </div>
          }
        />

        {error && <Alert variant="error" className="mb-4">{error}</Alert>}

        {showImport && <ImportWorkspaceForm onDone={() => { setShowImport(false); load() }} />}

        {loading ? <Spinner label="Loading workspaces..." /> : (
          workspaces.length > 0 ? (
            layout === 'list' ? (
              <DataTable columns={columns} data={workspaces} keyFn={ws => ws.name} onRowClick={onSelect} />
            ) : (
              <CollectionGrid>
                {workspaces.map(ws => (
                  <Card key={ws.name} hover padding="lg" onClick={() => onSelect?.(ws)} className="cursor-pointer text-left group">
                    <EntityIcon kind="workspace" className="mb-3" />
                    <div className="text-sm font-medium text-[var(--text-primary)] truncate">{ws.name}</div>
                    <div className="text-xs text-[var(--text-secondary)] mt-1 line-clamp-2">{ws.description || 'No description'}</div>
                    <div className="flex items-center gap-3 mt-4 pt-3 border-t border-[var(--border-subtle)] w-full text-xs text-[var(--text-secondary)]">
                      <span>{ws.environments} env{ws.environments !== 1 ? 's' : ''}</span>
                      <span className="flex items-center gap-1"><Server className="w-3 h-3" />{ws.services}</span>
                      <div className="ml-auto flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-all">
                        {onEditWorkspace && (
                          <IconButton variant="accent" onClick={e => { e.stopPropagation(); onEditWorkspace(ws.name) }} title="Edit">
                            <Pencil className="w-3.5 h-3.5" />
                          </IconButton>
                        )}
                        <IconButton variant="danger" onClick={e => handleDelete(e, ws.name)} title="Delete">
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
              icon={<EntityIconRaw kind="workspace" className="w-6 h-6 text-[var(--text-accent)] opacity-60" />}
              title="No workspaces yet"
              description="Import a YAML file or create a workspace to get started."
            />
          )
        )}
      </div>
    </div>
  )
}

function ImportWorkspaceForm({ onDone }: { onDone: () => void }) {
  const [yaml, setYaml] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      await adminImportWorkspace(yaml)
      onDone()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to import')
    } finally { setLoading(false) }
  }

  return (
    <Card className="mb-4">
      {error && <Alert variant="error" className="mb-3">{error}</Alert>}
      <form onSubmit={handleSubmit}>
        <FormField label="Workspace YAML" required>
          <Textarea
            value={yaml}
            onChange={e => setYaml(e.target.value)}
            className="h-48 font-mono"
            placeholder="Paste workspace YAML here..."
            required
          />
        </FormField>
        <div className="flex justify-end gap-2 mt-3">
          <Button variant="ghost" type="button" onClick={onDone}>Cancel</Button>
          <Button type="submit" loading={loading}>
            {loading ? 'Importing...' : 'Import'}
          </Button>
        </div>
      </form>
    </Card>
  )
}
