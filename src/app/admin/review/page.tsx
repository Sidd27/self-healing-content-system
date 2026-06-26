'use client'
import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

type DriftItem = {
  id: string
  driftScore: number
  reason: string
  changeType: string
  driftLevel: 'low' | 'med' | 'high'
}

type Topic = {
  id: string
  name: string
}

type Run = {
  id: string
}

type DriftEntry = {
  item: DriftItem
  topic: Topic
  run: Run
}

type ProposedTopic = {
  id: string
  name: string
  description: string
  extractedContent: string
  sourceVersionId: string
  pipelineRunId: string
}

type Queue = {
  pendingDrift: DriftEntry[]
  pendingTopics: ProposedTopic[]
}

const driftLevelVariant: Record<string, 'destructive' | 'secondary' | 'outline'> = {
  high: 'destructive',
  med: 'secondary',
  low: 'outline',
}

export default function ReviewQueuePage() {
  const [queue, setQueue] = useState<Queue>({ pendingDrift: [], pendingTopics: [] })
  const [loading, setLoading] = useState(true)

  function load() {
    fetch('/api/review/queue')
      .then((r) => r.json())
      .then((data: Queue) => {
        setQueue(data)
        setLoading(false)
      })
      .catch(console.error)
  }

  useEffect(() => {
    load()
  }, [])

  async function reviewDrift(id: string, action: 'approve' | 'reject') {
    // Optimistic: remove from list immediately
    setQueue((q) => ({ ...q, pendingDrift: q.pendingDrift.filter((e) => e.item.id !== id) }))
    await fetch(`/api/review/drift/${id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    })
  }

  async function reviewTopic(id: string, action: 'approve' | 'reject') {
    // Optimistic: remove from list immediately
    setQueue((q) => ({ ...q, pendingTopics: q.pendingTopics.filter((t) => t.id !== id) }))
    await fetch(`/api/review/topics/${id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    })
  }

  const total = queue.pendingDrift.length + queue.pendingTopics.length

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold">Review Queue</h1>
        <p className="text-muted-foreground text-sm">Loading…</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-semibold">Review Queue</h1>
        {total > 0 && <Badge variant="destructive">{total}</Badge>}
      </div>

      {queue.pendingDrift.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Pending Drift Reviews</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {queue.pendingDrift.map((entry) => (
              <div key={entry.item.id} className="border rounded p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{entry.topic.name}</span>
                  <div className="flex items-center gap-2">
                    <Badge variant={driftLevelVariant[entry.item.driftLevel] ?? 'outline'}>
                      {entry.item.driftLevel.toUpperCase()}
                    </Badge>
                    <Badge variant="outline">{entry.item.changeType}</Badge>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">{entry.item.reason}</p>
                <p className="text-xs text-muted-foreground">
                  Drift score: {(entry.item.driftScore * 100).toFixed(0)}%
                </p>
                <div className="flex gap-2 pt-1">
                  <Button size="sm" onClick={() => reviewDrift(entry.item.id, 'approve')}>
                    Approve &amp; Repair
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => reviewDrift(entry.item.id, 'reject')}
                  >
                    Reject
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {queue.pendingTopics.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Proposed New Topics</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {queue.pendingTopics.map((t) => (
              <div key={t.id} className="border rounded p-4 space-y-2">
                <span className="font-medium">{t.name}</span>
                <p className="text-sm text-muted-foreground">{t.description}</p>
                {t.extractedContent && (
                  <p className="text-xs text-muted-foreground line-clamp-3 border-l-2 pl-2">
                    {t.extractedContent}
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  Source version: <span className="font-mono">{t.sourceVersionId}</span>
                </p>
                <div className="flex gap-2 pt-1">
                  <Button size="sm" onClick={() => reviewTopic(t.id, 'approve')}>
                    Approve &amp; Generate
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => reviewTopic(t.id, 'reject')}
                  >
                    Reject
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {total === 0 && (
        <p className="text-muted-foreground text-sm">Nothing pending — all caught up.</p>
      )}
    </div>
  )
}
