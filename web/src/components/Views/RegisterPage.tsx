import { useState } from 'react'
import { CheckCircle2, Lock, Mail, User } from 'lucide-react'
import { register } from '../../lib/api'
import AuthLayout from '../Layout/AuthLayout'
import Button from '../ui/Button'
import { InputGroup, PasswordInput } from '../ui/Input'
import Alert from '../ui/Alert'
import FormField from '../ui/FormField'
import EmptyState from '../ui/EmptyState'

interface Props {
  onBack: () => void
}

export default function RegisterPage({ onBack }: Props) {
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)

  const mismatch = confirmPassword.length > 0 && password !== confirmPassword
  const tooShort = password.length > 0 && password.length < 8

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }

    setLoading(true)
    try {
      await register(username, email, password)
      setSuccess(true)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Registration failed')
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <AuthLayout>
        <EmptyState
          compact
          tone="success"
          icon={<CheckCircle2 />}
          title="Registration submitted"
          description="Your account is pending admin approval. You'll be able to sign in once it's approved."
          action={<Button variant="secondary" size="lg" onClick={onBack}>Back to sign in</Button>}
          className="py-2"
        />
      </AuthLayout>
    )
  }

  return (
    <AuthLayout
      title="Create your account"
      description="An admin will approve access to the log dashboard"
      footer={<>Already have an account? <Button variant="link" onClick={onBack}>Sign in</Button></>}
    >
      {error && <Alert tone="danger" className="mb-5">{error}</Alert>}

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <FormField label="Username" htmlFor="reg-username">
          <InputGroup
            id="reg-username"
            leading={<User />}
            value={username}
            onChange={e => setUsername(e.target.value)}
            placeholder="Choose a username"
            autoComplete="username"
            autoFocus
            required
            size="lg"
          />
        </FormField>
        <FormField label="Email" hint="optional" htmlFor="reg-email">
          <InputGroup
            id="reg-email"
            leading={<Mail />}
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="you@company.com"
            autoComplete="email"
            size="lg"
          />
        </FormField>
        <FormField label="Password" htmlFor="reg-password" help="At least 8 characters" error={tooShort ? 'At least 8 characters' : null}>
          <PasswordInput
            id="reg-password"
            leading={<Lock />}
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="Create a password"
            autoComplete="new-password"
            invalid={tooShort}
            required
            size="lg"
          />
        </FormField>
        <FormField label="Confirm password" htmlFor="reg-confirm" error={mismatch ? 'Passwords do not match' : null}>
          <PasswordInput
            id="reg-confirm"
            leading={<Lock />}
            value={confirmPassword}
            onChange={e => setConfirmPassword(e.target.value)}
            placeholder="Repeat password"
            autoComplete="new-password"
            invalid={mismatch}
            required
            size="lg"
          />
        </FormField>
        <Button type="submit" size="lg" loading={loading} className="mt-2 w-full">
          Create account
        </Button>
      </form>
    </AuthLayout>
  )
}
