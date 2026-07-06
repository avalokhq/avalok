interface FormFieldProps {
  label: string
  required?: boolean
  hint?: string
  children: React.ReactNode
  className?: string
}

export default function FormField({ label, required, hint, children, className }: FormFieldProps) {
  return (
    <div className={className}>
      <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
        {label}
        {required && <span className="text-red-400 ml-0.5">*</span>}
        {hint && <span className="text-[var(--text-subtle)] font-normal ml-1">({hint})</span>}
      </label>
      {children}
    </div>
  )
}
