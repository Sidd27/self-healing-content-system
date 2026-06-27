"use client";
import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type StageStatus = "pending" | "running" | "completed" | "failed" | "skipped";
type RunStatus = "running" | "completed" | "failed" | "awaiting_review";

type Stage = {
  id: string;
  pipelineRunId: string;
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
  topic: {
    id: string;
    name: string;
    description: string;
  };
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
  "ingest",
  "normalize",
  "hash_check",
  "extract_topics",
  "drift_analysis",
  "repair_decision",
  "generate",
] as const;

const STAGE_DISPLAY: Record<string, string> = {
  ingest: "Ingest",
  normalize: "Normalize",
  hash_check: "Hash Check",
  extract_topics: "Extract Topics",
  drift_analysis: "Drift Analysis",
  repair_decision: "Repair Decision",
  generate: "Generate",
};

const TERMINAL_STATUSES: RunStatus[] = [
  "completed",
  "failed",
  "awaiting_review",
];

function stageStatusIcon(status: StageStatus): string {
  switch (status) {
    case "completed":
      return "✓";
    case "failed":
      return "✗";
    case "running":
      return "◉";
    case "skipped":
      return "—";
    default:
      return "○";
  }
}

function StageBadge({ status }: { status: StageStatus | "pending" }) {
  if (status === "running") {
    return (
      <Badge className="bg-blue-500 text-white animate-pulse">
        {stageStatusIcon(status)} Running
      </Badge>
    );
  }
  if (status === "completed") {
    return (
      <Badge className="bg-green-600 text-white">
        {stageStatusIcon(status)} Completed
      </Badge>
    );
  }
  if (status === "failed") {
    return (
      <Badge variant="destructive">{stageStatusIcon(status)} Failed</Badge>
    );
  }
  if (status === "skipped") {
    return (
      <Badge variant="outline" className="text-muted-foreground border-dashed">
        {stageStatusIcon(status)} Skipped
      </Badge>
    );
  }
  // pending
  return (
    <Badge variant="outline" className="text-muted-foreground">
      {stageStatusIcon("pending")} Pending
    </Badge>
  );
}

function RunStatusBadge({ status }: { status: RunStatus }) {
  if (status === "running") {
    return (
      <Badge className="bg-blue-500 text-white animate-pulse">Running</Badge>
    );
  }
  if (status === "completed") {
    return <Badge className="bg-green-600 text-white">Completed</Badge>;
  }
  if (status === "failed") {
    return <Badge variant="destructive">Failed</Badge>;
  }
  return <Badge className="bg-yellow-500 text-white">Awaiting Review</Badge>;
}

function DriftLevelBadge({ level }: { level: "low" | "med" | "high" }) {
  if (level === "high") return <Badge variant="destructive">High</Badge>;
  if (level === "med")
    return <Badge className="bg-yellow-500 text-white">Med</Badge>;
  return <Badge variant="outline">Low</Badge>;
}

export default function PipelineRunPage() {
  const { runId } = useParams<{ runId: string }>();
  const router = useRouter();
  const [run, setRun] = useState<RunDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rerunning, setRerunning] = useState(false);
  const statusRef = useRef<RunStatus | null>(null);

  async function rerun() {
    if (!run) return;
    setRerunning(true);
    try {
      const res = await fetch(`/api/sources/${run.sourceId}/pipeline`, { method: "POST" });
      if (!res.ok) throw new Error(await res.text());
      const { runId: newRunId } = await res.json();
      router.push(`/admin/pipeline/${newRunId}`);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Re-run failed");
      setRerunning(false);
    }
  }

  useEffect(() => {
    if (!runId) return;

    let active = true;

    async function load() {
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
        if (active)
          setError(err instanceof Error ? err.message : "Unknown error");
      }
    }

    load();

    const interval = setInterval(() => {
      if (statusRef.current && TERMINAL_STATUSES.includes(statusRef.current)) {
        clearInterval(interval);
        return;
      }
      load();
    }, 2000);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [runId]);

  if (error) {
    return <p className="text-destructive text-sm">{error}</p>;
  }

  if (!run) {
    return (
      <p className="text-muted-foreground text-sm">Loading pipeline run...</p>
    );
  }

  const stageMap = Object.fromEntries(run.stages.map((s) => [s.stage, s]));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold">Pipeline Run</h1>
            <RunStatusBadge status={run.status} />
          </div>
          <p className="text-sm text-muted-foreground">
            Triggered: {new Date(run.triggeredAt).toLocaleString()}
          </p>
          {run.completedAt && (
            <p className="text-sm text-muted-foreground">
              Completed: {new Date(run.completedAt).toLocaleString()}
            </p>
          )}
          <p className="text-xs text-muted-foreground font-mono">{run.id}</p>
        </div>

        <div className="flex gap-2">
          {run.status === "failed" && (
            <Button
              onClick={rerun}
              disabled={rerunning}
              variant="outline"
            >
              {rerunning ? "Starting..." : "Re-run Pipeline"}
            </Button>
          )}
          {run.status === "awaiting_review" && (
            <Link href="/admin/review">
              <Button className="bg-yellow-500 hover:bg-yellow-600 text-white">
                Go to Review Queue
              </Button>
            </Link>
          )}
        </div>
      </div>

      {/* Stages */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Stages</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {STAGE_ORDER.map((name, index) => {
            const stage = stageMap[name];
            const status: StageStatus | "pending" = stage?.status ?? "pending";
            return (
              <div
                key={name}
                className="flex items-center justify-between border rounded px-3 py-2 gap-4"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-xs text-muted-foreground w-4 text-right shrink-0">
                    {index + 1}
                  </span>
                  <span className="text-sm font-medium">
                    {STAGE_DISPLAY[name]}
                  </span>
                  {stage?.outputSummary && (
                    <span className="text-xs text-muted-foreground truncate hidden sm:block">
                      {stage.outputSummary}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {stage?.error && (
                    <span className="text-xs text-destructive max-w-50 truncate">
                      {stage.error}
                    </span>
                  )}
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
          <CardHeader>
            <CardTitle className="text-base">
              Drift Items ({run.driftItems.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {run.driftItems.map((entry) => (
              <div key={entry.item.id} className="border rounded p-3 space-y-2">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="font-medium text-sm">
                    {entry.topic.name}
                  </span>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline" className="text-xs">
                      {entry.item.changeType}
                    </Badge>
                    <DriftLevelBadge level={entry.item.driftLevel} />
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {(entry.item.driftScore * 100).toFixed(1)}%
                    </span>
                    <Badge variant="outline" className="text-xs">
                      {entry.item.status}
                    </Badge>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  {entry.item.reason}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Proposed Topics (if any) */}
      {run.proposedTopics.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Proposed Topics ({run.proposedTopics.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {run.proposedTopics.map((topic) => (
              <div
                key={topic.id}
                className="border rounded px-3 py-2 flex items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium">{topic.name}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {topic.description}
                  </p>
                </div>
                <Badge variant="outline" className="shrink-0 text-xs">
                  {topic.status}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
