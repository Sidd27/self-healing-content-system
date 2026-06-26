'use client'
import { useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

type Topic = {
  id: string
  name: string
  description: string
}

type Run = {
  id: string
  status: 'running' | 'completed' | 'failed' | 'awaiting_review'
  triggeredAt: string
}

type Version = {
  id: string
  contentHash: string
  createdAt: string
}

type SourceDetail = {
  id: string
  name: string
  type: 'url' | 'pdf' | 'md'
  url: string | null
  createdAt: string
  topics: Topic[]
  runs: Run[]
  versions: Version[]
}

function statusVariant(
  status: Run['status']
): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (status === 'completed') return 'default'
  if (status === 'failed') return 'destructive'
  return 'secondary'
}

export default function SourceDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [source, setSource] = useState<SourceDetail | null>(null)
  const [running, setRunning] = useState(false)
  const [fileError, setFileError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetch(`/api/sources/${id}`)
      .then((r) => r.json())
      .then(setSource)
      .catch(console.error)
  }, [id])

  async function triggerPipeline() {
    if (!source) return
    setFileError(null)

    if (source.type === 'pdf' || source.type === 'md') {
      const file = fileRef.current?.files?.[0]
      if (!file) {
        setFileError('Please select a file before running the pipeline.')
        return
      }
      setRunning(true)
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch(`/api/sources/${id}/pipeline`, {
        method: 'POST',
        body: formData,
      })
      setRunning(false)
      if (!res.ok) {
        const json = (await res.json()) as { error?: string }
        setFileError(json.error ?? 'Pipeline trigger failed.')
        return
      }
      const { runId } = (await res.json()) as { runId: string }
      router.push(`/admin/runs/${runId}`)
    } else {
      setRunning(true)
      const res = await fetch(`/api/sources/${id}/pipeline`, { method: 'POST' })
      setRunning(false)
      const { runId } = (await res.json()) as { runId: string }
      router.push(`/admin/runs/${runId}`)
    }
  }

  if (!source) {
    return <p className="text-muted-foreground text-sm">Loading...</p>
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">{source.name}</h1>
          <div className="flex items-center gap-2">
            <Badge variant="outline">{source.type.toUpperCase()}</Badge>
            {source.url && (
              <span className="text-xs text-muted-foreground truncate max-w-sm">
                {source.url}
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          {(source.type === 'pdf' || source.type === 'md') && (
            <div className="flex flex-col items-end gap-1">
              <input
                ref={fileRef}
                type="file"
                accept={source.type === 'pdf' ? '.pdf' : '.md,.markdown,.txt'}
                className="text-sm text-muted-foreground"
              />
              {fileError && (
                <p className="text-xs text-destructive">{fileError}</p>
              )}
            </div>
          )}
          <Button onClick={triggerPipeline} disabled={running}>
            {running ? 'Triggering...' : 'Run Pipeline'}
          </Button>
        </div>
      </div>

      {/* Topics */}
      <Card>
        <CardHeader className="flex-row items-center justify-between pb-2">
          <CardTitle className="text-base">Topics</CardTitle>
          <Link href={`/admin/sources/${id}/topics/new`}>
            <Button variant="outline" size="sm">
              Add Topic
            </Button>
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
            <Link key={r.id} href={`/admin/runs/${r.id}`}>
              <div className="flex items-center justify-between border rounded p-3 hover:bg-accent/50 transition-colors cursor-pointer">
                <span className="text-xs text-muted-foreground font-mono">
                  {r.id.slice(0, 8)}
                </span>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground">
                    {new Date(r.triggeredAt).toLocaleString()}
                  </span>
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
