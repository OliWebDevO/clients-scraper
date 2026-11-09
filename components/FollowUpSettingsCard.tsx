"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { MailCheck, Loader2 } from "lucide-react";

/** Settings card for the automatic follow-up (one per prospect, after N days without reply) */
export function FollowUpSettingsCard() {
  const { toast } = useToast();
  const [enabled, setEnabled] = useState(false);
  const [delayDays, setDelayDays] = useState("5");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/settings/followups")
      .then((res) => res.json())
      .then((result) => {
        if (result.success) {
          setEnabled(result.data.enabled);
          setDelayDays(String(result.data.delay_days));
        }
      })
      .finally(() => setLoading(false));
  }, []);

  const save = async (nextEnabled = enabled) => {
    setSaving(true);
    try {
      const res = await fetch("/api/settings/followups", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: nextEnabled, delay_days: Number(delayDays) }),
      });
      const result = await res.json();
      if (!result.success) throw new Error(result.error);
      setEnabled(nextEnabled);
      toast({ title: "Enregistré", description: nextEnabled ? `Relance après ${delayDays} jours sans réponse` : "Relances désactivées" });
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
          <MailCheck className="h-5 w-5" aria-hidden="true" />
          Relances automatiques
        </CardTitle>
        <CardDescription>
          Une seule relance, dans le même fil, aux prospects qui n&apos;ont pas répondu à votre premier mail.
          Envoyée en semaine entre 9h et 17h, jamais à ceux marqués « A répondu » ou « Ne plus contacter ».
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-label="Chargement" />
        ) : (
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
            <div className="flex items-center gap-3">
              <Switch
                id="followups-enabled"
                checked={enabled}
                onCheckedChange={(v) => save(v)}
                disabled={saving}
              />
              <Label htmlFor="followups-enabled">{enabled ? "Activées" : "Désactivées"}</Label>
            </div>
            <div className="space-y-2">
              <Label htmlFor="followups-delay">Relancer après (jours)</Label>
              <div className="flex gap-2">
                <Input
                  id="followups-delay"
                  type="number"
                  min={2}
                  max={21}
                  value={delayDays}
                  onChange={(e) => setDelayDays(e.target.value)}
                  className="w-24"
                />
                <Button variant="outline" onClick={() => save()} disabled={saving}>
                  Enregistrer
                </Button>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
