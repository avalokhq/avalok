import { cn } from '../../lib/cn'

/** Shimmer placeholder. Loading states should mirror the loaded layout using these. */
function Block({ className }: { className?: string }) {
  return <div aria-hidden className={cn('skeleton', className)} />
}

function Line({ className, width = 'w-full' }: { className?: string; width?: string }) {
  return <div aria-hidden className={cn('skeleton h-3 !rounded-control', width, className)} />
}

function SkeletonCard({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cn('rounded-card border border-line bg-surface p-5 shadow-sm', className)}>
      <div className="flex items-center gap-3">
        <Block className="size-8 !rounded-control" />
        <div className="flex-1 space-y-2">
          <Line width="w-1/2" />
          <Line width="w-1/3" className="h-2.5" />
        </div>
      </div>
      <div className="mt-5 space-y-2">
        <Line />
        <Line width="w-4/5" />
      </div>
    </div>
  )
}

function TableRows({ rows = 5, columns = 4 }: { rows?: number; columns?: number }) {
  return (
    <>
      {Array.from({ length: rows }, (_, r) => (
        <tr key={r} aria-hidden className="border-t border-line">
          {Array.from({ length: columns }, (_, c) => (
            <td key={c} className="px-4 py-3">
              <Line width={c === 0 ? 'w-3/4' : 'w-1/2'} />
            </td>
          ))}
        </tr>
      ))}
    </>
  )
}

const Skeleton = Object.assign(Block, { Block, Line, Card: SkeletonCard, TableRows })
export default Skeleton
