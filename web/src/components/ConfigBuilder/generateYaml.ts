import type { WorkspaceConfig } from './types'
import { SENSITIVE_KEYS } from './schema'

const SERVICE_BOOLEAN_KEYS = new Set(['all_containers', 'previous', 'sudo', 'read_all', 'force_path_style'])
const SERVICE_NUMBER_KEYS = new Set(['tail_lines', 'poll_interval'])

function yamlValue(v: string): string {
  if (!v) return "''"
  if (/[:#{}[\],&*?|>!%@`]/.test(v) || v.includes("'") || v.includes('"')) {
    return `"${v.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
  }
  if (v === 'true' || v === 'false' || v === 'null' || /^\d+$/.test(v)) {
    return `"${v}"`
  }
  return v
}

export function generateYaml(config: WorkspaceConfig, opts?: { redact?: boolean; mode?: 'workspace' | 'environment' | 'service' }): string {
  const redact = opts?.redact ?? false
  const mode = opts?.mode ?? 'workspace'

  if (mode === 'service') return generateServiceYaml(config, redact)
  if (mode === 'environment') return generateEnvironmentYaml(config, redact)
  return generateWorkspaceYaml(config, redact)
}

function emitTarget(lines: string[], target: import('./types').TargetDef, indent: string, redact: boolean) {
  lines.push(`${indent}- name: ${yamlValue(target.name || 'unnamed')}`)
  lines.push(`${indent}  type: ${target.type}`)
  if (target.credential_profile) {
    lines.push(`${indent}  credential_profile: ${yamlValue(target.credential_profile)}`)
  }
  for (const [key, value] of Object.entries(target.connection)) {
    if (value) {
      if (key === 'sudo' || key === 'use_https' || key === 'insecure') {
        lines.push(`${indent}  ${key}: true`)
      } else if (redact && SENSITIVE_KEYS.has(key)) {
        lines.push(`${indent}  ${key}: "********"`)
      } else {
        lines.push(`${indent}  ${key}: ${yamlValue(value)}`)
      }
    }
  }
  if (target.service_names.length > 0) {
    lines.push(`${indent}  service_names: [${target.service_names.join(', ')}]`)
  }
  if (target.service_overrides.length > 0) {
    lines.push(`${indent}  services:`)
    for (const ovr of target.service_overrides) {
      lines.push(`${indent}    - name: ${yamlValue(ovr.name)}`)
      const ovrEntries = Object.entries(ovr.config).filter(([, v]) => v)
      if (ovrEntries.length > 0) {
        lines.push(`${indent}      config:`)
        for (const [key, value] of ovrEntries) {
          if (SERVICE_BOOLEAN_KEYS.has(key)) {
            lines.push(`${indent}        ${key}: true`)
          } else if (SERVICE_NUMBER_KEYS.has(key)) {
            lines.push(`${indent}        ${key}: ${value}`)
          } else {
            lines.push(`${indent}        ${key}: ${yamlValue(value)}`)
          }
        }
      }
    }
  }
}

function emitServices(lines: string[], services: import('./types').ServiceDef[]) {
  if (services.length === 0) return
  lines.push('')
  lines.push('services:')
  for (const svc of services) {
    lines.push(`  - name: ${yamlValue(svc.name || 'unnamed')}`)
    lines.push(`    provider: ${svc.provider}`)
    if (svc.friendly_name) {
      lines.push(`    friendly_name: ${yamlValue(svc.friendly_name)}`)
    }
    if (svc.resource) {
      lines.push(`    resource: ${yamlValue(svc.resource)}`)
    }
    const cfgEntries = Object.entries(svc.config).filter(([, v]) => v)
    if (cfgEntries.length > 0) {
      lines.push('    config:')
      for (const [key, value] of cfgEntries) {
        if (SERVICE_BOOLEAN_KEYS.has(key)) {
          lines.push(`      ${key}: true`)
        } else if (SERVICE_NUMBER_KEYS.has(key)) {
          lines.push(`      ${key}: ${value}`)
        } else {
          lines.push(`      ${key}: ${yamlValue(value)}`)
        }
      }
    }
    lines.push('')
  }
}

function generateWorkspaceYaml(config: WorkspaceConfig, redact: boolean): string {
  const lines: string[] = []

  lines.push('workspace:')
  lines.push(`  name: ${yamlValue(config.name || 'my-workspace')}`)
  if (config.description) {
    lines.push(`  description: ${yamlValue(config.description)}`)
  }

  emitServices(lines, config.services)

  if (config.environments.length > 0) {
    lines.push('environments:')
    for (const env of config.environments) {
      lines.push(`  - name: ${yamlValue(env.name || 'unnamed')}`)
      if (env.targets.length > 0) {
        lines.push('    targets:')
        for (const target of env.targets) {
          emitTarget(lines, target, '      ', redact)
          lines.push('')
        }
      }
    }
  }

  const { ssh_timeout, hierarchy } = config.settings
  if (ssh_timeout || (hierarchy && hierarchy !== 'default')) {
    lines.push('settings:')
    if (hierarchy && hierarchy !== 'default') {
      lines.push(`  hierarchy: ${hierarchy}`)
    }
    if (ssh_timeout) {
      lines.push(`  ssh_timeout: ${ssh_timeout}`)
    }
  }

  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n'
}

function generateEnvironmentYaml(config: WorkspaceConfig, redact: boolean): string {
  const lines: string[] = []

  lines.push(`name: ${yamlValue(config.name || 'my-environment')}`)
  if (config.description) {
    lines.push(`description: ${yamlValue(config.description)}`)
  }

  emitServices(lines, config.services)

  const targets = config.environments[0]?.targets ?? []
  if (targets.length > 0) {
    lines.push('')
    lines.push('targets:')
    for (const target of targets) {
      emitTarget(lines, target, '  ', redact)
      lines.push('')
    }
  }

  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n'
}

function generateServiceYaml(config: WorkspaceConfig, redact: boolean): string {
  const lines: string[] = []
  const svc = config.services[0]

  lines.push(`name: ${yamlValue(config.name || 'my-service')}`)
  if (config.description) {
    lines.push(`description: ${yamlValue(config.description)}`)
  }
  if (svc) {
    lines.push(`provider: ${svc.provider}`)
    if (svc.resource) {
      lines.push(`resource: ${yamlValue(svc.resource)}`)
    }
    const cfgEntries = Object.entries(svc.config).filter(([, v]) => v)
    if (cfgEntries.length > 0) {
      lines.push('config:')
      for (const [key, value] of cfgEntries) {
        if (SERVICE_BOOLEAN_KEYS.has(key)) {
          lines.push(`  ${key}: true`)
        } else if (SERVICE_NUMBER_KEYS.has(key)) {
          lines.push(`  ${key}: ${value}`)
        } else {
          lines.push(`  ${key}: ${yamlValue(value)}`)
        }
      }
    }
  }

  const target = config.environments[0]?.targets[0]
  if (target) {
    lines.push('')
    lines.push('target:')
    lines.push(`  name: ${yamlValue(target.name || 'unnamed')}`)
    lines.push(`  type: ${target.type}`)
    if (target.credential_profile) {
      lines.push(`  credential_profile: ${yamlValue(target.credential_profile)}`)
    }
    for (const [key, value] of Object.entries(target.connection)) {
      if (value) {
        if (key === 'sudo' || key === 'use_https' || key === 'insecure') {
          lines.push(`  ${key}: true`)
        } else if (redact && SENSITIVE_KEYS.has(key)) {
          lines.push(`  ${key}: "********"`)
        } else {
          lines.push(`  ${key}: ${yamlValue(value)}`)
        }
      }
    }
  }

  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n'
}
