import { useState } from 'react'
import { register } from '../../lib/api'
import { AvalokWordmark } from '../ui/AvalokLogo'
import Button from '../ui/Button'
import Input from '../ui/Input'
import Alert from '../ui/Alert'
import FormField from '../ui/FormField'

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
      <div className="min-h-screen flex items-center justify-center bg-premium">
        <div className="w-full max-w-sm px-4">
          <div className="flex justify-center mb-8">
            <AvalokWordmark height={28} />
          </div>
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6 text-center">
            <div className="w-12 h-12 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mx-auto mb-4">
              <span className="text-emerald-400 text-xl">&#10003;</span>
            </div>
            <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-2">Registration submitted</h2>
            <p className="text-sm text-[var(--text-secondary)] mb-5">
              Your account is pending admin approval. You'll be able to sign in once approved.
            </p>
            <Button variant="secondary" size="lg" onClick={onBack} className="w-full">
              Back to sign in
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-premium">
      <div className="w-full max-w-sm px-4">
        <div className="flex justify-center mb-8">
          <AvalokWordmark height={28} />
        </div>

        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6">
          <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-1">Create account</h2>
          <p className="text-sm text-[var(--text-secondary)] mb-5">Register for log dashboard access</p>

          {error && <Alert className="mb-4">{error}</Alert>}

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <FormField label="Username">
              <Input
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="Choose a username"
                autoFocus
                required
              />
            </FormField>
            <FormField label="Email" hint="optional">
              <Input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@company.com"
              />
            </FormField>
            <FormField label="Password">
              <Input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Min 8 characters"
                required
              />
            </FormField>
            <FormField label="Confirm password">
              <Input
                type="password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                placeholder="Repeat password"
                required
              />
            </FormField>
            <Button type="submit" size="lg" loading={loading} className="w-full mt-1">
              Register
            </Button>
          </form>
        </div>

        <p className="mt-4 text-center text-sm text-[var(--text-secondary)]">
          Already have an account?{' '}
          <Button variant="link" onClick={onBack}>Sign in</Button>
        </p>
      </div>
    </div>
  )
}
