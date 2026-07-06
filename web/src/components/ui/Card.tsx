import { cn } from '../../lib/cn'

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  hover?: boolean
  selected?: boolean
  padding?: 'none' | 'sm' | 'md' | 'lg'
}

const paddings = {
  none: '',
  sm: 'p-3',
  md: 'p-4',
  lg: 'p-5',
}

export default function Card({ hover = false, selected = false, padding = 'md', className, children, ...props }: CardProps) {
  return (
    <div
      className={cn(
        'rounded-xl border bg-[var(--bg-surface)]',
        selected ? 'border-[var(--border-hover)] bg-[var(--bg-selected)]' : 'border-[var(--border-default)]',
        hover && 'transition-all duration-150 hover:border-[var(--border-hover)]',
        paddings[padding],
        className,
      )}
      {...props}
    >
      {children}
    </div>
  )
}
