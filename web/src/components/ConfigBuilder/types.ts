export interface WorkspaceConfig {
  name: string
  description: string
  services: ServiceDef[]
  environments: EnvironmentDef[]
  settings: SettingsDef
}

export interface ServiceDef {
  id: string
  name: string
  provider: string
  friendly_name: string
  config: Record<string, string>
}

export interface EnvironmentDef {
  id: string
  name: string
  targets: TargetDef[]
}

export interface TargetDef {
  id: string
  name: string
  type: string
  connection: Record<string, string>
  credential_profile: string
  service_names: string[]
  service_overrides: ServiceOverrideDef[]
}

export interface ServiceOverrideDef {
  name: string
  config: Record<string, string>
}

export interface SettingsDef {
  log_buffer_size: number
  ssh_timeout: number
  hierarchy: string
}

export function createId(): string {
  return crypto.randomUUID().slice(0, 8)
}

export function emptyConfig(): WorkspaceConfig {
  return {
    name: '',
    description: '',
    services: [],
    environments: [],
    settings: { log_buffer_size: 5000, ssh_timeout: 30, hierarchy: 'default' },
  }
}
