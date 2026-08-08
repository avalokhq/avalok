import { cn } from '../../lib/cn'

const variants = {
  default: 'bg-[var(--bg-elevated)] text-[var(--text-secondary)]',
  success: 'bg-emerald-500/10 text-emerald-400',
  warning: 'bg-amber-500/10 text-amber-400',
  error: 'bg-red-500/10 text-red-400',
  info: 'bg-blue-500/10 text-blue-400',
  accent: 'bg-[var(--bg-active)] text-[var(--text-accent)]',
  ssh: 'bg-[#232A37] text-[#C9D2FF]',
  docker: 'bg-[#1C2A39] text-[#5FA9FF]',
  kubernetes: 'bg-[#1C263B] text-[#6BA5FF]',
  file: 'bg-[#272427] text-[#BFBFBF]',
  winrm: 'bg-[#2B2329] text-[#F4A8D1]',
  'windows-eventlog': 'bg-[#2B2329] text-[#F4A8D1]',
  iis: 'bg-[#2B2329] text-[#F4A8D1]',
  journalctl: 'bg-[#232A37] text-[#C9D2FF]',
  containerd: 'bg-[#1C2A39] text-[#5FA9FF]',
  s3: 'bg-[#1A2E1A] text-[#6CAE3E]',
  'azure-blob': 'bg-[#1A2535] text-[#32D4F5]',
  'azure-file': 'bg-[#1A2535] text-[#5EA0EF]',
  gcs: 'bg-[#1A2540] text-[#669DF6]',
} as const

export type BadgeVariant = keyof typeof variants

export function providerVariant(provider: string): BadgeVariant {
  return (provider in variants ? provider : 'default') as BadgeVariant
}

interface Props {
  children: React.ReactNode
  variant?: BadgeVariant
  className?: string
}

export default function Badge({ children, variant = 'default', className }: Props) {
  return (
    <span className={cn(
      'inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium',
      variants[variant],
      className
    )}>
      {children}
    </span>
  )
}
