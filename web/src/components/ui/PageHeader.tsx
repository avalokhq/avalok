import { cn } from '../../lib/cn'

interface PageHeaderProps {
  title: React.ReactNode
  description?: React.ReactNode
  /** Small mono uppercase label above the title (section / context). */
  eyebrow?: React.ReactNode
  actions?: React.ReactNode
  /** Rendered under the title row, e.g. <Tabs variant="underline" />. */
  tabs?: React.ReactNode
  className?: string
}

export default function PageHeader({ title, description, eyebrow, actions, tabs, className }: PageHeaderProps) {
  return (
    <header className={cn(tabs ? 'mb-6' : 'mb-8', 'animate-fade-up', className)}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          {eyebrow && (
            <div className="mb-2 font-mono text-2xs font-medium uppercase tracking-[0.12em] text-accent">{eyebrow}</div>
          )}
          <h1 className="text-2xl font-semibold tracking-tight text-fg">{title}</h1>
          {description && <p className="mt-1.5 max-w-2xl text-sm text-fg-secondary">{description}</p>}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
      {tabs && <div className="mt-6">{tabs}</div>}
    </header>
  )
}
