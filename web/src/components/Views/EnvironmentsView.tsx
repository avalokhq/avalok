import { useState, useEffect } from 'react'
import { ChevronRight, Target } from 'lucide-react'
import { listEnvironments } from '../../lib/api'
import type { Workspace, Environment } from '../../lib/types'
import EntityIcon, { EntityIconRaw } from '../ui/EntityIcon'
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
  onSelect: (env: Environment) => void
}

export default function EnvironmentsView({ workspace, onSelect }: Props) {
  const [envs, setEnvs] = useState<Environment[]>([])
  const [loading, setLoading] = useState(true)
  const { layout, changeLayout } = useLayoutToggle('avalok-env-layout')

  useEffect(() => {
    listEnvironments(workspace.name)
      .then(setEnvs)
      .catch(err => console.error('Failed to load environments:', err))
      .finally(() => setLoading(false))
  }, [workspace.name])

  if (loading) return <Spinner label="Loading environments..." />

  return (
    <div className="flex-1 overflow-auto">
      <div className="px-8 lg:px-16 py-8">
        <PageHeader
          title={workspace.name}
          description={workspace.description}
          actions={<LayoutToggle layout={layout} onChange={changeLayout} />}
        />

        {envs.length === 0 ? (
          <EmptyState
            icon={<EntityIconRaw kind="environment" className="w-7 h-7 text-blue-400 opacity-60" />}
            iconBg="bg-blue-500/10"
            title="No environments"
            description="No environments configured for this workspace."
          />
        ) : layout === 'list' ? (
          <DataTable
            columns={[
              {
                key: 'name',
                header: 'Environment',
                render: (env) => (
                    <div className="flex items-center gap-3">
                      <EntityIcon kind="environment" />
                      <span className="font-medium text-[var(--text-primary)]">{env.name}</span>
                    </div>
                ),
              },
              {
                key: 'targets',
                header: 'Targets',
                className: 'w-32',
                render: (env) => (
                  <span className="flex items-center gap-1.5 text-[var(--text-secondary)]">
                    <Target className="w-3.5 h-3.5" />
                    {env.targets}
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
            data={envs}
            keyFn={env => env.name}
            onRowClick={onSelect}
          />
        ) : (
          <CollectionGrid>
            {envs.map(env => (
                <Card key={env.name} hover padding="md" className="cursor-pointer" onClick={() => onSelect(env)}>
                  <EntityIcon kind="environment" className="mb-3" />
                  <div className="text-sm font-medium text-[var(--text-primary)]">{env.name}</div>
                  <div className="flex items-center gap-1.5 mt-4 pt-3 border-t border-[var(--border-subtle)] w-full text-xs text-[var(--text-secondary)]">
                    <Target className="w-3 h-3" />
                    {env.targets} target{env.targets !== 1 ? 's' : ''}
                  </div>
                </Card>
              )
            )}
          </CollectionGrid>
        )}
      </div>
    </div>
  )
}
