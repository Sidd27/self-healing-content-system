'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

type TopicEntry = {
  topic: { id: string; name: string; description: string }
  source: { name: string; type: string }
}

export default function LearnerPage() {
  const [entries, setEntries] = useState<TopicEntry[]>([])

  useEffect(() => {
    fetch('/api/topics/all')
      .then(r => r.json())
      .then(setEntries)
  }, [])

  // Group by source name
  const grouped = entries.reduce<Record<string, TopicEntry[]>>((acc, entry) => {
    const key = entry.source.name
    if (!acc[key]) acc[key] = []
    acc[key].push(entry)
    return acc
  }, {})

  const sourceNames = Object.keys(grouped)

  return (
    <div className="space-y-6 max-w-3xl">
      <h1 className="text-2xl font-semibold">Browse Topics</h1>

      {sourceNames.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No topics yet. Add sources and topics in Admin.
        </p>
      )}

      {sourceNames.map(sourceName => (
        <section key={sourceName} className="space-y-2">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-medium">{sourceName}</h2>
            <Badge variant="secondary" className="text-xs">
              {grouped[sourceName][0].source.type}
            </Badge>
          </div>
          <div className="grid gap-2">
            {grouped[sourceName].map(({ topic }) => (
              <Link key={topic.id} href={`/learner/topics/${topic.id}`}>
                <Card className="hover:bg-accent/50 cursor-pointer transition-colors">
                  <CardContent className="py-3 px-4">
                    <p className="font-medium text-sm">{topic.name}</p>
                    {topic.description && (
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                        {topic.description}
                      </p>
                    )}
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
