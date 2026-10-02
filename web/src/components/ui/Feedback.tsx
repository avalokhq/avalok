import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react'
import { cn } from '../../lib/cn'
import { toneText } from '../../lib/statusTone'
import Button from './Button'
import Modal from './Modal'

/* ─────────────────────────── Confirm ─────────────────────────── */

export interface ConfirmOptions {
  title: string
  description?: React.ReactNode
  confirmLabel?: string
  cancelLabel?: string
  /** Destructive action: red confirm button. */
  danger?: boolean
}

type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>

const ConfirmContext = createContext<ConfirmFn | null>(null)

/** `const confirm = useConfirm(); if (!(await confirm({ title, danger: true }))) return` */
export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext)
  if (!ctx) throw new Error('useConfirm must be used inside <FeedbackProvider>')
  return ctx
}

export function ConfirmDialog({
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger,
  onConfirm,
  onCancel,
  loading,
}: ConfirmOptions & { onConfirm: () => void; onCancel: () => void; loading?: boolean }) {
  return (
    <Modal
      title={title}
      size="sm"
      onClose={onCancel}
      footer={
        <>
          <Button variant="secondary" onClick={onCancel}>{cancelLabel}</Button>
          <Button variant={danger ? 'destructive' : 'primary'} loading={loading} onClick={onConfirm} autoFocus>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {description && <div className="text-sm text-fg-secondary">{description}</div>}
    </Modal>
  )
}

/* ─────────────────────────── Toast ─────────────────────────── */

type ToastTone = 'success' | 'danger' | 'warning' | 'info'

interface ToastItem {
  id: number
  tone: ToastTone
  title: string
  description?: string
}

interface ToastApi {
  success: (title: string, description?: string) => void
  error: (title: string, description?: string) => void
  warning: (title: string, description?: string) => void
  info: (title: string, description?: string) => void
}

const ToastContext = createContext<ToastApi | null>(null)

/** `const toast = useToast(); toast.success('Saved')` */
export function useToast(): ToastApi {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used inside <FeedbackProvider>')
  return ctx
}

const TOAST_ICONS: Record<ToastTone, React.FC<{ className?: string }>> = {
  success: CheckCircle2,
  danger: XCircle,
  warning: AlertTriangle,
  info: Info,
}

function Toast({ item, onDismiss }: { item: ToastItem; onDismiss: (id: number) => void }) {
  const Icon = TOAST_ICONS[item.tone]
  const [paused, setPaused] = useState(false)

  useEffect(() => {
    if (paused) return
    const t = setTimeout(() => onDismiss(item.id), item.tone === 'danger' ? 7000 : 4000)
    return () => clearTimeout(t)
  }, [paused, item.id, item.tone, onDismiss])

  return (
    <div
      role={item.tone === 'danger' ? 'alert' : 'status'}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      className="pointer-events-auto flex w-80 items-start gap-3 rounded-card border border-line bg-surface-raised p-3 shadow-lg animate-fade-up"
    >
      <Icon className={cn('mt-0.5 size-4 shrink-0', toneText[item.tone])} />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-fg">{item.title}</div>
        {item.description && <div className="mt-0.5 break-words text-xs text-fg-muted">{item.description}</div>}
      </div>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={() => onDismiss(item.id)}
        className="-m-1 flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-control text-fg-muted transition-colors hover:bg-hover hover:text-fg"
      >
        <X className="size-3.5" />
      </button>
    </div>
  )
}

/* ─────────────────────────── Provider ─────────────────────────── */

/** Mount once around the app. Provides useConfirm() and useToast(). */
export function FeedbackProvider({ children }: { children: React.ReactNode }) {
  const [confirmState, setConfirmState] = useState<ConfirmOptions | null>(null)
  const resolver = useRef<((v: boolean) => void) | null>(null)
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const nextId = useRef(1)

  const confirm = useCallback<ConfirmFn>(opts => {
    resolver.current?.(false)
    setConfirmState(opts)
    return new Promise<boolean>(resolve => { resolver.current = resolve })
  }, [])

  function settle(result: boolean) {
    resolver.current?.(result)
    resolver.current = null
    setConfirmState(null)
  }

  const dismiss = useCallback((id: number) => setToasts(ts => ts.filter(t => t.id !== id)), [])

  const [toastApi] = useState<ToastApi>(() => {
    const push = (tone: ToastTone) => (title: string, description?: string) =>
      setToasts(ts => [...ts.slice(-4), { id: nextId.current++, tone, title, description }])
    return { success: push('success'), error: push('danger'), warning: push('warning'), info: push('info') }
  })

  return (
    <ConfirmContext.Provider value={confirm}>
      <ToastContext.Provider value={toastApi}>
        {children}
        {confirmState && <ConfirmDialog {...confirmState} onConfirm={() => settle(true)} onCancel={() => settle(false)} />}
        {createPortal(
          <div aria-live="polite" className="pointer-events-none fixed bottom-4 right-4 z-[110] flex flex-col items-end gap-2">
            {toasts.map(t => <Toast key={t.id} item={t} onDismiss={dismiss} />)}
          </div>,
          document.body,
        )}
      </ToastContext.Provider>
    </ConfirmContext.Provider>
  )
}
