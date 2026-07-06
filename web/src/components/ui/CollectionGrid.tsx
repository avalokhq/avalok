import { cn } from '../../lib/cn'

interface Props {
  children: React.ReactNode
  className?: string
}

export default function CollectionGrid({ children, className }: Props) {
  return (
    <div className={cn('grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-4', className)}>
      {children}
    </div>
  )
}
