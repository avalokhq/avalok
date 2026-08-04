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

const IMAGE_ICONS: Record<string, { src: string; alt: string }> = {
  kubernetes: { src: KUBERNETES_LOGO, alt: 'Kubernetes' },
  s3: { src: '/icons/s3.svg', alt: 'S3' },
  'azure-blob': { src: '/icons/azure-blob.svg', alt: 'Azure Blob' },
  'azure-file': { src: '/icons/azure-file.svg', alt: 'Azure File' },
  gcs: { src: '/icons/gcs.svg', alt: 'GCS' },
}

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
  const img = IMAGE_ICONS[provider]
  if (img) {
    return <img src={img.src} alt={img.alt} className={cn('w-4 h-4', className)} />
  }
  const Icon = providerIcons[provider] || Server
  return <Icon className={cn('w-4 h-4', className)} />
}

export function resourceIconUrl(type: string): string | undefined {
  return IMAGE_ICONS[type]?.src
}
