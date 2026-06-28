'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ChevronRight, Paperclip } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { fmtDate } from '@/lib/utils';

type Topic = { id: string; name: string; description: string };
type Run = {
  id: string;
  status: 'running' | 'completed' | 'failed' | 'awaiting_review';
  triggeredAt: string;
  sourceVersionId: string | null;
};
type Version = { id: string; contentHash: string; createdAt: string };
type SourceDetail = {
  id: string;
  name: string;
  type: 'html' | 'pdf';
  url: string | null;
  createdAt: string;
  topics: Topic[];
  runs: Run[];
  versions: Version[];
};

function RunStatusBadge({ status }: { status: Run['status'] }) {
  if (status === 'completed')
    return (
      <Badge className="bg-emerald-500/10 text-emerald-700 border-emerald-200 text-xs">
        Completed
      </Badge>
    );
  if (status === 'failed')
    return (
      <Badge variant="destructive" className="text-xs">
        Failed
      </Badge>
    );
  if (status === 'running')
    return (
      <Badge className="bg-blue-500/10 text-blue-700 border-blue-200 animate-pulse text-xs">
        Running
      </Badge>
    );
  return (
    <Badge className="bg-amber-500/10 text-amber-700 border-amber-200 text-xs">
      Awaiting review
    </Badge>
  );
}

export default function SourceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [source, setSource] = useState<SourceDetail | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pdfFile, setPdfFile] = useState<File | null>(null);

  useEffect(() => {
    fetch(`/api/sources/${id}`)
      .then((r) => r.json())
      .then(setSource)
      .catch(console.error);
  }, [id]);

  async function triggerPipeline() {
    if (!source) return;
    setError(null);
    setRunning(true);
    const body = pdfFile
      ? (() => {
          const fd = new FormData();
          fd.append('file', pdfFile);
          return fd;
        })()
      : undefined;
    const res = await fetch(`/api/sources/${id}/pipeline`, { method: 'POST', body });
    setRunning(false);
    if (!res.ok) {
      setError(((await res.json()) as { error?: string }).error ?? 'Pipeline trigger failed.');
      return;
    }
    const { runId } = (await res.json()) as { runId: string };
    router.push(`/admin/pipeline/${runId}`);
  }

  if (!source) return <p className="text-muted-foreground text-sm">Loading…</p>;

  const isPdf = source.type === 'pdf';
  const mustAttach = isPdf && !source.url; // no stored URL at all — file is required

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1 text-sm text-muted-foreground">
        <Link href="/admin/sources" className="hover:text-foreground transition-colors">Sources</Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="text-foreground font-medium truncate">{source.name}</span>
      </nav>

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1.5">
          <h1 className="text-xl font-semibold tracking-tight">{source.name}</h1>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="font-mono text-xs">
              {source.type}
            </Badge>
            {source.url && (
              <span className="text-xs text-muted-foreground truncate max-w-xs">{source.url}</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {isPdf && (
            <label className="inline-flex items-center gap-1.5 h-7 cursor-pointer rounded-md border border-input bg-background px-2.5 text-xs font-medium shadow-sm hover:bg-muted/60 transition-colors">
              <Paperclip className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate max-w-30">
                {pdfFile?.name ?? (mustAttach ? 'Attach PDF' : 'Upload new PDF')}
              </span>
              <input
                type="file"
                accept=".pdf"
                className="hidden"
                onChange={(e) => setPdfFile(e.target.files?.[0] ?? null)}
              />
            </label>
          )}
          <Button
            onClick={triggerPipeline}
            disabled={running || (mustAttach && !pdfFile)}
            size="sm"
          >
            {running ? 'Triggering…' : 'Run pipeline'}
          </Button>
        </div>
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}

      {/* Topics */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
            Topics
          </CardTitle>
        </CardHeader>
        <CardContent>
          {source.topics.length > 0 ? (
            <div className="divide-y">
              {source.topics.map((t) => (
                <div key={t.id} className="py-3 first:pt-0 last:pb-0">
                  <p className="text-sm font-medium">{t.name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{t.description}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground py-2">No topics yet.</p>
          )}
        </CardContent>
      </Card>

      {/* Version History */}
      {source.versions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
              Version History
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="divide-y">
              {source.versions.map((v, i) => {
                const run = source.runs.find((r) => r.sourceVersionId === v.id);
                return (
                  <div
                    key={v.id}
                    className="flex items-center justify-between py-2.5 first:pt-0 last:pb-0 gap-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="text-xs text-muted-foreground shrink-0 w-12">
                        {i === 0 ? 'Latest' : `v${source.versions.length - i}`}
                      </span>
                      <span className="text-xs font-mono text-muted-foreground">
                        {v.contentHash.slice(0, 12)}
                      </span>
                      <span className="text-xs text-muted-foreground" suppressHydrationWarning>
                        {fmtDate(v.createdAt)}
                      </span>
                    </div>
                    {run && (
                      <Link
                        href={`/admin/pipeline/${run.id}`}
                        className="text-xs text-primary hover:underline shrink-0"
                      >
                        View run →
                      </Link>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Pipeline Runs */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
            Pipeline Runs
          </CardTitle>
        </CardHeader>
        <CardContent>
          {source.runs.length > 0 ? (
            <div className="divide-y">
              {source.runs.map((r) => (
                <div
                  key={r.id}
                  className="flex items-center justify-between py-2.5 first:pt-0 last:pb-0 hover:opacity-80 transition-opacity cursor-pointer"
                >
                  <Link href={`/admin/pipeline/${r.id}`}>
                    <span className="text-xs text-muted-foreground font-mono">
                      {r.id.slice(0, 8)}
                    </span>
                  </Link>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground" suppressHydrationWarning>
                      {fmtDate(r.triggeredAt)}
                    </span>
                    <RunStatusBadge status={r.status} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground py-2">No pipeline runs yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
