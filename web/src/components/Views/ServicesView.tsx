import { listServices, checkService } from '../../lib/api'
import type { Workspace, Environment, Service } from '../../lib/types'
import ServiceList from './ServiceList'

interface Props {
  workspace: Workspace
  environment: Environment
  onViewLogs: (service: Service) => void
  onBrowseFiles?: (service: Service) => void
  onBrowseStorage?: (service: Service) => void
}

/** Services of one environment inside a workspace. */
export default function ServicesView({ workspace, environment, onViewLogs, onBrowseFiles, onBrowseStorage }: Props) {
  return (
    <ServiceList
      eyebrow={workspace.name}
      title={environment.name}
      description={workspace.description}
      sourceKey={`${workspace.name}/${environment.name}`}
      load={() => listServices(workspace.name, environment.name)}
      check={name => checkService(workspace.name, environment.name, name)}
      onViewLogs={onViewLogs}
      onBrowseFiles={onBrowseFiles}
      onBrowseStorage={onBrowseStorage}
      layoutKey="avalok-svc-layout"
    />
  )
}
