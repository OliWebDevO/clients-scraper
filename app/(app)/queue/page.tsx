"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { AlertTriangle, Check, CheckCheck, Loader2, RefreshCw, Sparkles, Undo2, X, XCircle } from "lucide-react";

interface QueueItem {
  id: string;
  recipient_email: string;
  subject: string;
  body: string;
  kind: "first" | "followup";
  status: "pending" | "approved" | "sent" | "rejected" | "failed";
  checks: { errors: string[]; warnings: string[] } | null;
  ai_review: { verdict: string; problems: string[]; suggestions: string[] } | null;
  error_message: string | null;
  created_at: string;
  sent_at: string | null;
  businesses: { name: string; category: string | null; address: string | null } | null;
}

const STATUS_LABEL: Record<QueueItem["status"], string> = {
  pending: "À valider",
  approved: "Validé, part à la prochaine heure pleine",
  sent: "Envoyé",
  rejected: "Écarté",
  failed: "Échec",
};

export default function QueuePage() {
  const { toast } = useToast();
  const [open, setOpen] = useState<QueueItem[]>([]);
  const [recent, setRecent] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, { subject: string; body: string }>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/queue");
      const result = await res.json();
      if (result.success) {
        setOpen(result.open);
        setRecent(result.recent);
        setDrafts(Object.fromEntries(result.open.map((q: QueueItem) => [q.id, { subject: q.subject, body: q.body }])));
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const replaceItem = (item: QueueItem) => {
    setOpen((prev) => prev.map((q) => (q.id === item.id ? item : q)));
    setDrafts((prev) => ({ ...prev, [item.id]: { subject: item.subject, body: item.body } }));
  };

  const update = async (item: QueueItem, status?: "approved" | "rejected" | "pending") => {
    setBusy(item.id);
    try {
      const draft = drafts[item.id];
      const res = await fetch("/api/queue", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id, subject: draft.subject, body: draft.body, status }),
      });
      const result = await res.json();
      if (!result.success) throw new Error(result.error);
      if (status === "rejected") {
        setOpen((prev) => prev.filter((q) => q.id !== item.id));
        toast({ title: "Écarté", description: item.businesses?.name ?? item.recipient_email });
      } else {
        replaceItem(result.data);
        toast({
          title: status === "approved" ? "Validé" : "Enregistré",
          description: status === "approved" ? "Il partira à la prochaine heure pleine (8h–20h)." : "Vérifications relancées.",
        });
      }
    } catch (err) {
      toast({ title: "Erreur", description: err instanceof Error ? err.message : "Action impossible", variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const aiReview = async (item: QueueItem) => {
    setBusy(item.id);
    try {
      // Save the current text first so the AI reads what you edited
      await fetch("/api/queue", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id, ...drafts[item.id] }),
      });
      const res = await fetch("/api/queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "review", id: item.id }),
      });
      const result = await res.json();
      if (!result.success) throw new Error(result.error);
      replaceItem(result.data);
    } catch (err) {
      toast({ title: "Erreur", description: err instanceof Error ? err.message : "Relecture impossible", variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const approveClean = async () => {
    setBusy("all");
    try {
      const res = await fetch("/api/queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "approve_clean" }),
      });
      const result = await res.json();
      toast({ title: "Validés", description: `${result.approved} mail(s) validé(s), sans erreur bloquante.` });
      await load();
    } finally {
      setBusy(null);
    }
  };

  const pending = open.filter((q) => q.status !== "approved");
  const approved = open.filter((q) => q.status === "approved");

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">À valider</h1>
          <p className="mt-1 text-muted-foreground">
            Mails préparés automatiquement, vérifiés par l&apos;IA. Relisez, corrigez si besoin, puis validez : ils partent à la
            prochaine heure pleine, entre 8h et 20h.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
            Actualiser
          </Button>
          <Button size="sm" onClick={approveClean} disabled={busy !== null || pending.length === 0}>
            <CheckCheck className="mr-2 h-4 w-4" aria-hidden="true" />
            Valider tous ceux sans erreur
          </Button>
        </div>
      </div>

      {loading ? (
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="Chargement" />
      ) : pending.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-8 text-center text-muted-foreground">
          Rien à valider pour l&apos;instant. Les mails apparaissent ici à l&apos;heure d&apos;envoi choisie dans Réglages.
        </p>
      ) : (
        <div className="space-y-4">
          {pending.map((item) => {
            const draft = drafts[item.id] ?? { subject: item.subject, body: item.body };
            const isBusy = busy === item.id;
            return (
              <Card key={item.id}>
                <CardHeader className="pb-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <CardTitle className="text-lg">{item.businesses?.name ?? item.recipient_email}</CardTitle>
                    <Badge variant="outline">{item.kind === "followup" ? "Relance" : "Premier contact"}</Badge>
                    {item.status === "failed" && <Badge variant="destructive">Échec</Badge>}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {item.recipient_email}
                    {item.businesses?.category ? ` · ${item.businesses.category}` : ""}
                    {item.businesses?.address ? ` · ${item.businesses.address}` : ""}
                  </p>
                </CardHeader>
                <CardContent className="grid gap-4 lg:grid-cols-[1fr_320px]">
                  <div className="space-y-3">
                    <div className="space-y-2">
                      <Label htmlFor={`subject-${item.id}`}>Sujet</Label>
                      <Input
                        id={`subject-${item.id}`}
                        value={draft.subject}
                        onChange={(e) => setDrafts((p) => ({ ...p, [item.id]: { ...draft, subject: e.target.value } }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor={`body-${item.id}`}>Message</Label>
                      <Textarea
                        id={`body-${item.id}`}
                        value={draft.body}
                        onChange={(e) => setDrafts((p) => ({ ...p, [item.id]: { ...draft, body: e.target.value } }))}
                        className="min-h-[260px] text-sm"
                      />
                    </div>
                  </div>

                  <div className="space-y-3 text-sm" aria-live="polite">
                    {item.error_message && <p className="text-red-400">{item.error_message}</p>}
                    {(item.checks?.errors.length ?? 0) + (item.checks?.warnings.length ?? 0) > 0 && (
                      <ul className="space-y-1">
                        {item.checks!.errors.map((m) => (
                          <li key={m} className="flex gap-2 text-red-400">
                            <XCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                            <span><span className="sr-only">Erreur : </span>{m}</span>
                          </li>
                        ))}
                        {item.checks!.warnings.map((m) => (
                          <li key={m} className="flex gap-2 text-amber-300">
                            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                            <span><span className="sr-only">Attention : </span>{m}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                    {item.ai_review ? (
                      <div className="space-y-2 rounded-md border border-violet-500/40 bg-violet-500/10 p-3">
                        <p className="font-medium">Relecture IA : {item.ai_review.verdict}</p>
                        {item.ai_review.problems.length > 0 && (
                          <ul className="list-disc space-y-1 pl-5">
                            {item.ai_review.problems.map((p) => <li key={p}>{p}</li>)}
                          </ul>
                        )}
                        {item.ai_review.suggestions.length > 0 && (
                          <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                            {item.ai_review.suggestions.map((p) => <li key={p}>{p}</li>)}
                          </ul>
                        )}
                      </div>
                    ) : (
                      <p className="text-muted-foreground">Pas encore relu par l&apos;IA.</p>
                    )}

                    <div className="flex flex-wrap gap-2 pt-1">
                      <Button size="sm" onClick={() => update(item, "approved")} disabled={isBusy}>
                        {isBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" aria-hidden="true" />}
                        Valider
                      </Button>
                      <Button size="sm" variant="secondary" onClick={() => aiReview(item)} disabled={isBusy}>
                        <Sparkles className="mr-2 h-4 w-4" aria-hidden="true" />
                        Relire avec l&apos;IA
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => update(item)} disabled={isBusy}>
                        Enregistrer
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => update(item, "rejected")} disabled={isBusy}>
                        <X className="mr-2 h-4 w-4" aria-hidden="true" />
                        Écarter
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {approved.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold">Validés ({approved.length}) : partent à la prochaine heure pleine</h2>
          <ul className="divide-y divide-border rounded-lg border border-border">
            {approved.map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-3 p-3 text-sm">
                <span className="min-w-0 truncate">
                  <span className="font-medium">{item.businesses?.name ?? item.recipient_email}</span> · {item.subject}
                </span>
                <Button size="sm" variant="ghost" onClick={() => update(item, "pending")} disabled={busy === item.id}>
                  <Undo2 className="mr-2 h-4 w-4" aria-hidden="true" />
                  Annuler
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {recent.length > 0 && (
        <details className="rounded-lg border border-border p-3">
          <summary className="cursor-pointer text-sm font-medium">Derniers traités ({recent.length})</summary>
          <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
            {recent.map((item) => (
              <li key={item.id}>
                {STATUS_LABEL[item.status]} · {item.businesses?.name ?? item.recipient_email} · {item.subject}
                {item.error_message ? ` (${item.error_message})` : ""}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
