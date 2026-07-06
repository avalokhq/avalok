import YAML from 'yaml'
import type { WorkspaceConfig, ServiceDef, EnvironmentDef, TargetDef, ServiceOverrideDef } from './types'
import { createId } from './types'

export function parseWorkspaceYaml(text: string): WorkspaceConfig {
  const doc = YAML.parse(text)
  if (!doc) throw new Error('Empty YAML document')

  const ws = doc.workspace ?? doc
  const rawServices: any[] = doc.services ?? ws.services ?? []
  const rawEnvs: any[] = doc.environments ?? ws.environments ?? []
  const rawSettings = doc.settings ?? ws.settings ?? {}

  const services: ServiceDef[] = rawServices.map(s => ({
    id: createId(),
    name: s.name ?? '',
    provider: s.provider ?? 'file',
    friendly_name: s.friendly_name ?? '',
    config: toStringRecord(s.config),
  }))

  const environments: EnvironmentDef[] = rawEnvs.map(e => ({
    id: createId(),
    name: e.name ?? '',
    targets: (e.targets ?? []).map((t: any) => parseTarget(t)),
  }))

  return {
    name: ws.name ?? '',
    description: ws.description ?? '',
    services,
    environments,
    settings: {
      log_buffer_size: rawSettings.log_buffer_size ?? 5000,
      ssh_timeout: rawSettings.ssh_timeout ?? 30,
      hierarchy: rawSettings.hierarchy ?? 'default',
    },
  }
}

const TARGET_CONNECTION_KEYS = ['host', 'user', 'port', 'key_path', 'password', 'passphrase', 'context', 'namespace', 'kubeconfig', 'proxy_url', 'api_server_url', 'bearer_token', 'ca_cert', 'kubeconfig_content']
const TARGET_BOOLEAN_KEYS = ['sudo', 'use_https', 'insecure', 'insecure_skip_tls']

function parseTarget(t: any): TargetDef {
  const connection: Record<string, string> = {}
  for (const key of TARGET_CONNECTION_KEYS) {
    if (t[key] != null) connection[key] = String(t[key])
  }
  for (const key of TARGET_BOOLEAN_KEYS) {
    if (t[key] === true) connection[key] = 'true'
  }

  const serviceNames: string[] = t.service_names ?? []
  const serviceOverrides: ServiceOverrideDef[] = (t.services ?? []).map((s: any) => ({
    name: s.name ?? '',
    config: toStringRecord(s.config),
  }))

  return {
    id: createId(),
    name: t.name ?? '',
    type: t.type ?? 'local',
    connection,
    credential_profile: t.credential_profile ?? '',
    service_names: serviceNames,
    service_overrides: serviceOverrides,
  }
}

function toStringRecord(obj: any): Record<string, string> {
  if (!obj || typeof obj !== 'object') return {}
  const result: Record<string, string> = {}
  for (const [k, v] of Object.entries(obj)) {
    if (v != null) result[k] = String(v)
  }
  return result
}
