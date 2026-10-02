import { listStandaloneEnvServices, checkStandaloneEnvService } from '../../lib/api'
import type { Service } from '../../lib/types'
import ServiceList from './ServiceList'

interface Props {
  envName: string
  envDescription?: string
  onViewLogs: (service: Service) => void
  onBrowseFiles?: (service: Service) => void
}

/** Services of a standalone environment. */
export default function StandaloneEnvServicesView({ envName, envDescription, onViewLogs, onBrowseFiles }: Props) {
  return (
    <ServiceList
      eyebrow="Environment"
      title={envName}
      description={envDescription}
      sourceKey={`env/${envName}`}
      load={() => listStandaloneEnvServices(envName)}
      check={name => checkStandaloneEnvService(envName, name)}
      onViewLogs={onViewLogs}
      onBrowseFiles={onBrowseFiles}
      layoutKey="avalok-sa-env-svc-layout"
    />
  )
}
