// Single source of truth for semantic color ("tone") classes and status → tone mapping.
// Components and pages must use these instead of picking colors per file.

export type Tone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'info'

export const toneText: Record<Tone, string> = {
  neutral: 'text-fg-secondary',
  accent: 'text-accent',
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
  info: 'text-info',
}

export const toneSoft: Record<Tone, string> = {
  neutral: 'bg-surface-sunken',
  accent: 'bg-accent-soft',
  success: 'bg-success-soft',
  warning: 'bg-warning-soft',
  danger: 'bg-danger-soft',
  info: 'bg-info-soft',
}

export const toneLine: Record<Tone, string> = {
  neutral: 'border-line',
  accent: 'border-accent-line',
  success: 'border-success-line',
  warning: 'border-warning-line',
  danger: 'border-danger-line',
  info: 'border-info-line',
}

export const toneDot: Record<Tone, string> = {
  neutral: 'bg-fg-faint',
  accent: 'bg-accent',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
  info: 'bg-info',
}

/** Maps any health/connection/result string from the API to a tone. */
export function statusTone(status: string | null | undefined): Tone {
  switch ((status || '').toLowerCase()) {
    case 'up':
    case 'ok':
    case 'healthy':
    case 'running':
    case 'connected':
    case 'live':
    case 'active':
    case 'success':
      return 'success'
    case 'degraded':
    case 'warn':
    case 'warning':
    case 'pending':
    case 'paused':
    case 'reconnecting':
      return 'warning'
    case 'down':
    case 'error':
    case 'failed':
    case 'unhealthy':
    case 'disconnected':
    case 'offline':
      return 'danger'
    case 'info':
      return 'info'
    default:
      return 'neutral'
  }
}

/** Maps a parsed log level to a tone. */
export function levelTone(level: string | null | undefined): Tone {
  switch ((level || '').toLowerCase()) {
    case 'error':
    case 'fatal':
    case 'critical':
      return 'danger'
    case 'warn':
    case 'warning':
      return 'warning'
    case 'info':
      return 'info'
    default:
      return 'neutral'
  }
}
