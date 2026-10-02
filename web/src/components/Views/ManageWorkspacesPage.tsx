import { useState, useEffect } from 'react'
import { ArrowRight, Pencil, Plus, RefreshCw, Server, Trash2, Upload, X } from 'lucide-react'
import { cn } from '../../lib/cn'
import { plural } from '../../lib/format'
import { useDeleteEntity } from '../../lib/useDeleteEntity'
import { adminListWorkspaces, adminDeleteWorkspace } from '../../lib/api'
import type { Workspace } from '../../lib/types'
import { EntityIconRaw } from '../ui/EntityIcon'
import EntityCollection from '../ui/EntityCollection'
import PageHeader from '../ui/PageHeader'
import Button from '../ui/Button'
import IconButton from '../ui/IconButton'
import Alert from '../ui/Alert'
import EmptyState from '../ui/EmptyState'
import { useToast } from '../ui/Feedback'
import type { MenuItem } from '../ui/Dropdown'
import Page from '../Layout/Page'
import ImportYAMLCard from './ImportYAMLCard'

interface Props {
  onSelect?: (ws: Workspace) => void
  onCreateWorkspace?: () => void
  onEditWorkspace?: (name: string) => void
}

export default function ManageWorkspacesPage({ onSelect, onCreateWorkspace, onEditWorkspace }: Props) {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const toast = useToast()

  function load() {
    setRefreshing(true)
    adminListWorkspaces()
      .then(ws => { setWorkspaces((ws || []) as Workspace[]); setError(null) })
      .catch(err => setError(err instanceof Error ? err.message : 'Failed to load workspaces'))
      .finally(() => { setLoading(false); setRefreshing(false) })
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load() }, [])

  const { busyName, deleteEntity } = useDeleteEntity({ noun: 'workspace', remove: adminDeleteWorkspace, onDeleted: load })

  function menuItems(ws: Workspace): MenuItem[] {
    return [
      ...(onSelect ? [{ label: 'Open', icon: <ArrowRight />, onClick: () => onSelect(ws) }] : []),
      ...(onEditWorkspace ? [{ label: 'Edit', icon: <Pencil />, onClick: () => onEditWorkspace(ws.name) }] : []),
      { separator: true as const },
      { label: 'Delete', icon: <Trash2 />, danger: true, onClick: () => deleteEntity(ws.name) },
    ]
  }

  return (
    <Page>
      <PageHeader
        eyebrow="Manage"
        title="Workspaces"
        description="Groups of environments and services that share a hierarchy."
        actions={
          <>
            <IconButton label="Refresh" size="md" onClick={load} disabled={refreshing}>
              <RefreshCw className={cn('size-4', refreshing && 'animate-spin')} />
            </IconButton>
            <Button variant="secondary" leftIcon={showImport ? <X /> : <Upload />} onClick={() => setShowImport(s => !s)}>
              {showImport ? 'Cancel import' : 'Import YAML'}
            </Button>
            {onCreateWorkspace && <Button leftIcon={<Plus />} onClick={onCreateWorkspace}>Create workspace</Button>}
          </>
        }
      />

      {showImport && <ImportYAMLCard onDone={() => { setShowImport(false); toast.success('Import complete'); load() }} />}

      {error && (
        <Alert tone="danger" title="Couldn't load workspaces" className="mb-6"
          action={<Button size="sm" variant="secondary" onClick={load} loading={refreshing}>Retry</Button>}>
          {error}
        </Alert>
      )}

      <EntityCollection
        items={workspaces}
        keyFn={ws => ws.name}
        kind="workspace"
        name={ws => ws.name}
        description={ws => ws.description || ''}
        meta={ws => (
          <>
            <span className="flex items-center gap-1.5"><EntityIconRaw kind="environment" className="size-3.5" />{plural(ws.environments, 'env')}</span>
            <span className="flex items-center gap-1.5"><Server className="size-3.5" />{plural(ws.services, 'service')}</span>
          </>
        )}
        onOpen={onSelect && (ws => () => onSelect(ws))}
        menuItems={menuItems}
        busyKey={busyName}
        layoutKey="avalok-manage-ws-layout"
        loading={loading}
        noun="workspaces"
        empty={!error && (
          <EmptyState
            icon={<EntityIconRaw kind="workspace" />}
            title="No workspaces yet"
            description="Import a YAML file or create a workspace to get started."
            action={onCreateWorkspace && <Button leftIcon={<Plus />} onClick={onCreateWorkspace}>Create workspace</Button>}
          />
        )}
      />
    </Page>
  )
}
