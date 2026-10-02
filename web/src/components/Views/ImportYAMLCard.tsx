import { useState } from 'react'
import { Upload } from 'lucide-react'
import { adminImportWorkspace } from '../../lib/api'
import { entityLabel, entityStyle } from '../ui/EntityIcon'
import Alert from '../ui/Alert'
import Badge from '../ui/Badge'
import Button from '../ui/Button'
import Card from '../ui/Card'
import { Textarea } from '../ui/Input'

/** Paste/upload YAML for a workspace, standalone environment or service; detects which it is. */
export default function ImportYAMLCard({ onDone }: { onDone: () => void }) {
  const [yaml, setYaml] = useState('')
  const [error, setError] = useState('')
  const [importing, setImporting] = useState(false)
  const [detectedType, setDetectedType] = useState<'workspace' | 'environment' | 'service' | null>(null)
  const [confirmType, setConfirmType] = useState(false)

  function detectType(content: string): 'workspace' | 'environment' | 'service' {
    const hasEnvironments = /^environments:/m.test(content)
    const hasServices = /^services:/m.test(content)
    const hasProvider = /^provider:/m.test(content)
    if (hasEnvironments) return 'workspace'
    if (hasServices) return 'environment'
    if (hasProvider) return 'service'
    return 'workspace'
  }

  function handleYamlChange(content: string) {
    setYaml(content)
    if (content.trim()) {
      const type = detectType(content)
      setDetectedType(type)
      setConfirmType(type !== 'workspace')
    } else {
      setDetectedType(null)
      setConfirmType(false)
    }
  }

  async function runImport() {
    setImporting(true)
    setError('')
    try {
      await adminImportWorkspace(yaml)
      onDone()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to import')
    } finally { setImporting(false) }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!detectedType || confirmType) return
    await runImport()
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => handleYamlChange(reader.result as string)
    reader.readAsText(file)
  }

  const typeLabel = detectedType ? entityLabel(detectedType) : ''

  return (
    <Card padding="lg" className="mb-6 animate-fade-up">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-semibold text-fg">Import YAML</h3>
          {detectedType && yaml.trim() && (
            <Badge tone={entityStyle(detectedType).tone}>Detected: {typeLabel}</Badge>
          )}
        </div>
        <label className="flex cursor-pointer items-center gap-1.5 text-xs font-medium text-accent hover:underline">
          <Upload className="size-3.5" />
          Upload file
          <input type="file" accept=".yaml,.yml" onChange={handleFile} className="hidden" />
        </label>
      </div>

      {error && <Alert tone="danger" className="mb-3">{error}</Alert>}

      {confirmType && detectedType && detectedType !== 'workspace' && (
        <Alert
          tone="warning"
          className="mb-3"
          action={
            <div className="flex items-center gap-2">
              <Button size="sm" variant="secondary" loading={importing} onClick={() => { setConfirmType(false); runImport() }}>
                Import as {typeLabel}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => { setConfirmType(false); setDetectedType('workspace') }}>
                Import as workspace instead
              </Button>
            </div>
          }
        >
          This looks like a standalone <strong>{typeLabel.toLowerCase()}</strong> (no {detectedType === 'environment' ? 'environments' : 'services/provider'} block found).
        </Alert>
      )}

      <form onSubmit={handleSubmit}>
        <Textarea
          value={yaml}
          onChange={e => handleYamlChange(e.target.value)}
          className="h-48 font-mono text-xs"
          placeholder="Paste YAML here or upload a file…"
          required
        />
        <div className="mt-3 flex justify-end">
          {(!confirmType || detectedType === 'workspace') && (
            <Button type="submit" loading={importing} disabled={!yaml.trim()}>
              Import {typeLabel}
            </Button>
          )}
        </div>
      </form>
    </Card>
  )
}
