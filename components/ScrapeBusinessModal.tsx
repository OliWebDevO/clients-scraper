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
import { Loader2, MapPin, Star, Layers } from "lucide-react";

interface ScrapeBusinessModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onStartScrape: (config: BusinessScrapeConfig) => void;
  isLoading: boolean;
}

export interface BusinessScrapeConfig {
  location: string;
  radius: number;
  minRating: number;
  categories: string[];
}

const CATEGORIES = [
  "All Categories",
  "Restaurants",
  "Retail",
  "Beauty & Spa",
  "Fitness",
  "Automotive",
  "Home Services",
  "Professional Services",
  "Healthcare",
  "Real Estate",
];

export function ScrapeBusinessModal({
  open,
  onOpenChange,
  onStartScrape,
  isLoading,
}: ScrapeBusinessModalProps) {
  const [location, setLocation] = useState("");
  const [radius, setRadius] = useState("10");
  const [minRating, setMinRating] = useState("3");
  const [category, setCategory] = useState("All Categories");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onStartScrape({
      location,
      radius: parseInt(radius, 10),
      minRating: parseFloat(minRating),
      categories: category === "All Categories" ? [] : [category],
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5" />
            Scrape Businesses
          </DialogTitle>
          <DialogDescription>
            Configure your Google Maps scrape to find potential clients without
            websites.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="location" className="flex items-center gap-2">
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

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="radius">Radius (km)</Label>
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
              <Label
                htmlFor="minRating"
                className="flex items-center gap-2"
              >
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

          <div className="space-y-2">
            <Label htmlFor="category" className="flex items-center gap-2">
              <Layers className="h-4 w-4 text-muted-foreground" />
              Category
            </Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger id="category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((cat) => (
                  <SelectItem key={cat} value={cat}>
                    {cat}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading || !location}>
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Scraping...
                </>
              ) : (
                "Start Scrape"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
