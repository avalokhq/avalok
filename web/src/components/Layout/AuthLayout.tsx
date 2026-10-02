import { AvalokWordmark } from '../ui/AvalokLogo'
import LogStreamBackground from './LogStreamBackground'

interface AuthLayoutProps {
  title?: string
  description?: string
  children: React.ReactNode
  /** Line under the card, e.g. "Don't have an account? Register". */
  footer?: React.ReactNode
}

/** Centered card on the canvas glow over a faint scrolling log stream, shared by sign-in and registration. */
export default function AuthLayout({ title, description, children, footer }: AuthLayoutProps) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-premium px-4 py-12">
      <LogStreamBackground />
      <div className="w-full max-w-[400px] animate-fade-up">
        <div className="mb-8 flex flex-col items-center gap-3">
          <AvalokWordmark height={32} />
          <span className="font-mono text-2xs uppercase tracking-[0.2em] text-fg-muted">observe with clarity</span>
        </div>

        <div className="rounded-overlay border border-line bg-surface p-7 shadow-lg">
          {title && <h1 className="text-xl font-semibold tracking-tight text-fg">{title}</h1>}
          {description && <p className="mt-1 text-sm text-fg-muted">{description}</p>}
          <div className={title || description ? 'mt-6' : undefined}>{children}</div>
        </div>

        {footer && <div className="mt-5 text-center text-sm text-fg-muted">{footer}</div>}
      </div>
    </div>
  )
}
