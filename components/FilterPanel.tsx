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
import { Search, X, Filter, Star } from "lucide-react";

interface FilterPanelProps {
  searchTerm: string;
  onSearchChange: (value: string) => void;
  filters: {
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
    filters.minRating ||
    filters.category ||
    filters.hasWebsite;

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="relative flex-1 min-w-[200px] max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search businesses..."
          value={searchTerm}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-9"
        />
      </div>

      <Select
        value={filters.minRating || ""}
        onValueChange={(v) => onFilterChange("minRating", v)}
      >
        <SelectTrigger className="w-[140px]">
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
        <SelectTrigger className="w-[160px]">
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
        <SelectTrigger className="w-[150px]">
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
          className="gap-1"
        >
          <X className="h-4 w-4" />
          Clear
        </Button>
      )}
    </div>
  );
}
