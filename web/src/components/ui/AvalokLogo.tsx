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

// Uses dedicated light/dark artwork. CSS invert would turn the blue dot orange.
export function AvalokWordmark({ className, height = 20, onDark }: WordmarkProps & { onDark?: boolean }) {
  const style = { height, width: 'auto' }
  if (onDark) {
    return <img src="/avalok-dark-mode.png" alt="avalok" className={cn('block', className)} style={style} />
  }
  return (
    <>
      <img src="/avalok-light-mode.png" alt="avalok" className={cn('block dark:hidden', className)} style={style} />
      <img src="/avalok-dark-mode.png" alt="avalok" className={cn('hidden dark:block', className)} style={style} />
    </>
  )
}
