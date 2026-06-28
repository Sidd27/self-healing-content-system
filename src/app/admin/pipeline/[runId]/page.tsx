'use client';
import { useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { fmtDate } from '@/lib/utils';
import { cn } from '@/lib/utils';

type StageStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
type RunStatus = 'running' | 'completed' | 'failed' | 'awaiting_review';

type Stage = {
  id: string;
  stage: string;
  status: StageStatus;
  startedAt: string | null;
  completedAt: string | null;
  outputSummary: string | null;
  error: string | null;
};

type DriftEntry = {
  item: {
    id: string;
    topicId: string;
    changeType: string;
    driftScore: number;
    driftLevel: 'low' | 'med' | 'high';
    reason: string;
    status: string;
    generationStatus: string | null;
  };
  topic: { id: string; name: string; description: string };
};

type ProposedTopic = { id: string; name: string; description: string; status: string; generationStatus: string | null };

type RunDetail = {
  id: string;
  sourceId: string;
  sourceName: string | null;
  sourceVersionId: string | null;
  triggeredAt: string;
  completedAt: string | null;
  status: RunStatus;
  stages: Stage[];
  driftItems: DriftEntry[];
  proposedTopics: ProposedTopic[];
};

const STAGE_ORDER = ['ingest', 'extract_topics', 'drift_analysis', 'repair_decision'] as const;

const STAGE_DISPLAY: Record<string, string> = {
  ingest: 'Ingest, Normalize & Hash Check',
  extract_topics: 'Extract Topics',
  drift_analysis: 'Drift Analysis',
  repair_decision: 'Repair Decision',
};

const STAGE_DESCRIPTION: Record<string, string> = {
  ingest:
    'Fetches source content, normalizes it, and skips the run if nothing has changed since the last version.',
  extract_topics:
    'Extracts relevant content for each existing topic and proposes new ones found in the source.',
  drift_analysis:
    'Compares current extractions against previous versions to score how much each topic has changed.',
  repair_decision: 'Decides which topics auto-apply and which need human review before generating.',
};

const TERMINAL_STATUSES: RunStatus[] = ['completed', 'failed', 'awaiting_review'];

function RunStatusBadge({ status }: { status: RunStatus }) {
  if (status === 'running')
    return (
      <Badge className="bg-blue-500/10 text-blue-700 border-blue-200 animate-pulse">Running</Badge>
    );
  if (status === 'completed')
    return (
      <Badge className="bg-emerald-500/10 text-emerald-700 border-emerald-200">Completed</Badge>
    );
  if (status === 'failed') return <Badge variant="destructive">Failed</Badge>;
  return <Badge className="bg-amber-500/10 text-amber-700 border-amber-200">Awaiting review</Badge>;
}

function StageDot({ status }: { status: StageStatus }) {
  const base = 'h-2.5 w-2.5 rounded-full shrink-0 mt-1 ring-2 ring-background';
  if (status === 'completed') return <span className={cn(base, 'bg-emerald-500')} />;
  if (status === 'running') return <span className={cn(base, 'bg-blue-500 animate-pulse')} />;
  if (status === 'failed') return <span className={cn(base, 'bg-destructive')} />;
  if (status === 'skipped') return <span className={cn(base, 'bg-muted-foreground/25')} />;
  return <span className={cn(base, 'bg-border')} />;
}

function ItemDot({ status, generationStatus }: { status: string; generationStatus: string | null }) {
  const base = 'h-2 w-2 rounded-full shrink-0 mt-1.5 ring-2 ring-background';
  if (status === 'approved' || status === 'auto_applied')
    return <span className={cn(base, 'bg-emerald-400')} />;
  if (status === 'rejected') return <span className={cn(base, 'bg-muted-foreground/40')} />;
  if (generationStatus === 'generating') return <span className={cn(base, 'bg-blue-400 animate-pulse')} />;
  if (generationStatus === 'failed') return <span className={cn(base, 'bg-destructive')} />;
  return <span className={cn(base, 'bg-amber-400 animate-pulse')} />;
}

function StageBadge({ status }: { status: StageStatus }) {
  if (status === 'running')
    return (
      <Badge className="bg-blue-500/10 text-blue-700 border-blue-200 animate-pulse text-xs">
        Running
      </Badge>
    );
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
  if (status === 'skipped')
    return (
      <Badge variant="outline" className="text-muted-foreground/60 border-dashed text-xs">
        Skipped
      </Badge>
    );
  return (
    <Badge variant="outline" className="text-muted-foreground/60 text-xs">
      Pending
    </Badge>
  );
}

function ItemStatusBadge({ status }: { status: string }) {
  if (status === 'auto_applied')
    return (
      <Badge className="bg-emerald-500/10 text-emerald-700 border-emerald-200 text-xs">
        Auto-applied
      </Badge>
    );
  if (status === 'approved')
    return (
      <Badge className="bg-emerald-500/10 text-emerald-700 border-emerald-200 text-xs">
        Approved
      </Badge>
    );
  if (status === 'rejected')
    return (
      <Badge variant="outline" className="text-muted-foreground/60 text-xs">
        Rejected
      </Badge>
    );
  if (status === 'pending_review')
    return (
      <Badge className="bg-amber-500/10 text-amber-700 border-amber-200 text-xs">
        Pending review
      </Badge>
    );
  if (status === 'pending_approval')
    return (
      <Badge className="bg-amber-500/10 text-amber-700 border-amber-200 text-xs">
        Pending approval
      </Badge>
    );
  return (
    <Badge variant="outline" className="text-xs">
      {status}
    </Badge>
  );
}

function DriftLevelBadge({ level }: { level: 'low' | 'med' | 'high' }) {
  if (level === 'high')
    return (
      <Badge variant="destructive" className="text-xs">
        High
      </Badge>
    );
  if (level === 'med')
    return <Badge className="bg-amber-500/10 text-amber-700 border-amber-200 text-xs">Med</Badge>;
  return (
    <Badge variant="outline" className="text-xs">
      Low
    </Badge>
  );
}

function StageTimeline({
  stages,
  runStatus,
  driftItems,
  proposedTopics,
  reviewing,
  onReviewDrift,
  onReviewTopic,
}: {
  stages: Stage[];
  runStatus: RunStatus;
  driftItems: DriftEntry[];
  proposedTopics: ProposedTopic[];
  reviewing: Record<string, boolean>;
  onReviewDrift: (id: string, action: 'approve' | 'reject') => void;
  onReviewTopic: (id: string, action: 'approve' | 'reject') => void;
}) {
  const stageMap = Object.fromEntries(stages.map((s) => [s.stage, s]));
  const isTerminal = TERMINAL_STATUSES.includes(runStatus);
  const hasItems = driftItems.length > 0 || proposedTopics.length > 0;

  return (
    <div>
      {STAGE_ORDER.map((name, index) => {
        const stage = stageMap[name];
        const isLast = index === STAGE_ORDER.length - 1;
        const status: StageStatus = stage?.status ?? (isTerminal ? 'skipped' : 'pending');
        const railExtends = true; // every stage connects down to Generate

        return (
          <div key={name} className="flex gap-4">
            <div className="flex flex-col items-center w-5 shrink-0">
              <StageDot status={status} />
              {railExtends && (
                <div
                  className={cn(
                    'w-px flex-1 mt-1',
                    status === 'completed'
                      ? 'bg-emerald-200'
                      : status === 'failed'
                        ? 'bg-destructive/20'
                        : 'bg-border'
                  )}
                />
              )}
            </div>
            <div className={cn('flex-1 min-w-0', railExtends && 'pb-5')}>
              <div className="flex items-start justify-between gap-3 -mt-0.5">
                <div className="min-w-0 max-w-[50%]">
                  <p
                    className={cn(
                      'text-sm font-medium',
                      status === 'skipped' || status === 'pending' ? 'text-muted-foreground' : ''
                    )}
                  >
                    {STAGE_DISPLAY[name]}
                  </p>
                  <p className="text-xs text-muted-foreground/70 mt-0.5 leading-relaxed">
                    {STAGE_DESCRIPTION[name]}
                  </p>
                  {stage?.error && <p className="text-xs text-destructive mt-1">{stage.error}</p>}
                </div>
                <StageBadge status={status} />
              </div>
            </div>
          </div>
        );
      })}

      {/* Generate — section label only, no status, hollow ring to distinguish from stages */}
      <div className="flex gap-4">
        <div className="flex flex-col items-center w-5 shrink-0">
          <span className="h-2.5 w-2.5 rounded-full border-2 border-border bg-background shrink-0 mt-1 ring-2 ring-background" />
          {hasItems && <div className="w-px flex-1 mt-1 bg-border" />}
        </div>
        <div className={cn('flex-1 min-w-0', hasItems ? 'pb-4' : '')}>
          <p className="text-[11px] font-semibold tracking-widest uppercase text-muted-foreground/70 mt-0.5">
            Generate
          </p>
        </div>
      </div>

      {/* Per-item rows nested under Generate — drift items first, then proposed topics */}
      {driftItems.map((entry, idx) => {
        const isPending = entry.item.status === 'pending_review';
        const genStatus = entry.item.generationStatus;
        const busy = reviewing[entry.item.id] || genStatus === 'generating';
        const isLastItem = idx === driftItems.length - 1 && proposedTopics.length === 0;

        return (
          <div key={entry.item.id} className="flex gap-4">
            <div className="flex flex-col items-center w-5 shrink-0">
              <ItemDot status={entry.item.status} generationStatus={genStatus} />
              {!isLastItem && <div className="w-px flex-1 mt-1 bg-border" />}
            </div>
            <div className={cn('flex-1 min-w-0', !isLastItem && 'pb-4')}>
              <div className="flex items-start justify-between gap-3 -mt-0.5">
                <div className="min-w-0 space-y-0.5">
                  <p className="text-sm font-medium">{entry.topic.name}</p>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-xs font-mono text-muted-foreground">
                      {entry.item.changeType}
                    </span>
                    <DriftLevelBadge level={entry.item.driftLevel} />
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {(entry.item.driftScore * 100).toFixed(0)}%
                    </span>
                  </div>
                  {entry.item.reason && (
                    <p className="text-xs text-muted-foreground leading-relaxed pt-0.5">
                      {entry.item.reason}
                    </p>
                  )}
                </div>
                {genStatus === 'generating' ? (
                  <Badge className="bg-blue-500/10 text-blue-700 border-blue-200 text-xs animate-pulse">
                    Generating…
                  </Badge>
                ) : genStatus === 'failed' ? (
                  <Badge variant="destructive" className="text-xs">Generation failed</Badge>
                ) : (
                  <ItemStatusBadge status={entry.item.status} />
                )}
              </div>
              {isPending && (
                <div className="flex gap-2 mt-2">
                  <Button
                    size="sm"
                    disabled={busy}
                    onClick={() => onReviewDrift(entry.item.id, 'approve')}
                  >
                    {genStatus === 'generating' ? 'Generating…' : genStatus === 'failed' ? 'Retry' : 'Approve'}
                  </Button>
                  {genStatus !== 'generating' && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => onReviewDrift(entry.item.id, 'reject')}
                    >
                      Reject
                    </Button>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })}

      {proposedTopics.map((topic, idx) => {
        const isPending = topic.status === 'pending_approval';
        const genStatus = topic.generationStatus;
        const busy = reviewing[topic.id] || genStatus === 'generating';
        const isLastItem = idx === proposedTopics.length - 1;

        return (
          <div key={topic.id} className="flex gap-4">
            <div className="flex flex-col items-center w-5 shrink-0">
              <ItemDot status={topic.status} generationStatus={genStatus} />
              {!isLastItem && <div className="w-px flex-1 mt-1 bg-border" />}
            </div>
            <div className={cn('flex-1 min-w-0', !isLastItem && 'pb-4')}>
              <div className="flex items-start justify-between gap-3 -mt-0.5">
                <div className="min-w-0 space-y-0.5">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium">{topic.name}</p>
                    <Badge
                      variant="outline"
                      className="text-xs text-muted-foreground border-dashed"
                    >
                      New
                    </Badge>
                  </div>
                  {topic.description && (
                    <p className="text-xs text-muted-foreground line-clamp-2">
                      {topic.description}
                    </p>
                  )}
                </div>
                {genStatus === 'generating' ? (
                  <Badge className="bg-blue-500/10 text-blue-700 border-blue-200 text-xs animate-pulse">
                    Generating…
                  </Badge>
                ) : genStatus === 'failed' ? (
                  <Badge variant="destructive" className="text-xs">Generation failed</Badge>
                ) : (
                  <ItemStatusBadge status={topic.status} />
                )}
              </div>
              {isPending && (
                <div className="flex gap-2 mt-2">
                  <Button
                    size="sm"
                    disabled={busy}
                    onClick={() => onReviewTopic(topic.id, 'approve')}
                  >
                    {genStatus === 'generating' ? 'Generating…' : genStatus === 'failed' ? 'Retry' : 'Approve'}
                  </Button>
                  {genStatus !== 'generating' && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => onReviewTopic(topic.id, 'reject')}
                    >
                      Reject
                    </Button>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function PipelineRunPage() {
  const { runId } = useParams<{ runId: string }>();
  const searchParams = useSearchParams();
  const fromPipeline = searchParams.get('from') === 'pipeline';
  const [run, setRun] = useState<RunDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rerunning, setRerunning] = useState(false);
  const [epoch, setEpoch] = useState(0);
  const [reviewing, setReviewing] = useState<Record<string, boolean>>({});
  const statusRef = useRef<RunStatus | null>(null);

  async function load() {
    try {
      const res = await fetch(`/api/pipeline/${runId}`);
      if (!res.ok) {
        setError(`Failed to load run: ${res.status}`);
        return;
      }
      const data: RunDetail = await res.json();
      setRun(data);
      statusRef.current = data.status;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    }
  }

  useEffect(() => {
    if (!runId) return;
    let active = true;

    async function poll() {
      try {
        const res = await fetch(`/api/pipeline/${runId}`);
        if (!res.ok) {
          setError(`Failed to load run: ${res.status}`);
          return;
        }
        const data: RunDetail = await res.json();
        if (!active) return;
        setRun(data);
        statusRef.current = data.status;
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : 'Unknown error');
      }
    }

    poll();
    const interval = setInterval(async () => {
      await poll();
      if (statusRef.current && TERMINAL_STATUSES.includes(statusRef.current))
        clearInterval(interval);
    }, 2000);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [runId, epoch]);

  async function rerun() {
    if (!run) return;
    setRerunning(true);
    try {
      const res = await fetch(`/api/pipeline/${run.id}/resume`, { method: 'POST' });
      if (!res.ok) throw new Error(await res.text());
      setEpoch((e) => e + 1);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Resume failed');
    } finally {
      setRerunning(false);
    }
  }

  async function reviewDrift(id: string, action: 'approve' | 'reject') {
    setReviewing((r) => ({ ...r, [id]: true }));
    await fetch(`/api/review/drift/${id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    });
    await load();
    setReviewing((r) => ({ ...r, [id]: false }));
  }

  async function reviewTopic(id: string, action: 'approve' | 'reject') {
    setReviewing((r) => ({ ...r, [id]: true }));
    await fetch(`/api/review/topics/${id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    });
    await load();
    setReviewing((r) => ({ ...r, [id]: false }));
  }

  if (error) return <p className="text-destructive text-sm">{error}</p>;
  if (!run) return <p className="text-muted-foreground text-sm">Loading pipeline run…</p>;

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1 text-sm text-muted-foreground">
        {fromPipeline ? (
          <Link href="/admin/pipeline" className="hover:text-foreground transition-colors">Pipeline</Link>
        ) : (
          <>
            <Link href="/admin/sources" className="hover:text-foreground transition-colors">Sources</Link>
            {run.sourceName && (
              <>
                <ChevronRight className="h-3.5 w-3.5" />
                <Link href={`/admin/sources/${run.sourceId}`} className="hover:text-foreground transition-colors">{run.sourceName}</Link>
              </>
            )}
          </>
        )}
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="text-foreground font-medium font-mono">{run.id.slice(0, 8)}</span>
      </nav>

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1.5">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold tracking-tight">Pipeline Run</h1>
            <RunStatusBadge status={run.status} />
          </div>
          <div className="space-y-0.5">
            <p className="text-sm text-muted-foreground" suppressHydrationWarning>
              Triggered {fmtDate(run.triggeredAt)}
            </p>
            {run.completedAt && (
              <p className="text-sm text-muted-foreground" suppressHydrationWarning>
                Completed {fmtDate(run.completedAt)}
              </p>
            )}
            <p className="text-xs text-muted-foreground font-mono">{run.id}</p>
          </div>
        </div>
        {run.status === 'failed' && (
          <Button onClick={rerun} disabled={rerunning} variant="outline" size="sm">
            {rerunning ? 'Starting…' : 'Re-run'}
          </Button>
        )}
      </div>

      {/* Unified Stage + Items Timeline */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
            Pipeline
          </CardTitle>
        </CardHeader>
        <CardContent>
          <StageTimeline
            stages={run.stages}
            runStatus={run.status}
            driftItems={run.driftItems}
            proposedTopics={run.proposedTopics}
            reviewing={reviewing}
            onReviewDrift={reviewDrift}
            onReviewTopic={reviewTopic}
          />
        </CardContent>
      </Card>
    </div>
  );
}
