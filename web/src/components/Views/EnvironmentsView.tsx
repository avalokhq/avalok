import { listEnvironments } from '../../lib/api'
import type { Workspace, Environment } from '../../lib/types'
import EnvironmentList from './EnvironmentList'

interface Props {
  workspace: Workspace
  onSelect: (env: Environment) => void
}

/** Environments of a workspace (environment-first hierarchy). */
export default function EnvironmentsView({ workspace, onSelect }: Props) {
  return (
    <EnvironmentList
      eyebrow="Workspace"
      title={workspace.name}
      description={workspace.description}
      sourceKey={workspace.name}
      load={() => listEnvironments(workspace.name)}
      onSelect={onSelect}
      layoutKey="avalok-env-layout"
      emptyDescription="No environments are configured for this workspace."
    />
  )
}
