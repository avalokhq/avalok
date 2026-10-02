import { forwardRef, useState } from 'react'
import { Eye, EyeOff, Search, X } from 'lucide-react'
import { cn } from '../../lib/cn'
import Kbd from './Kbd'

// Shared field look: same height as Button md, sunken fill, accent border + soft ring on focus.
export const fieldBase =
  'w-full rounded-control border border-line bg-surface-sunken text-sm text-fg placeholder:text-fg-faint ' +
  'transition-[border-color,box-shadow] duration-150 hover:border-line-strong ' +
  'focus:border-accent focus:outline-none focus:ring-3 focus:ring-accent-soft focus-visible:outline-none ' +
  'disabled:cursor-not-allowed disabled:opacity-50 aria-[invalid=true]:border-danger'

interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
  invalid?: boolean
  /** `md` 32px matches Button md (default); `lg` 36px for auth and hero forms. */
  size?: 'md' | 'lg'
}

const Input = forwardRef<HTMLInputElement, InputProps>(function Input({ className, invalid, size = 'md', ...props }, ref) {
  return (
    <input
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(fieldBase, size === 'lg' ? 'h-9' : 'h-8', 'px-3', className)}
      {...props}
    />
  )
})
export default Input

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean
}

export function Textarea({ className, invalid, ...props }: TextareaProps) {
  return <textarea aria-invalid={invalid || undefined} className={cn(fieldBase, 'min-h-20 resize-y px-3 py-2', className)} {...props} />
}

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  invalid?: boolean
}

export function Select({ className, invalid, children, ...props }: SelectProps) {
  return (
    <select aria-invalid={invalid || undefined} className={cn(fieldBase, 'select-chevron h-8 cursor-pointer appearance-none pl-3 pr-8', className)} {...props}>
      {children}
    </select>
  )
}

interface InputGroupProps extends InputProps {
  leading?: React.ReactNode
  trailing?: React.ReactNode
  wrapperClassName?: string
}

/** Input with leading/trailing adornments (icons, units, buttons). */
export const InputGroup = forwardRef<HTMLInputElement, InputGroupProps>(function InputGroup(
  { leading, trailing, className, wrapperClassName, ...props },
  ref,
) {
  return (
    <div className={cn('relative flex items-center', wrapperClassName)}>
      {leading && (
        <span className="pointer-events-none absolute left-2.5 flex items-center text-fg-muted [&_svg]:size-4">{leading}</span>
      )}
      <Input ref={ref} className={cn(leading && 'pl-8', trailing && 'pr-9', className)} {...props} />
      {trailing && <span className="absolute right-1.5 flex items-center gap-1 text-fg-muted [&_svg]:size-4">{trailing}</span>}
    </div>
  )
})

/** Password field with a show/hide toggle. */
export const PasswordInput = forwardRef<HTMLInputElement, Omit<InputGroupProps, 'type' | 'trailing'>>(function PasswordInput(props, ref) {
  const [visible, setVisible] = useState(false)
  return (
    <InputGroup
      ref={ref}
      type={visible ? 'text' : 'password'}
      trailing={
        <button
          type="button"
          aria-label={visible ? 'Hide password' : 'Show password'}
          aria-pressed={visible}
          onClick={() => setVisible(v => !v)}
          className="flex size-6 cursor-pointer items-center justify-center rounded-control text-fg-muted transition-colors hover:bg-hover hover:text-fg [&_svg]:size-3.5"
        >
          {visible ? <EyeOff /> : <Eye />}
        </button>
      }
      {...props}
    />
  )
})

interface SearchInputProps extends Omit<InputProps, 'onChange' | 'value'> {
  value: string
  onChange: (value: string) => void
  /** Keyboard hint shown when empty, e.g. "⌘K" or "/". */
  shortcut?: string
  wrapperClassName?: string
}

export const SearchInput = forwardRef<HTMLInputElement, SearchInputProps>(function SearchInput(
  { value, onChange, shortcut, placeholder = 'Search…', wrapperClassName, ...props },
  ref,
) {
  return (
    <InputGroup
      ref={ref}
      type="search"
      value={value}
      placeholder={placeholder}
      onChange={e => onChange(e.target.value)}
      onKeyDown={e => { if (e.key === 'Escape' && value) { e.stopPropagation(); onChange('') } }}
      leading={<Search />}
      wrapperClassName={wrapperClassName}
      className="[&::-webkit-search-cancel-button]:appearance-none"
      trailing={
        value ? (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => onChange('')}
            className="flex size-6 cursor-pointer items-center justify-center rounded-control text-fg-muted transition-colors hover:bg-hover hover:text-fg [&_svg]:size-3.5"
          >
            <X />
          </button>
        ) : shortcut ? <Kbd className="mr-0.5">{shortcut}</Kbd> : undefined
      }
      {...props}
    />
  )
})
