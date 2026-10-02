import { Layers, Globe, Server, Database } from 'lucide-react'
import { cn } from '../../lib/cn'
import { toneLine, toneSoft, toneText, type Tone } from '../../lib/statusTone'

export type EntityKind = 'workspace' | 'environment' | 'service' | 'resource'

const KINDS: Record<EntityKind, { label: string; Icon: React.FC<{ className?: string }>; tone: Tone }> = {
  workspace: { label: 'Workspace', Icon: Layers, tone: 'accent' },
  environment: { label: 'Environment', Icon: Globe, tone: 'info' },
  service: { label: 'Service', Icon: Server, tone: 'success' },
  resource: { label: 'Resource', Icon: Database, tone: 'warning' },
}

export function entityStyle(kind: EntityKind) {
  const { label, Icon, tone } = KINDS[kind]
  return {
    label,
    Icon,
    tone,
    bg: toneSoft[tone],
    color: toneText[tone],
    badge: cn(toneSoft[tone], toneText[tone], toneLine[tone]),
  }
}

export function entityLabel(kind: EntityKind) {
  return KINDS[kind].label
}

export function EntityIconRaw({ kind, className }: { kind: EntityKind; className?: string }) {
  const { Icon } = KINDS[kind]
  return <Icon className={className} />
}

const boxSizes = { sm: 'size-6', md: 'size-8', lg: 'size-10' }
const iconSizes = { sm: 'size-3', md: 'size-4', lg: 'size-5' }

export default function EntityIcon({ kind, size = 'md', className }: { kind: EntityKind; size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const { Icon, tone } = KINDS[kind]
  return (
    <div className={cn('flex shrink-0 items-center justify-center rounded-control', boxSizes[size], toneSoft[tone], toneText[tone], className)}>
      <Icon className={iconSizes[size]} />
    </div>
  )
}
