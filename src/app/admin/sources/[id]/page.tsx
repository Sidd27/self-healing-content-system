'use client'
import { useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { Upload, FileText, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { fmtDate } from '@/lib/utils'

type Topic = { id: string; name: string; description: string }
type Run = { id: string; status: 'running' | 'completed' | 'failed' | 'awaiting_review'; triggeredAt: string }
type Version = { id: string; contentHash: string; createdAt: string }
type SourceDetail = {
  id: string; name: string; type: 'url' | 'pdf' | 'md'
  url: string | null; createdAt: string
  topics: Topic[]; runs: Run[]; versions: Version[]
}

function statusVariant(s: Run['status']): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (s === 'completed') return 'default'
  if (s === 'failed') return 'destructive'
  return 'secondary'
}

function fmtSize(bytes: number) {
  return bytes < 1024 * 1024
    ? `${Math.round(bytes / 1024)} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function SourceDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [source, setSource] = useState<SourceDetail | null>(null)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetch(`/api/sources/${id}`)
      .then((r) => r.json())
      .then(setSource)
      .catch(console.error)
  }, [id])

  function handleFileChange(file: File | null) {
    if (!file || !source) return
    const ext = file.name.split('.').pop()?.toLowerCase()
    const valid = source.type === 'pdf' ? ext === 'pdf' : ['md', 'markdown', 'txt'].includes(ext ?? '')
    if (!valid) { setError(`Expected a .${source.type} file.`); return }
    setError(null)
    setSelectedFile(file)
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    handleFileChange(e.dataTransfer.files[0] ?? null)
  }

  async function triggerPipeline() {
    if (!source) return
    setError(null)

    if (source.type === 'pdf' || source.type === 'md') {
      if (!selectedFile) { setError('Select a file before running.'); return }
      setRunning(true)
      const fd = new FormData()
      fd.append('file', selectedFile)
      const res = await fetch(`/api/sources/${id}/pipeline`, { method: 'POST', body: fd })
      setRunning(false)
      if (!res.ok) { setError(((await res.json()) as { error?: string }).error ?? 'Pipeline trigger failed.'); return }
      const { runId } = (await res.json()) as { runId: string }
      router.push(`/admin/pipeline/${runId}`)
    } else {
      setRunning(true)
      const res = await fetch(`/api/sources/${id}/pipeline`, { method: 'POST' })
      setRunning(false)
      if (!res.ok) { setError(((await res.json()) as { error?: string }).error ?? 'Pipeline trigger failed.'); return }
      const { runId } = (await res.json()) as { runId: string }
      router.push(`/admin/pipeline/${runId}`)
    }
  }

  if (!source) return <p className="text-muted-foreground text-sm">Loading...</p>

  const needsFile = source.type === 'pdf' || source.type === 'md'
  const accept = source.type === 'pdf' ? '.pdf' : '.md,.markdown,.txt'

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">{source.name}</h1>
          <div className="flex items-center gap-2">
            <Badge variant="outline">{source.type.toUpperCase()}</Badge>
            {source.url && (
              <span className="text-xs text-muted-foreground truncate max-w-sm">{source.url}</span>
            )}
          </div>
        </div>
        <Button
          onClick={triggerPipeline}
          disabled={running || (needsFile && !selectedFile)}
        >
          {running ? 'Triggering…' : 'Run Pipeline'}
        </Button>
      </div>

      {/* File upload — PDF / MD sources only */}
      {needsFile && (
        <div className="space-y-2">
          <input
            ref={fileRef}
            type="file"
            accept={accept}
            className="hidden"
            onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)}
          />

          {selectedFile ? (
            <div className="flex items-center gap-3 rounded-lg border bg-muted/40 px-4 py-3">
              <FileText className="size-4 shrink-0 text-muted-foreground" />
              <span className="flex-1 truncate text-sm font-medium">{selectedFile.name}</span>
              <span className="shrink-0 text-xs text-muted-foreground">{fmtSize(selectedFile.size)}</span>
              <button
                onClick={() => { setSelectedFile(null); if (fileRef.current) fileRef.current.value = '' }}
                className="rounded p-0.5 text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Remove file"
              >
                <X className="size-4" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
              className={[
                'w-full rounded-lg border-2 border-dashed px-6 py-10 text-center transition-colors',
                dragOver
                  ? 'border-foreground/40 bg-muted/60'
                  : 'border-muted-foreground/25 hover:border-muted-foreground/50 hover:bg-muted/30',
              ].join(' ')}
            >
              <Upload className="mx-auto mb-3 size-5 text-muted-foreground" />
              <p className="text-sm font-medium">Drop your file here, or click to browse</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {source.type === 'pdf' ? 'PDF files only' : 'Markdown or text files (.md, .txt)'}
              </p>
            </button>
          )}

          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
      )}

      {/* Topics */}
      <Card>
        <CardHeader className="flex-row items-center justify-between pb-2">
          <CardTitle className="text-base">Topics</CardTitle>
          <Link href={`/admin/sources/${id}/topics/new`}>
            <Button variant="outline" size="sm">Add Topic</Button>
          </Link>
        </CardHeader>
        <CardContent className="space-y-2">
          {source.topics.map((t) => (
            <div key={t.id} className="flex flex-col border rounded p-3 gap-0.5">
              <span className="font-medium text-sm">{t.name}</span>
              <span className="text-xs text-muted-foreground">{t.description}</span>
            </div>
          ))}
          {source.topics.length === 0 && (
            <p className="text-sm text-muted-foreground">No topics yet.</p>
          )}
        </CardContent>
      </Card>

      {/* Pipeline Runs */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Pipeline Runs</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {source.runs.map((r) => (
            <Link key={r.id} href={`/admin/pipeline/${r.id}`}>
              <div className="flex items-center justify-between border rounded p-3 hover:bg-accent/50 transition-colors cursor-pointer">
                <span className="text-xs text-muted-foreground font-mono">{r.id.slice(0, 8)}</span>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground" suppressHydrationWarning>{fmtDate(r.triggeredAt)}</span>
                  <Badge variant={statusVariant(r.status)}>{r.status}</Badge>
                </div>
              </div>
            </Link>
          ))}
          {source.runs.length === 0 && (
            <p className="text-sm text-muted-foreground">No pipeline runs yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
