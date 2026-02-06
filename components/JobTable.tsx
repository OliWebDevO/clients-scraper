"use client";

import { useState } from "react";
import {
  ExternalLink,
  Calendar,
  Building2,
  MapPin,
  Briefcase,
  DollarSign,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import type { Job } from "@/lib/types";
import { formatRelativeTime } from "@/lib/utils";

interface JobTableProps {
  jobs: Job[];
  selectedIds: string[];
  onSelectionChange: (ids: string[]) => void;
}

const platformColors: Record<string, string> = {
  linkedin: "bg-blue-500/20 text-blue-400",
  indeed: "bg-purple-500/20 text-purple-400",
  ictjob: "bg-green-500/20 text-green-400",
  jobat: "bg-orange-500/20 text-orange-400",
  actiris: "bg-red-500/20 text-red-400",
  jobsora: "bg-cyan-500/20 text-cyan-400",
};

export function JobTable({
  jobs,
  selectedIds,
  onSelectionChange,
}: JobTableProps) {
  const [hoveredRow, setHoveredRow] = useState<string | null>(null);

  const toggleSelection = (id: string) => {
    if (selectedIds.includes(id)) {
      onSelectionChange(selectedIds.filter((i) => i !== id));
    } else {
      onSelectionChange([...selectedIds, id]);
    }
  };

  const toggleAll = () => {
    if (selectedIds.length === jobs.length) {
      onSelectionChange([]);
    } else {
      onSelectionChange(jobs.map((j) => j.id));
    }
  };

  if (jobs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-12 sm:py-16 px-4">
        <Briefcase className="mb-4 h-10 w-10 sm:h-12 sm:w-12 text-muted-foreground/30" />
        <p className="text-base sm:text-lg font-medium text-muted-foreground text-center">
          No jobs found
        </p>
        <p className="mt-1 text-sm text-muted-foreground/70 text-center">
          Start a scrape to find job opportunities
        </p>
      </div>
    );
  }

  return (
    <>
      {/* Mobile: Card View */}
      <div className="space-y-3 md:hidden w-full max-w-full overflow-hidden">
        {/* Select all */}
        <div className="flex items-center gap-2 px-1">
          <Checkbox
            checked={selectedIds.length === jobs.length && jobs.length > 0}
            onCheckedChange={toggleAll}
          />
          <span className="text-sm text-muted-foreground">
            Select all ({jobs.length})
          </span>
        </div>

        {/* Cards */}
        {jobs.map((job) => (
          <div
            key={job.id}
            className={`rounded-lg border border-border p-4 space-y-3 ${
              selectedIds.includes(job.id) ? "bg-primary/5 border-primary/30" : ""
            }`}
          >
            {/* Header: Checkbox + Title */}
            <div className="flex items-start gap-3">
              <Checkbox
                checked={selectedIds.includes(job.id)}
                onCheckedChange={() => toggleSelection(job.id)}
                className="mt-1"
              />
              <div className="flex-1 min-w-0">
                <h3 className="font-medium line-clamp-2">{job.title}</h3>
                {job.company && (
                  <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
                    <Building2 className="h-3 w-3 shrink-0" />
                    <span className="truncate">{job.company}</span>
                  </p>
                )}
              </div>
            </div>

            {/* Info Row */}
            <div className="flex flex-wrap items-center gap-1.5 text-xs overflow-hidden">
              {/* Location */}
              {job.location && (
                <span className="flex items-center gap-1 text-muted-foreground shrink-0 max-w-[45%]">
                  <MapPin className="h-3 w-3 shrink-0" />
                  <span className="truncate">{job.location}</span>
                </span>
              )}

              {/* Salary */}
              {job.salary && (
                <span className="flex items-center gap-1 text-green-400 shrink-0">
                  <DollarSign className="h-3 w-3 shrink-0" />
                  <span className="truncate max-w-[80px]">{job.salary}</span>
                </span>
              )}

              {/* Posted */}
              <span className="flex items-center gap-1 text-muted-foreground shrink-0">
                <Calendar className="h-3 w-3 shrink-0" />
                {job.posted_at ? formatRelativeTime(job.posted_at) : "Unknown"}
              </span>
            </div>

            {/* Source & Keywords */}
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                className={`font-normal text-xs ${
                  platformColors[job.source.toLowerCase()] ||
                  "bg-secondary text-secondary-foreground"
                }`}
              >
                {job.source}
              </Badge>
              {job.keywords_matched?.slice(0, 2).map((kw) => (
                <Badge key={kw} variant="outline" className="text-xs">
                  {kw}
                </Badge>
              ))}
            </div>

            {/* Action */}
            <div className="pt-2 border-t border-border">
              <a href={job.url} target="_blank" rel="noopener noreferrer" className="block">
                <Button variant="outline" size="sm" className="w-full">
                  <ExternalLink className="mr-2 h-4 w-4" />
                  View Job
                </Button>
              </a>
            </div>
          </div>
        ))}
      </div>

      {/* Desktop: Table View */}
      <div className="hidden md:block rounded-lg border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="w-12 px-4 py-3">
                  <Checkbox
                    checked={selectedIds.length === jobs.length && jobs.length > 0}
                    onCheckedChange={toggleAll}
                  />
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
                  Position
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
                  Company
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
                  Location
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
                  Salary
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
                  Source
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
                  Posted
                </th>
                <th className="w-16 px-4 py-3 text-right text-sm font-medium text-muted-foreground">
                  Link
                </th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => (
                <tr
                  key={job.id}
                  className={`border-b border-border transition-colors duration-150 ${
                    hoveredRow === job.id ? "bg-muted/30" : ""
                  } ${selectedIds.includes(job.id) ? "bg-primary/5" : ""}`}
                  onMouseEnter={() => setHoveredRow(job.id)}
                  onMouseLeave={() => setHoveredRow(null)}
                >
                  <td className="px-4 py-3">
                    <Checkbox
                      checked={selectedIds.includes(job.id)}
                      onCheckedChange={() => toggleSelection(job.id)}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col">
                      <span className="font-medium">{job.title}</span>
                      {job.keywords_matched && job.keywords_matched.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {job.keywords_matched.slice(0, 2).map((kw) => (
                            <Badge key={kw} variant="outline" className="text-xs">
                              {kw}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span>{job.company || "Unknown"}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 text-sm text-muted-foreground">
                      <MapPin className="h-3 w-3 shrink-0" />
                      <span className="max-w-[150px] truncate">
                        {job.location || "N/A"}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {job.salary ? (
                      <div className="flex items-center gap-1 text-sm">
                        <DollarSign className="h-3 w-3 text-green-400" />
                        <span>{job.salary}</span>
                      </div>
                    ) : (
                      <span className="text-sm text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Badge
                      className={`font-normal ${
                        platformColors[job.source.toLowerCase()] ||
                        "bg-secondary text-secondary-foreground"
                      }`}
                    >
                      {job.source}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 text-sm text-muted-foreground">
                      <Calendar className="h-3 w-3" />
                      {job.posted_at ? formatRelativeTime(job.posted_at) : "Unknown"}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <a href={job.url} target="_blank" rel="noopener noreferrer">
                      <Button variant="ghost" size="icon" title="View job">
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
