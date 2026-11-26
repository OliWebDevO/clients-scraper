"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { AlertTriangle, Ban, Check, Loader2, RefreshCw, Send, Undo2 } from "lucide-react";
import { SENDER, signature } from "@/lib/prospect";

interface Reply {
  id: string;
  from_email: string;
  from_name: string | null;
  subject: string | null;
  body: string | null;
  received_at: string;
  auto_reply: boolean;
  status: "new" | "handled";
  answered_at: string | null;
  businesses: { name: string; category: string | null; address: string | null; website_url: string | null } | null;
}

interface SyncState {
  checked_at?: string;
  last_error?: string;
}

const dateTime = (iso: string) =>
  new Date(iso).toLocaleString("fr-BE", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Brussels" });

const emptyAnswer = () => `Bonjour,\n\n\n\nBien cordialement,\n${signature()}`;

export default function RepliesPage() {
  const { toast } = useToast();
  const [replies, setReplies] = useState<Reply[]>([]);
  const [sync, setSync] = useState<SyncState | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/replies");
      const result = await res.json();
      if (result.success) {
        setReplies(result.data);
        setSync(result.sync);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const act = async (reply: Reply, action: "answer" | "refusal" | "handled" | "new") => {
    setBusy(reply.id);
    try {
      const res = await fetch("/api/replies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: reply.id, action, body: answers[reply.id] }),
      });
      const result = await res.json();
      if (!result.success) throw new Error(result.error);
      const name = reply.businesses?.name ?? reply.from_email;
      toast({
        title: { answer: "Réponse envoyée", refusal: "Ne sera plus contacté", handled: "Classé", new: "Remis à traiter" }[action],
        description: name,
      });
      await load();
    } catch (err) {
      toast({ title: "Erreur", description: err instanceof Error ? err.message : "Action impossible", variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const open = replies.filter((r) => r.status === "new");
  const handled = replies.filter((r) => r.status === "handled" && !r.auto_reply);
  const autoReplies = replies.filter((r) => r.auto_reply);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Réponses</h1>
          <p className="mt-1 text-muted-foreground">
            Réponses des prospects, lues chaque heure dans la boîte {SENDER.email}. Une réponse arrête les relances vers cette
            entreprise.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
          Actualiser
        </Button>
      </div>

      {sync?.last_error ? (
        <p role="alert" className="flex gap-2 rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-400">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          Dernière lecture de la boîte en échec ({sync.checked_at ? dateTime(sync.checked_at) : "date inconnue"}) : {sync.last_error}
        </p>
      ) : (
        sync?.checked_at && <p className="text-sm text-muted-foreground">Dernière lecture de la boîte : {dateTime(sync.checked_at)}</p>
      )}

      {loading ? (
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="Chargement" />
      ) : open.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-8 text-center text-muted-foreground">
          Aucune nouvelle réponse. Elles apparaissent ici au plus tard une heure après leur arrivée.
        </p>
      ) : (
        <div className="space-y-4">
          {open.map((reply) => {
            const isBusy = busy === reply.id;
            const answer = answers[reply.id] ?? emptyAnswer();
            return (
              <Card key={reply.id}>
                <CardHeader className="pb-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <CardTitle className="text-lg">{reply.businesses?.name ?? reply.from_email}</CardTitle>
                    <Badge variant="outline">{dateTime(reply.received_at)}</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {reply.from_name ? `${reply.from_name} · ` : ""}
                    {reply.from_email}
                    {reply.businesses?.category ? ` · ${reply.businesses.category}` : ""}
                    {reply.businesses?.address ? ` · ${reply.businesses.address}` : ""}
                  </p>
                </CardHeader>
                <CardContent className="grid gap-4 lg:grid-cols-2">
                  <div className="space-y-2">
                    <p className="text-sm font-medium">{reply.subject}</p>
                    <p className="whitespace-pre-wrap rounded-md border border-border bg-muted/30 p-3 text-sm">
                      {reply.body || "(message vide)"}
                    </p>
                  </div>
                  <div className="space-y-3">
                    <div className="space-y-2">
                      <Label htmlFor={`answer-${reply.id}`}>Votre réponse</Label>
                      <Textarea
                        id={`answer-${reply.id}`}
                        value={answer}
                        onChange={(e) => setAnswers((prev) => ({ ...prev, [reply.id]: e.target.value }))}
                        className="min-h-[220px] text-sm"
                      />
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" onClick={() => act(reply, "answer")} disabled={isBusy || answer.trim() === emptyAnswer().trim()}>
                        {isBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" aria-hidden="true" />}
                        Envoyer la réponse
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => act(reply, "refusal")} disabled={isBusy}>
                        <Ban className="mr-2 h-4 w-4" aria-hidden="true" />
                        Refus : ne plus contacter
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => act(reply, "handled")} disabled={isBusy}>
                        <Check className="mr-2 h-4 w-4" aria-hidden="true" />
                        Classer sans répondre
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {handled.length > 0 && (
        <details className="rounded-lg border border-border p-3">
          <summary className="cursor-pointer text-sm font-medium">Réponses traitées ({handled.length})</summary>
          <ul className="mt-2 divide-y divide-border text-sm">
            {handled.map((reply) => (
              <li key={reply.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p>
                    <span className="font-medium">{reply.businesses?.name ?? reply.from_email}</span> ·{" "}
                    <span className="text-muted-foreground">
                      {dateTime(reply.received_at)}
                      {reply.answered_at ? ` · répondu le ${dateTime(reply.answered_at)}` : ""}
                    </span>
                  </p>
                  <p className="mt-1 line-clamp-2 whitespace-pre-wrap text-muted-foreground">{reply.body}</p>
                </div>
                <Button size="sm" variant="ghost" onClick={() => act(reply, "new")} disabled={busy === reply.id}>
                  <Undo2 className="mr-2 h-4 w-4" aria-hidden="true" />
                  Remettre à traiter
                </Button>
              </li>
            ))}
          </ul>
        </details>
      )}

      {autoReplies.length > 0 && (
        <details className="rounded-lg border border-border p-3">
          <summary className="cursor-pointer text-sm font-medium">
            Réponses automatiques ({autoReplies.length}) : absences, accusés de réception. Elles n&apos;arrêtent pas les relances.
          </summary>
          <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
            {autoReplies.map((reply) => (
              <li key={reply.id}>
                {dateTime(reply.received_at)} · {reply.businesses?.name ?? reply.from_email} · {reply.subject}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
