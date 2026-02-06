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
import { Loader2, MapPin, Star, Search, Hash } from "lucide-react";

export interface ProgressUpdate {
  current: number;
  total: number;
  progress: number;
  message: string;
  businessName?: string;
  phase: "init" | "searching" | "extracting" | "analyzing" | "done";
}

interface ScrapeBusinessModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onStartScrape: (config: BusinessScrapeConfig) => void;
  isLoading: boolean;
  progressData?: ProgressUpdate | null;
}

export interface BusinessScrapeConfig {
  location: string;
  radius: number;
  minRating: number;
  categories: string[];
  maxResults: number;
}

// Catégories suggérées pour les petits commerces
const SUGGESTED_CATEGORIES = [
  "Restaurants",
  "Cafés",
  "Boulangeries",
  "Coiffeurs",
  "Salons de beauté",
  "Médecins",
  "Dentistes",
  "Pharmacies",
  "Plombiers",
  "Électriciens",
  "Garages auto",
  "Fleuristes",
  "Boutiques vêtements",
  "Épiceries",
  "Fitness",
  "Photographes",
  "Traiteurs",
  "Pressing",
  "Agences immobilières",
  "Comptables",
];

export function ScrapeBusinessModal({
  open,
  onOpenChange,
  onStartScrape,
  isLoading,
  progressData,
}: ScrapeBusinessModalProps) {
  const [location, setLocation] = useState("Brussels");
  const [radius, setRadius] = useState("10");
  const [minRating, setMinRating] = useState("3");
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [customCategory, setCustomCategory] = useState("");
  const [maxResults, setMaxResults] = useState("20");

  // Use real progress from progressData prop
  const progress = progressData?.progress || 0;
  const statusText = progressData?.message || "Démarrage...";

  const toggleCategory = (cat: string) => {
    setSelectedCategories((prev) =>
      prev.includes(cat)
        ? prev.filter((c) => c !== cat)
        : [...prev, cat]
    );
  };

  const addCustomCategory = () => {
    if (customCategory.trim() && !selectedCategories.includes(customCategory.trim())) {
      setSelectedCategories([...selectedCategories, customCategory.trim()]);
      setCustomCategory("");
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Si aucune catégorie sélectionnée, utiliser quelques catégories par défaut
    const categories = selectedCategories.length > 0
      ? selectedCategories
      : ["Restaurants", "Commerces", "Services"];

    onStartScrape({
      location,
      radius: parseInt(radius, 10),
      minRating: parseFloat(minRating),
      categories,
      maxResults: parseInt(maxResults, 10) || 10,
    });
  };

  return (
    <Dialog open={open} onOpenChange={isLoading ? undefined : onOpenChange}>
      <DialogContent className="sm:max-w-3xl !max-h-[85vh] !overflow-hidden flex flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5" />
            Find Clients
          </DialogTitle>
          <DialogDescription>
            Sélectionnez les catégories et paramètres pour rechercher des clients potentiels.
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
                  {progressData.current} / {progressData.total} trouvés
                </div>
              )}
            </div>

            <div className="text-center space-y-2">
              <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
              <p className="text-sm text-muted-foreground">
                Recherche: <strong>{selectedCategories.slice(0, 3).join(", ")}{selectedCategories.length > 3 ? "..." : ""}</strong> à <strong>{location}</strong>
              </p>
              {progressData?.businessName && (
                <p className="text-xs text-primary font-medium">
                  {progressData.businessName}
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                Ne fermez pas cette fenêtre.
              </p>
            </div>
          </div>
        ) : (
        <form onSubmit={handleSubmit} className="flex flex-col min-h-0 flex-1">
          {/* Two-column layout: settings left, categories right */}
          <div className="grid grid-cols-1 sm:grid-cols-[2fr_3fr] gap-5 min-h-0 flex-1 pr-1">

            {/* Left: Settings */}
            <div className="flex flex-col gap-3">
              <div className="space-y-2 rounded-lg border border-border p-3 bg-muted/20">
                <Label htmlFor="location" className="flex items-center gap-2 text-sm font-semibold">
                  <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                  Localisation
                </Label>
                <Input
                  id="location"
                  placeholder="ex: Brussels, Belgium"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  required
                  className="h-9"
                />
              </div>

              <div className="space-y-2 rounded-lg border border-border p-3 bg-muted/20">
                <Label htmlFor="radius" className="text-sm font-semibold">Rayon</Label>
                <Select value={radius} onValueChange={setRadius}>
                  <SelectTrigger id="radius" className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="5">5 km</SelectItem>
                    <SelectItem value="10">10 km</SelectItem>
                    <SelectItem value="20">20 km</SelectItem>
                    <SelectItem value="50">50 km</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2 rounded-lg border border-border p-3 bg-muted/20">
                <Label htmlFor="minRating" className="flex items-center gap-2 text-sm font-semibold">
                  <Star className="h-3.5 w-3.5 text-muted-foreground" />
                  Note minimum
                </Label>
                <Select value={minRating} onValueChange={setMinRating}>
                  <SelectTrigger id="minRating" className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">Toutes</SelectItem>
                    <SelectItem value="3">3+ stars</SelectItem>
                    <SelectItem value="3.5">3.5+ stars</SelectItem>
                    <SelectItem value="4">4+ stars</SelectItem>
                    <SelectItem value="4.5">4.5+ stars</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2 rounded-lg border border-border p-3 bg-muted/20">
                <Label htmlFor="maxResults" className="flex items-center gap-2 text-sm font-semibold">
                  <Hash className="h-3.5 w-3.5 text-muted-foreground" />
                  Limite de résultats
                </Label>
                <Select value={maxResults} onValueChange={setMaxResults}>
                  <SelectTrigger id="maxResults" className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="10">10 clients</SelectItem>
                    <SelectItem value="20">20 clients</SelectItem>
                    <SelectItem value="50">50 clients</SelectItem>
                    <SelectItem value="100">100 clients</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Right: Categories as chips + custom input */}
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-semibold">
                  Catégories
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    {selectedCategories.length} sélectionnée{selectedCategories.length > 1 ? "s" : ""}
                  </span>
                </Label>
                <button
                  type="button"
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                  onClick={() => {
                    if (selectedCategories.length === SUGGESTED_CATEGORIES.length) {
                      setSelectedCategories([]);
                    } else {
                      setSelectedCategories([...SUGGESTED_CATEGORIES]);
                    }
                  }}
                >
                  {selectedCategories.length === SUGGESTED_CATEGORIES.length ? "Aucun" : "Tout sélectionner"}
                </button>
              </div>

              <div className="flex flex-wrap gap-2">
                {SUGGESTED_CATEGORIES.map((cat) => (
                  <div
                    key={cat}
                    className={`px-3.5 py-1.5 rounded-full text-sm cursor-pointer transition-all select-none ${
                      selectedCategories.includes(cat)
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground"
                    }`}
                    onClick={() => toggleCategory(cat)}
                  >
                    {cat}
                  </div>
                ))}
              </div>

              {/* Custom category input */}
              <div className="flex gap-2 mt-auto pt-2">
                <Input
                  placeholder="Ajouter une catégorie personnalisée..."
                  value={customCategory}
                  onChange={(e) => setCustomCategory(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addCustomCategory();
                    }
                  }}
                  className="h-9"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={addCustomCategory}
                  className="shrink-0 h-9 px-4"
                >
                  Ajouter
                </Button>
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
              disabled={isLoading || !location}
              className="min-w-[180px]"
            >
              <Search className="mr-2 h-4 w-4" />
              Lancer la recherche
              {selectedCategories.length > 0 && (
                <span className="ml-1.5 bg-primary-foreground/20 px-1.5 py-0.5 rounded text-xs">
                  {selectedCategories.length}
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
