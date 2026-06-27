"use client";
import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { fmtDate } from "@/lib/utils";

type StageStatus = "pending" | "running" | "completed" | "failed" | "skipped";
type RunStatus = "running" | "completed" | "failed" | "awaiting_review";

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
    driftLevel: "low" | "med" | "high";
    reason: string;
    status: string;
  };
  topic: { id: string; name: string; description: string };
};

type ProposedTopic = {
  id: string;
  name: string;
  description: string;
  status: string;
};

type RunDetail = {
  id: string;
  sourceId: string;
  sourceVersionId: string | null;
  triggeredAt: string;
  completedAt: string | null;
  status: RunStatus;
  stages: Stage[];
  driftItems: DriftEntry[];
  proposedTopics: ProposedTopic[];
};

const STAGE_ORDER = [
  "ingest", "normalize", "hash_check", "extract_topics",
  "drift_analysis", "repair_decision", "generate",
] as const;

const STAGE_DISPLAY: Record<string, string> = {
  ingest: "Ingest", normalize: "Normalize", hash_check: "Hash Check",
  extract_topics: "Extract Topics", drift_analysis: "Drift Analysis",
  repair_decision: "Repair Decision", generate: "Generate",
};

const TERMINAL_STATUSES: RunStatus[] = ["completed", "failed", "awaiting_review"];

function StageBadge({ status }: { status: StageStatus | "pending" }) {
  if (status === "running") return <Badge className="bg-blue-500 text-white animate-pulse">◉ Running</Badge>;
  if (status === "completed") return <Badge className="bg-green-600 text-white">✓ Completed</Badge>;
  if (status === "failed") return <Badge variant="destructive">✗ Failed</Badge>;
  if (status === "skipped") return <Badge variant="outline" className="text-muted-foreground border-dashed">— Skipped</Badge>;
  return <Badge variant="outline" className="text-muted-foreground">○ Pending</Badge>;
}

function RunStatusBadge({ status }: { status: RunStatus }) {
  if (status === "running") return <Badge className="bg-blue-500 text-white animate-pulse">Running</Badge>;
  if (status === "completed") return <Badge className="bg-green-600 text-white">Completed</Badge>;
  if (status === "failed") return <Badge variant="destructive">Failed</Badge>;
  return <Badge className="bg-yellow-500 text-white">Awaiting Review</Badge>;
}

function DriftLevelBadge({ level }: { level: "low" | "med" | "high" }) {
  if (level === "high") return <Badge variant="destructive">High</Badge>;
  if (level === "med") return <Badge className="bg-yellow-500 text-white">Med</Badge>;
  return <Badge variant="outline">Low</Badge>;
}

export default function PipelineRunPage() {
  const { runId } = useParams<{ runId: string }>();
  const [run, setRun] = useState<RunDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rerunning, setRerunning] = useState(false);
  const [epoch, setEpoch] = useState(0);
  const [reviewing, setReviewing] = useState<Record<string, boolean>>({});
  const statusRef = useRef<RunStatus | null>(null);

  async function load() {
    try {
      const res = await fetch(`/api/pipeline/${runId}`);
      if (!res.ok) { setError(`Failed to load run: ${res.status}`); return; }
      const data: RunDetail = await res.json();
      setRun(data);
      statusRef.current = data.status;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    }
  }

  useEffect(() => {
    if (!runId) return;
    let active = true;

    async function poll() {
      try {
        const res = await fetch(`/api/pipeline/${runId}`);
        if (!res.ok) { setError(`Failed to load run: ${res.status}`); return; }
        const data: RunDetail = await res.json();
        if (!active) return;
        setRun(data);
        statusRef.current = data.status;
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : "Unknown error");
      }
    }

    poll();
    const interval = setInterval(async () => {
      await poll();
      if (statusRef.current && TERMINAL_STATUSES.includes(statusRef.current)) {
        clearInterval(interval);
      }
    }, 2000);

    return () => { active = false; clearInterval(interval); };
  }, [runId, epoch]);

  async function rerun() {
    if (!run) return;
    setRerunning(true);
    try {
      const res = await fetch(`/api/pipeline/${run.id}/resume`, { method: "POST" });
      if (!res.ok) throw new Error(await res.text());
      setEpoch(e => e + 1);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Resume failed");
    } finally {
      setRerunning(false);
    }
  }

  async function reviewDrift(id: string, action: "approve" | "reject") {
    setReviewing(r => ({ ...r, [id]: true }));
    await fetch(`/api/review/drift/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    await load();
    setReviewing(r => ({ ...r, [id]: false }));
  }

  async function reviewTopic(id: string, action: "approve" | "reject") {
    setReviewing(r => ({ ...r, [id]: true }));
    await fetch(`/api/review/topics/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    await load();
    setReviewing(r => ({ ...r, [id]: false }));
  }

  if (error) return <p className="text-destructive text-sm">{error}</p>;
  if (!run) return <p className="text-muted-foreground text-sm">Loading pipeline run…</p>;

  const stageMap = Object.fromEntries(run.stages.map(s => [s.stage, s]));

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold">Pipeline Run</h1>
            <RunStatusBadge status={run.status} />
          </div>
          <p className="text-sm text-muted-foreground" suppressHydrationWarning>
            Triggered: {fmtDate(run.triggeredAt)}
          </p>
          {run.completedAt && (
            <p className="text-sm text-muted-foreground" suppressHydrationWarning>
              Completed: {fmtDate(run.completedAt)}
            </p>
          )}
          <p className="text-xs text-muted-foreground font-mono">{run.id}</p>
        </div>
        {run.status === "failed" && (
          <Button onClick={rerun} disabled={rerunning} variant="outline">
            {rerunning ? "Starting…" : "Re-run Pipeline"}
          </Button>
        )}
      </div>

      {/* Stages */}
      <Card>
        <CardHeader><CardTitle className="text-base">Stages</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {STAGE_ORDER.map((name, index) => {
            const stage = stageMap[name];
            const status: StageStatus | "pending" = stage?.status ?? "pending";
            return (
              <div key={name} className="flex items-center justify-between border rounded px-3 py-2 gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-xs text-muted-foreground w-4 text-right shrink-0">{index + 1}</span>
                  <span className="text-sm font-medium">{STAGE_DISPLAY[name]}</span>
                  {stage?.outputSummary && (
                    <span className="text-xs text-muted-foreground truncate hidden sm:block">{stage.outputSummary}</span>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {stage?.error && <span className="text-xs text-destructive max-w-50 truncate">{stage.error}</span>}
                  <StageBadge status={status} />
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Drift Items */}
      {run.driftItems.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Drift Items ({run.driftItems.length})</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {run.driftItems.map(entry => {
              const pending = entry.item.status === "pending_review";
              const busy = reviewing[entry.item.id];
              return (
                <div key={entry.item.id} className="border rounded p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="font-medium text-sm">{entry.topic.name}</span>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className="text-xs">{entry.item.changeType}</Badge>
                      <DriftLevelBadge level={entry.item.driftLevel} />
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {(entry.item.driftScore * 100).toFixed(1)}%
                      </span>
                      {!pending && <Badge variant="outline" className="text-xs">{entry.item.status}</Badge>}
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">{entry.item.reason}</p>
                  {pending && (
                    <div className="flex gap-2 pt-1">
                      <Button size="sm" disabled={busy} onClick={() => reviewDrift(entry.item.id, "approve")}>
                        Approve
                      </Button>
                      <Button size="sm" variant="outline" disabled={busy} onClick={() => reviewDrift(entry.item.id, "reject")}>
                        Reject
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Proposed Topics */}
      {run.proposedTopics.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Proposed Topics ({run.proposedTopics.length})</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {run.proposedTopics.map(topic => {
              const pending = topic.status === "pending_approval";
              const busy = reviewing[topic.id];
              return (
                <div key={topic.id} className="border rounded px-3 py-2 space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{topic.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{topic.description}</p>
                    </div>
                    {!pending && <Badge variant="outline" className="shrink-0 text-xs">{topic.status}</Badge>}
                  </div>
                  {pending && (
                    <div className="flex gap-2">
                      <Button size="sm" disabled={busy} onClick={() => reviewTopic(topic.id, "approve")}>
                        Approve
                      </Button>
                      <Button size="sm" variant="outline" disabled={busy} onClick={() => reviewTopic(topic.id, "reject")}>
                        Reject
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
