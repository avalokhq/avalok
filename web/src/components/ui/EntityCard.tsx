import { ArrowRight } from 'lucide-react'
import { cn } from '../../lib/cn'
import { toneDot } from '../../lib/statusTone'
import Card from './Card'
import { entityStyle, type EntityKind } from './EntityIcon'
import { ActionMenu, type MenuItem } from './Dropdown'

interface EntityCardProps {
  kind: EntityKind
  name: string
  description?: string
  /** Icon inside the tile; defaults to the kind icon (pass a ProviderIcon for services/resources). */
  icon?: React.ReactNode
  /** Badges next to the kind label (provider, hierarchy, …). */
  badges?: React.ReactNode
  /** Footer left side: counts, provider, etc. */
  meta?: React.ReactNode
  /** Footer call-to-action text, e.g. "Open" or "View logs". */
  actionLabel?: string
  onOpen?: () => void
  /** "⋯" menu items; the menu is always visible so actions aren't hover-only. */
  menuItems?: MenuItem[]
  /** Position in the grid, used to stagger the entrance animation. */
  index?: number
  /** Dims the card while a mutation (e.g. delete) is in flight. */
  busy?: boolean
  className?: string
}

/** Grid card for a workspace / environment / service / resource. */
export default function EntityCard({
  kind, name, description, icon, badges, meta, actionLabel = 'Open', onOpen, menuItems, index = 0, busy, className,
}: EntityCardProps) {
  const style = entityStyle(kind)
  const Icon = style.Icon
  return (
    // The entrance animation lives on a wrapper: its retained transform would otherwise cancel the card's hover lift.
    <div className="flex animate-fade-up" style={{ animationDelay: `${Math.min(index, 12) * 30}ms` }}>
      <Card
        padding="none"
        onClick={onOpen}
        aria-label={onOpen ? `${actionLabel} ${style.label.toLowerCase()} ${name}` : undefined}
        aria-busy={busy || undefined}
        className={cn(
          'group relative flex flex-1 flex-col overflow-hidden text-left',
          busy && 'pointer-events-none opacity-50',
          className,
        )}
      >
        {/* Kind-colored hairline that draws in on hover / focus */}
        <span
          aria-hidden
          className={cn(
            'absolute inset-x-0 top-0 h-0.5 origin-left scale-x-0 transition-transform duration-200 ease-out',
            onOpen && 'group-hover:scale-x-100 group-focus-visible:scale-x-100',
            toneDot[style.tone],
          )}
        />

        <div className="flex items-start gap-3 px-5 pt-5">
          <div
            className={cn(
              'flex size-10 shrink-0 items-center justify-center rounded-card transition-transform duration-200 ease-out [&_svg]:size-5',
              onOpen && 'group-hover:scale-105',
              style.bg,
              style.color,
            )}
          >
            {icon ?? <Icon />}
          </div>
          <div className="min-w-0 flex-1 pt-0.5">
            <div className="truncate text-sm font-semibold text-fg" title={name}>{name}</div>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <span className={cn('text-2xs font-medium uppercase tracking-wider', style.color)}>{style.label}</span>
              {badges}
            </div>
          </div>
          {menuItems && menuItems.length > 0 && <ActionMenu items={menuItems} label={`Actions for ${name}`} className="-mr-2 -mt-1" />}
        </div>

        <p className={cn('mb-4 line-clamp-2 min-h-8 px-5 mt-3 text-xs', description ? 'text-fg-secondary' : 'italic text-fg-faint')}>
          {description || 'No description'}
        </p>

        <div className="mt-auto flex min-h-11 items-center gap-3 border-t border-line px-5 py-2.5 text-xs text-fg-muted">
          <div className="flex min-w-0 flex-1 items-center gap-3">{meta}</div>
          {onOpen && (
            <span className="flex shrink-0 items-center gap-1 font-medium transition-colors group-hover:text-accent group-focus-visible:text-accent">
              {actionLabel}
              <ArrowRight className="size-3.5 transition-transform duration-200 ease-out group-hover:translate-x-0.5" />
            </span>
          )}
        </div>
      </Card>
    </div>
  )
}
