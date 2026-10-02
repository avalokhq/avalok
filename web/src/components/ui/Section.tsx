import { cn } from '../../lib/cn'

interface SectionProps {
  title: React.ReactNode
  description?: React.ReactNode
  actions?: React.ReactNode
  children: React.ReactNode
  className?: string
}

export default function Section({ title, description, actions, children, className }: SectionProps) {
  return (
    <section className={className}>
      <div className={cn('mb-4 flex items-end justify-between gap-4')}>
        <div className="min-w-0">
          <h2 className="text-lg font-semibold tracking-tight text-fg">{title}</h2>
          {description && <p className="mt-0.5 text-sm text-fg-muted">{description}</p>}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
      {children}
    </section>
  )
}
