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
import { Badge } from "@/components/ui/badge";
import { Loader2, MapPin, Star, X, Plus } from "lucide-react";

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
  const [location, setLocation] = useState("");
  const [radius, setRadius] = useState("10");
  const [minRating, setMinRating] = useState("0");
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [customCategory, setCustomCategory] = useState("");

  // Use real progress from progressData prop
  const progress = progressData?.progress || 0;
  const statusText = progressData?.message || "Démarrage...";

  const addCategory = (cat: string) => {
    if (cat && !selectedCategories.includes(cat)) {
      setSelectedCategories([...selectedCategories, cat]);
    }
  };

  const removeCategory = (cat: string) => {
    setSelectedCategories(selectedCategories.filter((c) => c !== cat));
  };

  const addCustomCategory = () => {
    if (customCategory.trim()) {
      addCategory(customCategory.trim());
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
    });
  };

  return (
    <Dialog open={open} onOpenChange={isLoading ? undefined : onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5" />
            Scrape Businesses
          </DialogTitle>
          <DialogDescription>
            Find potential clients without websites or with outdated sites.
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
                Recherche: <strong>{selectedCategories.join(", ") || "Commerces"}</strong> à <strong>{location}</strong>
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
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Location */}
            <div className="space-y-2">
              <Label htmlFor="location" className="flex items-center gap-2 text-sm">
                <MapPin className="h-4 w-4 text-muted-foreground" />
                Location
              </Label>
              <Input
                id="location"
                placeholder="e.g., Brussels, Belgium"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                required
              />
            </div>

            {/* Categories */}
            <div className="space-y-2">
              <Label className="text-sm">What are you looking for?</Label>

              {/* Selected categories */}
              {selectedCategories.length > 0 && (
                <div className="flex flex-wrap gap-1.5 p-2 bg-muted/50 rounded-md">
                  {selectedCategories.map((cat) => (
                    <Badge key={cat} variant="secondary" className="gap-1 text-xs">
                      {cat}
                      <button type="button" onClick={() => removeCategory(cat)}>
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}

              {/* Custom input */}
              <div className="flex gap-2">
                <Input
                  placeholder="Add custom search term..."
                  value={customCategory}
                  onChange={(e) => setCustomCategory(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addCustomCategory();
                    }
                  }}
                  className="text-sm"
                />
                <Button type="button" size="sm" variant="outline" onClick={addCustomCategory}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>

              {/* Suggested categories */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Suggestions:</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 text-xs px-2"
                    onClick={() => {
                      if (selectedCategories.length === SUGGESTED_CATEGORIES.length) {
                        setSelectedCategories([]);
                      } else {
                        setSelectedCategories([...SUGGESTED_CATEGORIES]);
                      }
                    }}
                  >
                    {selectedCategories.length === SUGGESTED_CATEGORIES.length ? "Tout désélectionner" : "Tout sélectionner"}
                  </Button>
                </div>
                <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                  {SUGGESTED_CATEGORIES.filter(cat => !selectedCategories.includes(cat)).map((cat) => (
                    <Badge
                      key={cat}
                      variant="outline"
                      className="cursor-pointer text-xs hover:bg-primary hover:text-primary-foreground transition-colors"
                      onClick={() => addCategory(cat)}
                    >
                      + {cat}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>

            {/* Radius and Rating */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="radius" className="text-sm">Radius (km)</Label>
                <Select value={radius} onValueChange={setRadius}>
                  <SelectTrigger id="radius">
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

              <div className="space-y-2">
                <Label htmlFor="minRating" className="flex items-center gap-2 text-sm">
                  <Star className="h-4 w-4 text-muted-foreground" />
                  Min Rating
                </Label>
                <Select value={minRating} onValueChange={setMinRating}>
                  <SelectTrigger id="minRating">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">Any rating</SelectItem>
                    <SelectItem value="3">3+ stars</SelectItem>
                    <SelectItem value="3.5">3.5+ stars</SelectItem>
                    <SelectItem value="4">4+ stars</SelectItem>
                    <SelectItem value="4.5">4.5+ stars</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onOpenChange(false)}
                className="w-full sm:w-auto"
              >
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={!location} className="w-full sm:w-auto">
                Start Scrape
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
