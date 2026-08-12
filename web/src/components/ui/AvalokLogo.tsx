import { cn } from '../../lib/cn'

interface EyeProps {
  className?: string
  size?: number
}

export function AvalokEye({ className, size = 28 }: EyeProps) {
  return (
    <img
      src="/avalok-1.png"
      alt="Avalok"
      height={size}
      className={cn('block dark:invert', className)}
      style={{ height: size, width: 'auto' }}
    />
  )
}

interface WordmarkProps {
  className?: string
  height?: number
}

export function AvalokWordmark({ className, height = 20, forceInvert }: WordmarkProps & { forceInvert?: boolean }) {
  return (
    <img
      src="/avalok-5.png"
      alt="avalok"
      className={cn('block', forceInvert ? 'invert' : 'dark:invert', className)}
      style={{ height, width: 'auto' }}
    />
  )
}
