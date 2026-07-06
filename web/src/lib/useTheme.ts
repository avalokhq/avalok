import { useState, useEffect, useCallback } from 'react'

export type Theme = 'dark' | 'light' | 'auto'
type ResolvedTheme = 'dark' | 'light'

function getSystemTheme(): ResolvedTheme {
  if (typeof window === 'undefined') return 'dark'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function resolveTheme(theme: Theme): ResolvedTheme {
  return theme === 'auto' ? getSystemTheme() : theme
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(() => {
    const stored = localStorage.getItem('avalok-theme') as Theme | null
    return stored || 'dark'
  })
  const [resolved, setResolved] = useState<ResolvedTheme>(() => resolveTheme(theme))

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t)
    localStorage.setItem('avalok-theme', t)
  }, [])

  useEffect(() => {
    setResolved(resolveTheme(theme))

    if (theme !== 'auto') return

    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = () => setResolved(getSystemTheme())
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [theme])

  useEffect(() => {
    document.documentElement.classList.toggle('dark', resolved === 'dark')
    document.documentElement.classList.toggle('light', resolved === 'light')
  }, [resolved])

  return { theme, resolved, setTheme }
}
