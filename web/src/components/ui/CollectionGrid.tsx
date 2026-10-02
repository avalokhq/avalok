import { cn } from '../../lib/cn'

interface Props {
  children: React.ReactNode
  className?: string
}

export default function CollectionGrid({ children, className }: Props) {
  return (
    <div className={cn('grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5', className)}>
      {children}
    </div>
  )
}
