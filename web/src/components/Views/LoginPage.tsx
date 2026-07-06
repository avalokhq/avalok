import { useState } from 'react'
import { login, setToken } from '../../lib/api'
import type { AuthUser } from '../../lib/api'
import { AvalokWordmark } from '../ui/AvalokLogo'
import Button from '../ui/Button'
import Input from '../ui/Input'
import Alert from '../ui/Alert'
import FormField from '../ui/FormField'

interface Props {
  onLogin: (user: AuthUser) => void
  onRegister: () => void
}

export default function LoginPage({ onLogin, onRegister }: Props) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await login(username, password)
      setToken(res.token)
      onLogin(res.user)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-premium">
      <div className="w-full max-w-sm px-4">
        <div className="flex justify-center mb-8">
          <AvalokWordmark height={28} />
        </div>

        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6">
          <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-1">Sign in</h2>
          <p className="text-sm text-[var(--text-secondary)] mb-5">Access your log dashboard</p>

          {error && <Alert className="mb-4">{error}</Alert>}

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <FormField label="Username">
              <Input
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="Enter username"
                autoFocus
                required
              />
            </FormField>
            <FormField label="Password">
              <Input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Enter password"
                required
              />
            </FormField>
            <Button type="submit" size="lg" loading={loading} className="w-full mt-1">
              Sign in
            </Button>
          </form>
        </div>

        <p className="mt-4 text-center text-sm text-[var(--text-secondary)]">
          Don't have an account?{' '}
          <Button variant="link" onClick={onRegister}>Register</Button>
        </p>
      </div>
    </div>
  )
}
