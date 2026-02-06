"use client";

import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Search, X, Filter, Star, Eye, ThumbsUp } from "lucide-react";

interface FilterPanelProps {
  searchTerm: string;
  onSearchChange: (value: string) => void;
  filters: {
    investigated?: string;
    viable?: string;
    minRating?: string;
    category?: string;
    hasWebsite?: string;
  };
  onFilterChange: (key: string, value: string) => void;
  onClearFilters: () => void;
  categories: string[];
}

export function FilterPanel({
  searchTerm,
  onSearchChange,
  filters,
  onFilterChange,
  onClearFilters,
  categories,
}: FilterPanelProps) {
  const hasActiveFilters =
    searchTerm ||
    filters.investigated ||
    (filters.viable && filters.viable !== "not-red") ||
    filters.minRating ||
    filters.category ||
    filters.hasWebsite;

  return (
    <div className="space-y-3">
      {/* Search - full width on mobile */}
      <div className="relative w-full sm:max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search businesses..."
          value={searchTerm}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Filters - scrollable on mobile */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 sm:pb-0 sm:flex-wrap">
        <Select
          value={filters.investigated || ""}
          onValueChange={(v) => onFilterChange("investigated", v)}
        >
          <SelectTrigger className="w-[110px] sm:w-[130px] shrink-0">
            <Eye className="mr-2 h-4 w-4 text-muted-foreground" />
            <SelectValue placeholder="Statut" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous</SelectItem>
            <SelectItem value="no">Non vu</SelectItem>
            <SelectItem value="yes">Vu</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={filters.viable || "not-red"}
          onValueChange={(v) => onFilterChange("viable", v)}
        >
          <SelectTrigger className="w-[130px] sm:w-[150px] shrink-0">
            <ThumbsUp className="mr-2 h-4 w-4 text-muted-foreground" />
            <SelectValue placeholder="Viable" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="not-red">Viable / N/A</SelectItem>
            <SelectItem value="all">Tous</SelectItem>
            <SelectItem value="yes">Viable</SelectItem>
            <SelectItem value="no">Non viable</SelectItem>
            <SelectItem value="na">Non décidé</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={filters.minRating || ""}
          onValueChange={(v) => onFilterChange("minRating", v)}
        >
          <SelectTrigger className="w-[120px] sm:w-[140px] shrink-0">
            <Star className="mr-2 h-4 w-4 text-muted-foreground" />
            <SelectValue placeholder="Rating" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All ratings</SelectItem>
            <SelectItem value="3">3+ stars</SelectItem>
            <SelectItem value="3.5">3.5+ stars</SelectItem>
            <SelectItem value="4">4+ stars</SelectItem>
            <SelectItem value="4.5">4.5+ stars</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={filters.category || ""}
          onValueChange={(v) => onFilterChange("category", v)}
        >
          <SelectTrigger className="w-[140px] sm:w-[160px] shrink-0">
            <Filter className="mr-2 h-4 w-4 text-muted-foreground" />
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {categories.map((cat) => (
              <SelectItem key={cat} value={cat}>
                {cat}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={filters.hasWebsite || ""}
          onValueChange={(v) => onFilterChange("hasWebsite", v)}
        >
          <SelectTrigger className="w-[130px] sm:w-[150px] shrink-0">
            <SelectValue placeholder="Website" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="no">No website</SelectItem>
            <SelectItem value="yes">Has website</SelectItem>
          </SelectContent>
        </Select>

        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onClearFilters}
            className="gap-1 shrink-0"
          >
            <X className="h-4 w-4" />
            <span className="hidden sm:inline">Clear</span>
          </Button>
        )}
      </div>
    </div>
  );
}
