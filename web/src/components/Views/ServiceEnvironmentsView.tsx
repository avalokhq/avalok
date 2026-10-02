import { listServiceEnvironments } from '../../lib/api'
import type { Workspace, Environment } from '../../lib/types'
import EnvironmentList from './EnvironmentList'

interface Props {
  workspace: Workspace
  serviceName: string
  serviceLabel: string
  onSelectEnv: (env: Environment) => void
}

/** Environments a service runs in (service-first hierarchy). */
export default function ServiceEnvironmentsView({ workspace, serviceName, serviceLabel, onSelectEnv }: Props) {
  return (
    <EnvironmentList
      eyebrow={workspace.name}
      title={serviceLabel}
      description="Pick an environment to stream this service's logs."
      sourceKey={`${workspace.name}/${serviceName}`}
      load={() => listServiceEnvironments(workspace.name, serviceName)}
      onSelect={onSelectEnv}
      layoutKey="avalok-svc-env-layout"
      emptyDescription="This service isn't deployed to any environment."
    />
  )
}
