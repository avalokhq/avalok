import {
  FileText,
  KeyRound,
  ScrollText,
  Server,
} from 'lucide-react'
import { cn } from '../../lib/cn'

const KUBERNETES_LOGO = 'https://cdn.jsdelivr.net/gh/selfhst/icons@main/webp/kubernetes.webp'
const CONTAINERD_LOGO = 'https://containerd.io/img/logos/main-logo.png'

const IMAGE_ICONS: Record<string, { src: string; alt: string }> = {
  docker: { src: '/icons/docker.svg', alt: 'Docker' },
  kubernetes: { src: KUBERNETES_LOGO, alt: 'Kubernetes' },
  containerd: { src: CONTAINERD_LOGO, alt: 'Containerd' },
  s3: { src: '/icons/s3.svg', alt: 'S3' },
  'azure-blob': { src: '/icons/azure-blob.svg', alt: 'Azure Blob' },
  'azure-file': { src: '/icons/azure-file.svg', alt: 'Azure File' },
  'azure-storage': { src: '/icons/azure-storage.svg', alt: 'Azure Storage' },
  gcs: { src: '/icons/gcs.svg', alt: 'GCS' },
  winrm: { src: '/icons/winrm.svg', alt: 'WinRM' },
  'windows-eventlog': { src: '/icons/windows-eventlog.svg', alt: 'Windows Event Log' },
  iis: { src: '/icons/iis.svg', alt: 'IIS' },
}

const providerIcons: Record<string, React.FC<{ className?: string }>> = {
  file: FileText,
  ssh: KeyRound,
  journalctl: ScrollText,
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
