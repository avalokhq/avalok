import { useState } from 'react'

type Layout = 'list' | 'grid'

export function useLayoutToggle(storageKey: string, defaultLayout: Layout = 'list') {
  const [layout, setLayout] = useState<Layout>(() =>
    (localStorage.getItem(storageKey) as Layout) || defaultLayout
  )

  function changeLayout(l: Layout) {
    setLayout(l)
    localStorage.setItem(storageKey, l)
  }

  return { layout, changeLayout } as const
}
