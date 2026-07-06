interface ModalProps {
  title: string
  onClose: () => void
  children: React.ReactNode
  maxWidth?: string
}

export default function Modal({ title, onClose, children, maxWidth = 'max-w-lg' }: ModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className={`bg-[var(--bg-surface)] border border-[var(--border-strong)] rounded-xl shadow-[var(--shadow-dialog)] w-full ${maxWidth} mx-4 max-h-[85vh] overflow-auto`}
        onClick={e => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-[var(--border-subtle)]">
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">{title}</h3>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  )
}
