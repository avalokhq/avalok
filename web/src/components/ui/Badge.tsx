import { cn } from '../../lib/cn'
import { toneDot, toneLine, toneSoft, toneText, type Tone } from '../../lib/statusTone'

// Legacy variants (kept so existing screens compile). Provider keys all render neutral;
// callers place a <ProviderIcon> inside the badge for brand recognition.
const LEGACY: Record<string, Tone> = {
  default: 'neutral',
  success: 'success',
  warning: 'warning',
  error: 'danger',
  info: 'info',
  accent: 'accent',
}

const PROVIDERS = [
  'ssh', 'docker', 'kubernetes', 'file', 'winrm', 'windows-eventlog', 'iis',
  'journalctl', 'containerd', 's3', 'azure-blob', 'azure-file', 'gcs',
] as const

export type BadgeVariant = 'default' | 'success' | 'warning' | 'error' | 'info' | 'accent' | (typeof PROVIDERS)[number]

export function providerVariant(provider: string): BadgeVariant {
  return ((PROVIDERS as readonly string[]).includes(provider) ? provider : 'default') as BadgeVariant
}

interface Props {
  children: React.ReactNode
  tone?: Tone
  /** @deprecated use `tone` */
  variant?: BadgeVariant
  /** Leading status dot in the tone color. */
  dot?: boolean
  size?: 'sm' | 'md'
  className?: string
  title?: string
}

export default function Badge({ children, tone, variant = 'default', dot, size = 'md', className, title }: Props) {
  const t: Tone = tone ?? LEGACY[variant] ?? 'neutral'
  return (
    <span
      title={title}
      className={cn(
        'inline-flex items-center gap-1 rounded-control border font-medium whitespace-nowrap',
        size === 'md' ? 'h-5 px-1.5 text-xs' : 'h-4 px-1 text-2xs',
        toneSoft[t],
        toneLine[t],
        toneText[t],
        className,
      )}
    >
      {dot && <span aria-hidden className={cn('size-1.5 rounded-full', toneDot[t])} />}
      {children}
    </span>
  )
}
