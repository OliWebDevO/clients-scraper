"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Send, Loader2 } from "lucide-react";

interface Preview {
  kbo: Array<{ name: string; email: string | null }>;
  google: Array<{ name: string; email: string | null; rating: number | null }>;
}

/** Settings card for the daily automatic first contacts (KBO companies + outdated/no-site Google prospects) */
export function DailyOutreachCard() {
  const { toast } = useToast();
  const [enabled, setEnabled] = useState(false);
  const [hour, setHour] = useState("8");
  const [kboCount, setKboCount] = useState("15");
  const [googleCount, setGoogleCount] = useState("5");
  const [lastRun, setLastRun] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = () =>
    fetch("/api/settings/daily-outreach")
      .then((res) => res.json())
      .then((result) => {
        if (!result.success) return;
        const d = result.data;
        setEnabled(d.enabled);
        setHour(String(d.hour));
        setKboCount(String(d.kbo_count));
        setGoogleCount(String(d.google_count));
        setLastRun(
          d.last_run_date && d.last_result
            ? `${d.last_run_date} : ${d.last_result.kbo} KBO, ${d.last_result.google} Google${d.last_result.skipped ? `, ${d.last_result.skipped} ignorés` : ""}`
            : null
        );
        setPreview(result.preview);
      })
      .finally(() => setLoading(false));

  useEffect(() => {
    load();
  }, []);

  const save = async (nextEnabled = enabled) => {
    setSaving(true);
    try {
      const res = await fetch("/api/settings/daily-outreach", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: nextEnabled, hour: Number(hour), kbo_count: Number(kboCount), google_count: Number(googleCount) }),
      });
      const result = await res.json();
      if (!result.success) throw new Error(result.error);
      setEnabled(nextEnabled);
      toast({ title: "Enregistré", description: nextEnabled ? `Envoi chaque jour à ${hour}h` : "Envoi quotidien désactivé" });
      load();
    } catch (err) {
      toast({ title: "Erreur", description: err instanceof Error ? err.message : "Échec de l'enregistrement", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Send className="h-5 w-5" aria-hidden="true" />
          Envoi quotidien automatique
        </CardTitle>
        <CardDescription>
          Chaque jour, le mail de premier contact part tout seul vers les sociétés KBO récemment créées et vers les
          entreprises Google bien notées sans site ou avec un site vieillot (à leur adresse générique). Jamais aux
          indépendants, ni à quelqu&apos;un déjà contacté.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-label="Chargement" />
        ) : (
          <>
            <div className="flex flex-wrap items-end gap-4">
              <div className="flex items-center gap-3">
                <Switch id="daily-enabled" checked={enabled} onCheckedChange={(v) => save(v)} disabled={saving} />
                <Label htmlFor="daily-enabled">{enabled ? "Activé" : "Désactivé"}</Label>
              </div>
              <div className="space-y-2">
                <Label htmlFor="daily-hour">Heure</Label>
                <Input id="daily-hour" type="number" min={6} max={20} value={hour} onChange={(e) => setHour(e.target.value)} className="w-20" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="daily-kbo">Sociétés KBO / jour</Label>
                <Input id="daily-kbo" type="number" min={0} max={30} value={kboCount} onChange={(e) => setKboCount(e.target.value)} className="w-24" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="daily-google">Google / jour</Label>
                <Input id="daily-google" type="number" min={0} max={30} value={googleCount} onChange={(e) => setGoogleCount(e.target.value)} className="w-24" />
              </div>
              <Button variant="outline" onClick={() => save()} disabled={saving}>
                Enregistrer
              </Button>
            </div>

            {lastRun && <p className="text-sm text-muted-foreground">Dernier envoi : {lastRun}</p>}

            {preview && (
              <div className="grid gap-4 text-sm sm:grid-cols-2">
                <div>
                  <p className="mb-1 font-medium">Prochain envoi KBO ({preview.kbo.length})</p>
                  {preview.kbo.length ? (
                    <ul className="space-y-0.5 text-muted-foreground">
                      {preview.kbo.map((b) => <li key={b.name}>{b.name} · {b.email}</li>)}
                    </ul>
                  ) : (
                    <p className="text-muted-foreground">Aucune société éligible : importez le fichier KBO du mois.</p>
                  )}
                </div>
                <div>
                  <p className="mb-1 font-medium">Prochain envoi Google ({preview.google.length})</p>
                  {preview.google.length ? (
                    <ul className="space-y-0.5 text-muted-foreground">
                      {preview.google.map((b) => <li key={b.name}>{b.name}{b.rating ? ` (${b.rating}★)` : ""} · {b.email}</li>)}
                    </ul>
                  ) : (
                    <p className="text-muted-foreground">
                      Aucun email générique connu pour l&apos;instant : le job en cherche sur les sites avant chaque envoi.
                    </p>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
