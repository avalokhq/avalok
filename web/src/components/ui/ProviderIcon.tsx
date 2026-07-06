import {
  Container,
  FileText,
  KeyRound,
  ScrollText,
  Server,
  Globe,
  Monitor,
} from 'lucide-react'
import { cn } from '../../lib/cn'

const KUBERNETES_LOGO = 'https://cdn.jsdelivr.net/gh/selfhst/icons@main/webp/kubernetes.webp'

const providerIcons: Record<string, React.FC<{ className?: string }>> = {
  docker: Container,
  file: FileText,
  ssh: KeyRound,
  journalctl: ScrollText,
  containerd: Server,
  iis: Globe,
  'windows-eventlog': Monitor,
}

interface Props {
  provider: string
  className?: string
}

export default function ProviderIcon({ provider, className }: Props) {
  if (provider === 'kubernetes') {
    return <img src={KUBERNETES_LOGO} alt="Kubernetes" className={cn('w-4 h-4', className)} />
  }
  const Icon = providerIcons[provider] || Server
  return <Icon className={cn('w-4 h-4', className)} />
}
