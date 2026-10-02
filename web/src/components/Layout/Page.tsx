import { cn } from '../../lib/cn'

interface PageProps {
  children: React.ReactNode
  /** Extra classes for the inner content container. */
  className?: string
}

/**
 * Scrollable page body used by every routed view: full width, left-aligned, standard padding.
 * Never add a max-width / mx-auto here or per page, so all pages line up the same way.
 */
export default function Page({ children, className }: PageProps) {
  return (
    <div className="flex-1 overflow-auto">
      <div className={cn('px-6 py-8 lg:px-10', className)}>{children}</div>
    </div>
  )
}
