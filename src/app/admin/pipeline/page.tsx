'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { fmtDate } from '@/lib/utils';

type Run = {
  id: string;
  status: 'running' | 'completed' | 'failed' | 'awaiting_review';
  triggeredAt: string;
  completedAt: string | null;
  sourceId: string;
  sourceName: string;
};

const statusBadge = (status: Run['status']) => {
  if (status === 'completed') return <Badge className="bg-green-600 text-white">Completed</Badge>;
  if (status === 'failed') return <Badge variant="destructive">Failed</Badge>;
  if (status === 'running')
    return <Badge className="bg-blue-500 text-white animate-pulse">Running</Badge>;
  return <Badge className="bg-yellow-500 text-white">Awaiting Review</Badge>;
};

export default function PipelineListPage() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch('/api/pipeline')
      .then((r) => r.json())
      .then((data: { runs: Run[] }) => {
        setRuns(data.runs);
        setLoaded(true);
      });
  }, []);

  if (!loaded) return <p className="text-sm text-muted-foreground">Loading…</p>;

  return (
    <div className="space-y-4 max-w-3xl">
      <h1 className="text-2xl font-semibold">Pipeline Runs</h1>
      {runs.length === 0 && <p className="text-sm text-muted-foreground">No pipeline runs yet.</p>}
      <div className="divide-y border rounded">
        {runs.map((run) => (
          <Link
            key={run.id}
            href={`/admin/pipeline/${run.id}`}
            className="flex items-center justify-between px-4 py-3 hover:bg-muted/50 transition-colors"
          >
            <div className="space-y-0.5 min-w-0">
              <p className="text-sm font-medium">{run.sourceName}</p>
              <p className="text-xs text-muted-foreground font-mono truncate">{run.id}</p>
              <p className="text-xs text-muted-foreground" suppressHydrationWarning>
                {fmtDate(run.triggeredAt)}
              </p>
            </div>
            <div className="shrink-0 ml-4">{statusBadge(run.status)}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
