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

function StatusDot({ status }: { status: Run['status'] }) {
  if (status === 'completed') return <span className="h-2 w-2 rounded-full bg-emerald-500 shrink-0" />;
  if (status === 'failed') return <span className="h-2 w-2 rounded-full bg-destructive shrink-0" />;
  if (status === 'running') return <span className="h-2 w-2 rounded-full bg-blue-500 animate-pulse shrink-0" />;
  return <span className="h-2 w-2 rounded-full bg-amber-400 shrink-0" />;
}

function StatusBadge({ status }: { status: Run['status'] }) {
  if (status === 'completed') return <Badge className="bg-emerald-500/10 text-emerald-700 border-emerald-200 hover:bg-emerald-500/10">Completed</Badge>;
  if (status === 'failed') return <Badge variant="destructive">Failed</Badge>;
  if (status === 'running') return <Badge className="bg-blue-500/10 text-blue-700 border-blue-200 animate-pulse hover:bg-blue-500/10">Running</Badge>;
  return <Badge className="bg-amber-500/10 text-amber-700 border-amber-200 hover:bg-amber-500/10">Awaiting review</Badge>;
}

export default function PipelineListPage() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch('/api/pipeline')
      .then((r) => r.json())
      .then((data: { runs: Run[] }) => { setRuns(data.runs); setLoaded(true); });
  }, []);

  if (!loaded) return <p className="text-sm text-muted-foreground">Loading…</p>;

  return (
    <div className="space-y-5 max-w-2xl">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Pipeline Runs</h1>
        <p className="text-sm text-muted-foreground mt-0.5">{runs.length} total runs</p>
      </div>

      {runs.length === 0 ? (
        <div className="border rounded-lg px-4 py-10 text-center">
          <p className="text-sm text-muted-foreground">No pipeline runs yet.</p>
          <p className="text-xs text-muted-foreground mt-1">Trigger a run from a source page.</p>
        </div>
      ) : (
        <div className="divide-y border rounded-lg overflow-hidden">
          {runs.map((run) => (
            <Link
              key={run.id}
              href={`/admin/pipeline/${run.id}?from=pipeline`}
              className="flex items-center gap-4 px-4 py-3.5 hover:bg-muted/40 transition-colors"
            >
              <StatusDot status={run.status} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{run.sourceName}</p>
                <p className="text-xs text-muted-foreground font-mono mt-0.5">{run.id.slice(0, 8)}</p>
              </div>
              <div className="text-right shrink-0 space-y-1">
                <StatusBadge status={run.status} />
                <p className="text-xs text-muted-foreground" suppressHydrationWarning>
                  {fmtDate(run.triggeredAt)}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
