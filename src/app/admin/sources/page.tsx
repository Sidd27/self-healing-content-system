'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'

type Source = {
  id: string
  name: string
  type: 'url' | 'pdf' | 'md'
  url: string | null
  createdAt: string
}

export default function SourcesPage() {
  const [sources, setSources] = useState<Source[]>([])
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ name: '', type: 'url', url: '' })
  const [submitting, setSubmitting] = useState(false)

  function loadSources() {
    fetch('/api/sources')
      .then((r) => r.json())
      .then(setSources)
      .catch(console.error)
  }

  useEffect(() => {
    loadSources()
  }, [])

  async function addSource(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    try {
      await fetch('/api/sources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          type: form.type,
          url: form.type === 'url' ? form.url : undefined,
        }),
      })
      setOpen(false)
      setForm({ name: '', type: 'url', url: '' })
      loadSources()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Sources</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger render={<Button />}>Add Source</DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Source</DialogTitle>
            </DialogHeader>
            <form onSubmit={addSource} className="space-y-3">
              <input
                className="w-full border rounded px-3 py-2 text-sm"
                placeholder="Name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                required
              />
              <select
                className="w-full border rounded px-3 py-2 text-sm bg-background"
                value={form.type}
                onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
              >
                <option value="url">URL</option>
                <option value="pdf">PDF</option>
                <option value="md">Markdown</option>
              </select>
              {form.type === 'url' && (
                <input
                  className="w-full border rounded px-3 py-2 text-sm"
                  placeholder="https://..."
                  type="url"
                  value={form.url}
                  onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
                />
              )}
              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? 'Creating...' : 'Create'}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-3">
        {sources.map((s) => (
          <Link key={s.id} href={`/admin/sources/${s.id}`}>
            <Card className="hover:bg-accent/50 cursor-pointer transition-colors">
              <CardContent className="flex items-center justify-between py-4">
                <div className="flex flex-col gap-0.5">
                  <span className="font-medium">{s.name}</span>
                  {s.url && (
                    <span className="text-xs text-muted-foreground truncate max-w-xs">
                      {s.url}
                    </span>
                  )}
                </div>
                <Badge variant="outline">{s.type.toUpperCase()}</Badge>
              </CardContent>
            </Card>
          </Link>
        ))}
        {sources.length === 0 && (
          <p className="text-muted-foreground text-sm">No sources yet. Add one above.</p>
        )}
      </div>
    </div>
  )
}
