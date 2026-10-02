import { useState } from 'react'
import { useConfirm, useToast } from '../components/ui/Feedback'

interface Options {
  /** Lower-case noun for messages, e.g. "workspace". */
  noun: string
  remove: (name: string) => Promise<unknown>
  /** Extra sentence in the confirm dialog. */
  detail?: string
  onDeleted?: () => void
}

/** Confirm → delete → toast, tracking which item is mid-delete so its card/row can dim. */
export function useDeleteEntity({ noun, remove, detail, onDeleted }: Options) {
  const confirm = useConfirm()
  const toast = useToast()
  const [busyName, setBusyName] = useState<string | null>(null)

  async function run(name: string) {
    const ok = await confirm({
      title: `Delete ${noun} "${name}"?`,
      description: detail ?? 'Its configuration will be removed from Avalok. This cannot be undone.',
      confirmLabel: `Delete ${noun}`,
      danger: true,
    })
    if (!ok) return
    setBusyName(name)
    try {
      await remove(name)
      toast.success(`Deleted ${name}`)
      onDeleted?.()
    } catch (err) {
      toast.error(`Couldn't delete ${name}`, err instanceof Error ? err.message : undefined)
    } finally {
      setBusyName(null)
    }
  }

  return { busyName, deleteEntity: run }
}
