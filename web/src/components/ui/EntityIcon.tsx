import { Layers, Globe, Server, Database } from 'lucide-react'
import { cn } from '../../lib/cn'

export type EntityKind = 'workspace' | 'environment' | 'service' | 'resource'

const STYLES: Record<EntityKind, {
  label: string
  Icon: React.FC<{ className?: string }>
  bg: string
  color: string
  badge: string
}> = {
  workspace: {
    label: 'Workspace',
    Icon: Layers,
    bg: 'bg-accent-500/10',
    color: 'text-[var(--text-accent)]',
    badge: 'bg-accent-500/10 text-[var(--text-accent)] border-accent-500/20',
  },
  environment: {
    label: 'Environment',
    Icon: Globe,
    bg: 'bg-blue-500/10',
    color: 'text-blue-400',
    badge: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  },
  service: {
    label: 'Service',
    Icon: Server,
    bg: 'bg-emerald-500/10',
    color: 'text-emerald-400',
    badge: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  },
  resource: {
    label: 'Resource',
    Icon: Database,
    bg: 'bg-amber-500/10',
    color: 'text-amber-400',
    badge: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  },
}

export function entityStyle(kind: EntityKind) {
  return STYLES[kind]
}

export function entityLabel(kind: EntityKind) {
  return STYLES[kind].label
}

export function EntityIconRaw({ kind, className }: { kind: EntityKind; className?: string }) {
  const { Icon } = STYLES[kind]
  return <Icon className={className} />
}

export default function EntityIcon({ kind, size = 'md', className }: { kind: EntityKind; size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const { Icon, bg, color } = STYLES[kind]
  const sizeMap = { sm: 'w-6 h-6', md: 'w-8 h-8', lg: 'w-10 h-10' }
  const iconSizeMap = { sm: 'w-3 h-3', md: 'w-4 h-4', lg: 'w-5 h-5' }
  return (
    <div className={cn('rounded-lg flex items-center justify-center shrink-0', sizeMap[size], bg, color, className)}>
      <Icon className={iconSizeMap[size]} />
    </div>
  )
}
