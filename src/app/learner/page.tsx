'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Globe, FileText } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

type TopicEntry = {
  topic: { id: string; name: string; description: string };
  source: { name: string; type: string };
};

export default function LearnerPage() {
  const [entries, setEntries] = useState<TopicEntry[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch('/api/topics/all')
      .then((r) => r.json())
      .then((data) => { setEntries(data); setLoaded(true); });
  }, []);

  const grouped = entries.reduce<Record<string, TopicEntry[]>>((acc, entry) => {
    const key = entry.source.name;
    if (!acc[key]) acc[key] = [];
    acc[key].push(entry);
    return acc;
  }, {});

  const sourceNames = Object.keys(grouped);

  if (!loaded) return <p className="text-sm text-muted-foreground">Loading…</p>;

  return (
    <div className="space-y-8 max-w-2xl">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Learn</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {entries.length} {entries.length === 1 ? 'topic' : 'topics'} available
        </p>
      </div>

      {sourceNames.length === 0 && (
        <div className="border rounded-lg px-4 py-10 text-center">
          <p className="text-sm text-muted-foreground">No topics yet.</p>
          <p className="text-xs text-muted-foreground mt-1">
            Add sources and topics in Admin, then run the pipeline.
          </p>
        </div>
      )}

      {sourceNames.map((sourceName) => {
        const items = grouped[sourceName];
        const sourceType = items[0].source.type;
        return (
          <section key={sourceName} className="space-y-2">
            <div className="flex items-center gap-2 mb-3">
              {sourceType === 'html' ? (
                <Globe className="h-3.5 w-3.5 text-muted-foreground" />
              ) : (
                <FileText className="h-3.5 w-3.5 text-muted-foreground" />
              )}
              <h2 className="text-sm font-medium text-muted-foreground">{sourceName}</h2>
              <Badge variant="secondary" className="text-xs font-mono">{sourceType}</Badge>
            </div>
            <div className="divide-y border rounded-lg overflow-hidden">
              {items.map(({ topic }) => (
                <Link
                  key={topic.id}
                  href={`/learner/topics/${topic.id}`}
                  className="flex items-center gap-3 px-4 py-3.5 hover:bg-muted/40 transition-colors group"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium group-hover:text-primary transition-colors">
                      {topic.name}
                    </p>
                    {topic.description && (
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                        {topic.description}
                      </p>
                    )}
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-primary group-hover:translate-x-0.5 transition-all shrink-0" />
                </Link>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
