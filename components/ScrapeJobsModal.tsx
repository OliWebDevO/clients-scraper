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
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Briefcase, MapPin, Search } from "lucide-react";
import { JOB_PLATFORMS, DEFAULT_KEYWORDS, JobPlatform } from "@/lib/types";

interface ScrapeJobsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onStartScrape: (config: JobScrapeConfig) => void;
  isLoading: boolean;
}

export interface JobScrapeConfig {
  platforms: JobPlatform[];
  keywords: string[];
  location: string;
}

export function ScrapeJobsModal({
  open,
  onOpenChange,
  onStartScrape,
  isLoading,
}: ScrapeJobsModalProps) {
  const [selectedPlatforms, setSelectedPlatforms] = useState<JobPlatform[]>([
    "ictjob",
    "indeed",
    "jobat",
  ]);
  const [selectedKeywords, setSelectedKeywords] = useState<string[]>([
    "web developer",
    "front-end developer",
    "react developer",
  ]);
  const [customKeyword, setCustomKeyword] = useState("");
  const [location, setLocation] = useState("Belgium");

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
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Briefcase className="h-5 w-5" />
            Scrape Jobs
          </DialogTitle>
          <DialogDescription>
            Configure which platforms and keywords to search for job
            opportunities.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Platforms */}
          <div className="space-y-3">
            <Label>Platforms</Label>
            <div className="grid grid-cols-2 gap-2">
              {JOB_PLATFORMS.map((platform) => (
                <div
                  key={platform.id}
                  className={`flex items-center gap-3 rounded-md border p-3 cursor-pointer transition-colors ${
                    selectedPlatforms.includes(platform.id)
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/50"
                  }`}
                  onClick={() => togglePlatform(platform.id)}
                >
                  <Checkbox
                    checked={selectedPlatforms.includes(platform.id)}
                    onClick={(e) => e.stopPropagation()}
                    onCheckedChange={() => togglePlatform(platform.id)}
                  />
                  <div>
                    <p className="font-medium text-sm">{platform.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {platform.url}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Keywords */}
          <div className="space-y-3">
            <Label>Keywords</Label>
            <div className="flex flex-wrap gap-2">
              {DEFAULT_KEYWORDS.map((keyword) => (
                <div
                  key={keyword}
                  className={`px-3 py-1.5 rounded-full text-sm cursor-pointer transition-colors ${
                    selectedKeywords.includes(keyword)
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:bg-muted/80"
                  }`}
                  onClick={() => toggleKeyword(keyword)}
                >
                  {keyword}
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                placeholder="Add custom keyword..."
                value={customKeyword}
                onChange={(e) => setCustomKeyword(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addCustomKeyword();
                  }
                }}
              />
              <Button
                type="button"
                variant="outline"
                onClick={addCustomKeyword}
              >
                Add
              </Button>
            </div>
          </div>

          {/* Location */}
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
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={
                isLoading ||
                selectedPlatforms.length === 0 ||
                selectedKeywords.length === 0
              }
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Scraping...
                </>
              ) : (
                <>
                  <Search className="mr-2 h-4 w-4" />
                  Start Scrape
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
