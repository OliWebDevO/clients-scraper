"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Briefcase, MapPin, Search, Check, Hash } from "lucide-react";
import { JOB_PLATFORMS, DEFAULT_KEYWORDS, JobPlatform } from "@/lib/types";

export interface JobProgressUpdate {
  current: number;
  total: number;
  progress: number;
  message: string;
  phase: "init" | "scraping" | "saving" | "error" | "done";
  platform?: string;
  jobsFound?: number;
}

interface ScrapeJobsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onStartScrape: (config: JobScrapeConfig) => void;
  isLoading: boolean;
  progressData?: JobProgressUpdate | null;
}

export interface JobScrapeConfig {
  platforms: JobPlatform[];
  keywords: string[];
  location: string;
  maxResults: number;
}

export function ScrapeJobsModal({
  open,
  onOpenChange,
  onStartScrape,
  isLoading,
  progressData,
}: ScrapeJobsModalProps) {
  const [selectedPlatforms, setSelectedPlatforms] = useState<JobPlatform[]>([]);
  const [selectedKeywords, setSelectedKeywords] = useState<string[]>([
    ...DEFAULT_KEYWORDS,
  ]);
  const [customKeyword, setCustomKeyword] = useState("");
  const [location, setLocation] = useState("Brussels");
  const [maxResults, setMaxResults] = useState("20");

  const togglePlatform = (platform: JobPlatform) => {
    setSelectedPlatforms((prev) =>
      prev.includes(platform)
        ? prev.filter((p) => p !== platform)
        : [...prev, platform]
    );
  };

  const toggleKeyword = (keyword: string) => {
    setSelectedKeywords((prev) =>
      prev.includes(keyword)
        ? prev.filter((k) => k !== keyword)
        : [...prev, keyword]
    );
  };

  const addCustomKeyword = () => {
    if (customKeyword.trim() && !selectedKeywords.includes(customKeyword.trim())) {
      setSelectedKeywords([...selectedKeywords, customKeyword.trim()]);
      setCustomKeyword("");
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onStartScrape({
      platforms: selectedPlatforms,
      keywords: selectedKeywords,
      location,
      maxResults: parseInt(maxResults, 10) || 20,
    });
  };

  const progress = progressData?.progress || 0;
  const statusText = progressData?.message || "Démarrage...";

  return (
    <Dialog open={open} onOpenChange={isLoading ? undefined : onOpenChange}>
      <DialogContent className="sm:max-w-3xl !max-h-[85vh] !overflow-hidden flex flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Briefcase className="h-5 w-5" />
            Find Jobs
          </DialogTitle>
          <DialogDescription>
            Sélectionnez les plateformes et mots-clés pour rechercher des offres.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="py-6 space-y-4">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{statusText}</span>
                <span className="font-medium">{Math.round(progress)}%</span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary transition-all duration-300 ease-out"
                  style={{ width: `${progress}%` }}
                />
              </div>
              {progressData && progressData.total > 0 && (
                <div className="text-xs text-center text-muted-foreground">
                  {progressData.current} / {progressData.total} plateformes
                </div>
              )}
            </div>

            <div className="text-center space-y-2">
              <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
              <p className="text-sm text-muted-foreground">
                Recherche: <strong>{selectedKeywords.slice(0, 3).join(", ")}{selectedKeywords.length > 3 ? "..." : ""}</strong>
              </p>
              {progressData?.platform && (
                <p className="text-xs text-primary font-medium">
                  {progressData.platform}
                  {progressData.jobsFound !== undefined && ` - ${progressData.jobsFound} offres`}
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                Ne fermez pas cette fenêtre.
              </p>
            </div>
          </div>
        ) : (
        <form onSubmit={handleSubmit} className="flex flex-col min-h-0 flex-1">
          {/* Two-column layout: platforms narrower, keywords wider */}
          <div className="grid grid-cols-1 sm:grid-cols-[2fr_3fr] gap-5 overflow-y-auto min-h-0 flex-1 pr-1">

            {/* Left: Platforms only */}
            <div className="flex flex-col">
              <div className="flex items-center justify-between mb-2.5">
                <Label className="text-sm font-semibold">Plateformes</Label>
                <button
                  type="button"
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                  onClick={() => {
                    if (selectedPlatforms.length === JOB_PLATFORMS.length) {
                      setSelectedPlatforms([]);
                    } else {
                      setSelectedPlatforms(JOB_PLATFORMS.map(p => p.id));
                    }
                  }}
                >
                  {selectedPlatforms.length === JOB_PLATFORMS.length ? "Aucun" : "Tout sélectionner"}
                </button>
              </div>
              <div className="flex flex-col gap-1.5 flex-1">
                {JOB_PLATFORMS.map((platform) => (
                  <div
                    key={platform.id}
                    className={`flex items-center gap-3 rounded-lg border px-3 flex-1 cursor-pointer transition-all select-none ${
                      selectedPlatforms.includes(platform.id)
                        ? "border-primary bg-primary/5 shadow-sm"
                        : "border-border hover:border-primary/40"
                    }`}
                    onClick={() => togglePlatform(platform.id)}
                  >
                    <div className={`h-4 w-4 shrink-0 rounded-sm border flex items-center justify-center transition-colors ${
                      selectedPlatforms.includes(platform.id)
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-muted-foreground/30"
                    }`}>
                      {selectedPlatforms.includes(platform.id) && <Check className="h-3 w-3" />}
                    </div>
                    <span className="font-medium text-sm">{platform.name}</span>
                    <span className="text-[11px] text-muted-foreground/60 ml-auto hidden sm:block">{platform.url}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Right: Keywords + Location + Limit */}
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-semibold">
                  Mots-clés
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    {selectedKeywords.length} sélectionné{selectedKeywords.length > 1 ? "s" : ""}
                  </span>
                </Label>
                <button
                  type="button"
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                  onClick={() => {
                    if (selectedKeywords.length === DEFAULT_KEYWORDS.length) {
                      setSelectedKeywords([]);
                    } else {
                      setSelectedKeywords([...DEFAULT_KEYWORDS]);
                    }
                  }}
                >
                  {selectedKeywords.length === DEFAULT_KEYWORDS.length ? "Aucun" : "Tout sélectionner"}
                </button>
              </div>

              <div className="flex flex-wrap gap-2">
                {DEFAULT_KEYWORDS.map((keyword) => (
                  <div
                    key={keyword}
                    className={`px-3.5 py-1.5 rounded-full text-sm cursor-pointer transition-all select-none ${
                      selectedKeywords.includes(keyword)
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground"
                    }`}
                    onClick={() => toggleKeyword(keyword)}
                  >
                    {keyword}
                  </div>
                ))}
              </div>

              {/* Custom keyword input */}
              <div className="flex gap-2 pt-2">
                <Input
                  placeholder="Ajouter un mot-clé personnalisé..."
                  value={customKeyword}
                  onChange={(e) => setCustomKeyword(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addCustomKeyword();
                    }
                  }}
                  className="h-9"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={addCustomKeyword}
                  className="shrink-0 h-9 px-4"
                >
                  Ajouter
                </Button>
              </div>

              {/* Location + Max results */}
              <div className="grid grid-cols-2 gap-3 mt-auto pt-2">
                <div className="space-y-2 rounded-lg border border-border p-3 bg-muted/20">
                  <Label htmlFor="location" className="flex items-center gap-2 text-sm font-semibold">
                    <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                    Localisation
                  </Label>
                  <Input
                    id="location"
                    placeholder="ex: Brussels"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    className="h-9"
                  />
                </div>
                <div className="space-y-2 rounded-lg border border-border p-3 bg-muted/20">
                  <Label htmlFor="maxResults" className="flex items-center gap-2 text-sm font-semibold">
                    <Hash className="h-3.5 w-3.5 text-muted-foreground" />
                    Limite
                  </Label>
                  <Select value={maxResults} onValueChange={setMaxResults}>
                    <SelectTrigger id="maxResults" className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="10">10 jobs</SelectItem>
                      <SelectItem value="20">20 jobs</SelectItem>
                      <SelectItem value="50">50 jobs</SelectItem>
                      <SelectItem value="100">100 jobs</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </div>

          {/* Footer - always visible */}
          <DialogFooter className="shrink-0 pt-4 border-t border-border mt-4 gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Annuler
            </Button>
            <Button
              type="submit"
              disabled={
                isLoading ||
                selectedPlatforms.length === 0 ||
                selectedKeywords.length === 0
              }
              className="min-w-[180px]"
            >
              <Search className="mr-2 h-4 w-4" />
              Lancer la recherche
              {selectedPlatforms.length > 0 && (
                <span className="ml-1.5 bg-primary-foreground/20 px-1.5 py-0.5 rounded text-xs">
                  {selectedPlatforms.length}
                </span>
              )}
            </Button>
          </DialogFooter>
        </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
