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
import { Search, X, Calendar, Tag, Eye, ThumbsUp } from "lucide-react";
import { JOB_PLATFORMS } from "@/lib/types";

interface JobFilterPanelProps {
  searchTerm: string;
  onSearchChange: (value: string) => void;
  filters: {
    source?: string;
    keyword?: string;
    dateRange?: string;
    investigated?: string;
    viable?: string;
  };
  onFilterChange: (key: string, value: string) => void;
  onClearFilters: () => void;
  keywords: string[];
}

export function JobFilterPanel({
  searchTerm,
  onSearchChange,
  filters,
  onFilterChange,
  onClearFilters,
  keywords,
}: JobFilterPanelProps) {
  const hasActiveFilters =
    searchTerm || filters.source || filters.keyword || filters.dateRange ||
    filters.investigated || (filters.viable && filters.viable !== "not-red");

  return (
    <div className="space-y-3">
      {/* Search - full width on mobile */}
      <div className="relative w-full sm:max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search jobs..."
          value={searchTerm}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={filters.investigated || ""}
          onValueChange={(v) => onFilterChange("investigated", v)}
        >
          <SelectTrigger className="flex-1 basis-[calc(50%-0.25rem)] sm:flex-none sm:basis-auto sm:w-[130px]">
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
          <SelectTrigger className="flex-1 basis-[calc(50%-0.25rem)] sm:flex-none sm:basis-auto sm:w-[150px]">
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
          value={filters.source || ""}
          onValueChange={(v) => onFilterChange("source", v)}
        >
          <SelectTrigger className="flex-1 basis-[calc(50%-0.25rem)] sm:flex-none sm:basis-auto sm:w-[140px]">
            <SelectValue placeholder="Source" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All sources</SelectItem>
            {JOB_PLATFORMS.map((platform) => (
              <SelectItem key={platform.id} value={platform.id}>
                {platform.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={filters.keyword || ""}
          onValueChange={(v) => onFilterChange("keyword", v)}
        >
          <SelectTrigger className="flex-1 basis-[calc(50%-0.25rem)] sm:flex-none sm:basis-auto sm:w-[180px]">
            <Tag className="mr-2 h-4 w-4 text-muted-foreground" />
            <SelectValue placeholder="Keyword" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All keywords</SelectItem>
            {keywords.map((kw) => (
              <SelectItem key={kw} value={kw}>
                {kw}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={filters.dateRange || ""}
          onValueChange={(v) => onFilterChange("dateRange", v)}
        >
          <SelectTrigger className="flex-1 basis-[calc(50%-0.25rem)] sm:flex-none sm:basis-auto sm:w-[140px]">
            <Calendar className="mr-2 h-4 w-4 text-muted-foreground" />
            <SelectValue placeholder="Date" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any time</SelectItem>
            <SelectItem value="1">Last 24h</SelectItem>
            <SelectItem value="7">Last 7 days</SelectItem>
            <SelectItem value="30">Last 30 days</SelectItem>
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
