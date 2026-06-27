'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Plus, Globe, FileText, Paperclip } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

type Source = {
  id: string;
  name: string;
  type: 'html' | 'pdf';
  url: string | null;
  createdAt: string;
};

const SourceIcon = ({ type }: { type: 'html' | 'pdf' }) =>
  type === 'html' ? (
    <Globe className="h-4 w-4 text-muted-foreground" />
  ) : (
    <FileText className="h-4 w-4 text-muted-foreground" />
  );

export default function SourcesPage() {
  const router = useRouter();
  const [sources, setSources] = useState<Source[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: '', type: 'html', url: '' });
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [step, setStep] = useState<'creating' | 'uploading' | 'triggering' | null>(null);

  function loadSources() {
    fetch('/api/sources')
      .then((r) => r.json())
      .then((data) => { setSources(data); setLoaded(true); })
      .catch(console.error);
  }

  useEffect(() => { loadSources(); }, []);

  function resetDialog() {
    setForm({ name: '', type: 'html', url: '' });
    setPdfFile(null);
    setStep(null);
  }

  async function addSource(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      setStep('creating');
      const res = await fetch('/api/sources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: form.name, type: form.type, url: form.url || undefined }),
      });
      const source = await res.json() as Source;

      if (form.type === 'pdf') {
        setStep(pdfFile ? 'uploading' : 'triggering');
        const body = pdfFile
          ? (() => { const fd = new FormData(); fd.append('file', pdfFile); return fd; })()
          : undefined;
        const runRes = await fetch(`/api/sources/${source.id}/pipeline`, { method: 'POST', body });
        if (runRes.ok) {
          const { runId } = await runRes.json() as { runId: string };
          router.push(`/admin/pipeline/${runId}`);
          return; // dialog unmounts with the navigation
        }
      }

      setOpen(false);
      resetDialog();
      loadSources();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Sources</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {sources.length} {sources.length === 1 ? 'source' : 'sources'} monitored
          </p>
        </div>
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetDialog(); }}>
          <DialogTrigger render={<Button size="sm"><Plus className="h-4 w-4 mr-1.5" />Add Source</Button>} />
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Source</DialogTitle>
            </DialogHeader>
            <form onSubmit={addSource} className="space-y-4 pt-1">
              <div className="space-y-1.5">
                <Label htmlFor="src-name">Name</Label>
                <Input
                  id="src-name"
                  placeholder="Google Cloud Docs"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="src-type">Type</Label>
                <select
                  id="src-type"
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  value={form.type}
                  onChange={(e) => { setForm((f) => ({ ...f, type: e.target.value, url: '' })); setPdfFile(null); }}
                >
                  <option value="html">HTML page</option>
                  <option value="pdf">PDF document</option>
                </select>
              </div>
              {form.type === 'html' && (
                <div className="space-y-1.5">
                  <Label htmlFor="src-url">URL</Label>
                  <Input
                    id="src-url"
                    placeholder="https://example.com/page"
                    type="url"
                    value={form.url}
                    onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
                    required
                  />
                </div>
              )}
              {form.type === 'pdf' && (
                <>
                  <div className="space-y-1.5">
                    <Label>PDF File <span className="font-normal text-muted-foreground text-xs">(optional)</span></Label>
                    <label className="flex items-center gap-2.5 h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm cursor-pointer hover:bg-muted/40 transition-colors">
                      <Paperclip className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className={`flex-1 truncate ${pdfFile ? '' : 'text-muted-foreground'}`}>
                        {pdfFile ? pdfFile.name : 'Choose PDF…'}
                      </span>
                      <input
                        type="file"
                        accept=".pdf"
                        className="hidden"
                        onChange={(e) => { setPdfFile(e.target.files?.[0] ?? null); setForm((f) => ({ ...f, url: '' })); }}
                      />
                    </label>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex-1 border-t" />
                    <span className="text-xs text-muted-foreground">or</span>
                    <div className="flex-1 border-t" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="src-pdf-url">PDF URL <span className="font-normal text-muted-foreground text-xs">(optional)</span></Label>
                    <Input
                      id="src-pdf-url"
                      placeholder="https://example.com/doc.pdf"
                      type="url"
                      value={form.url}
                      onChange={(e) => { setForm((f) => ({ ...f, url: e.target.value })); setPdfFile(null); }}
                    />
                  </div>
                </>
              )}
              <Button type="submit" className="w-full" disabled={submitting || (form.type === 'pdf' && !pdfFile && !form.url)}>
                {submitting
                  ? step === 'creating' ? 'Creating source…'
                    : step === 'uploading' ? 'Uploading PDF…'
                    : step === 'triggering' ? 'Starting pipeline…'
                    : 'Working…'
                  : form.type === 'pdf' ? 'Create & run pipeline' : 'Create source'}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="divide-y border rounded-lg overflow-hidden">
        {!loaded ? (
          <>
            {[1, 2].map((i) => (
              <div key={i} className="flex items-center gap-4 px-4 py-3.5">
                <div className="h-4 w-4 rounded bg-muted animate-pulse shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3.5 w-32 rounded bg-muted animate-pulse" />
                  <div className="h-3 w-48 rounded bg-muted animate-pulse" />
                </div>
                <div className="h-5 w-10 rounded bg-muted animate-pulse" />
              </div>
            ))}
          </>
        ) : sources.length === 0 ? (
          <div className="px-4 py-10 text-center">
            <p className="text-sm text-muted-foreground">No sources yet.</p>
            <p className="text-xs text-muted-foreground mt-1">Add a source to start monitoring content.</p>
          </div>
        ) : (
          sources.map((s) => (
            <Link
              key={s.id}
              href={`/admin/sources/${s.id}`}
              className="flex items-center gap-4 px-4 py-3.5 hover:bg-muted/40 transition-colors group"
            >
              <SourceIcon type={s.type} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium group-hover:text-primary transition-colors">
                  {s.name}
                </p>
                {s.url && (
                  <p className="text-xs text-muted-foreground truncate mt-0.5">{s.url}</p>
                )}
              </div>
              <Badge variant="outline" className="shrink-0 text-xs font-mono">
                {s.type}
              </Badge>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
