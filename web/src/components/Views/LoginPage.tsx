import { useState } from 'react'
import { Lock, User } from 'lucide-react'
import { login, setToken } from '../../lib/api'
import type { AuthUser } from '../../lib/api'
import AuthLayout from '../Layout/AuthLayout'
import Button from '../ui/Button'
import { InputGroup, PasswordInput } from '../ui/Input'
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
    <AuthLayout
      title="Welcome back"
      description="Sign in to your log dashboard"
      footer={<>Don't have an account? <Button variant="link" onClick={onRegister}>Create one</Button></>}
    >
      {error && <Alert tone="danger" className="mb-5">{error}</Alert>}

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <FormField label="Username" htmlFor="login-username">
          <InputGroup
            id="login-username"
            leading={<User />}
            value={username}
            onChange={e => setUsername(e.target.value)}
            placeholder="Your username"
            autoComplete="username"
            autoFocus
            required
            size="lg"
          />
        </FormField>
        <FormField label="Password" htmlFor="login-password">
          <PasswordInput
            id="login-password"
            leading={<Lock />}
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="Your password"
            autoComplete="current-password"
            required
            size="lg"
          />
        </FormField>
        <Button type="submit" size="lg" loading={loading} className="mt-2 w-full">
          Sign in
        </Button>
      </form>
    </AuthLayout>
  )
}
