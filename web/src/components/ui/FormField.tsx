import { cn } from '../../lib/cn'

interface FormFieldProps {
  label: React.ReactNode
  required?: boolean
  /** Short inline note after the label, e.g. "optional". */
  hint?: string
  /** Helper text under the control. */
  help?: React.ReactNode
  /** Validation message under the control; replaces `help`. */
  error?: string | null
  htmlFor?: string
  children: React.ReactNode
  className?: string
}

export default function FormField({ label, required, hint, help, error, htmlFor, children, className }: FormFieldProps) {
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className="mb-1.5 block text-xs font-medium text-fg-secondary">
        {label}
        {required && <span className="ml-0.5 text-danger">*</span>}
        {hint && <span className="ml-1 font-normal text-fg-muted">({hint})</span>}
      </label>
      {children}
      {(error || help) && (
        <p className={cn('mt-1.5 text-xs', error ? 'text-danger' : 'text-fg-muted')}>{error || help}</p>
      )}
    </div>
  )
}
