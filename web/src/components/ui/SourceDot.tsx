import { cn } from '../../lib/cn'

const SOURCE_COLORS = [
  'bg-source-0', 'bg-source-1', 'bg-source-2', 'bg-source-3', 'bg-source-4',
  'bg-source-5', 'bg-source-6', 'bg-source-7', 'bg-source-8', 'bg-source-9',
]

function hashString(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0
  }
  return Math.abs(h)
}

interface Props {
  name: string
  size?: 'sm' | 'md'
  className?: string
}

export default function SourceDot({ name, size = 'sm', className }: Props) {
  const colorClass = SOURCE_COLORS[hashString(name) % SOURCE_COLORS.length]
  return (
    <span className={cn(
      'inline-block rounded-full shrink-0',
      size === 'sm' ? 'w-2 h-2' : 'w-2.5 h-2.5',
      colorClass,
      className
    )} />
  )
}

export function getSourceColor(name: string): string {
  const colors = [
    'var(--color-source-0)', 'var(--color-source-1)', 'var(--color-source-2)',
    'var(--color-source-3)', 'var(--color-source-4)', 'var(--color-source-5)',
    'var(--color-source-6)', 'var(--color-source-7)', 'var(--color-source-8)',
    'var(--color-source-9)',
  ]
  return colors[hashString(name) % colors.length]
}
