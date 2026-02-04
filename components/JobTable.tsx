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
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-16">
        <Briefcase className="mb-4 h-12 w-12 text-muted-foreground/30" />
        <p className="text-lg font-medium text-muted-foreground">
          No jobs found
        </p>
        <p className="mt-1 text-sm text-muted-foreground/70">
          Start a scrape to find job opportunities
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="w-12 px-4 py-3">
                <Checkbox
                  checked={
                    selectedIds.length === jobs.length && jobs.length > 0
                  }
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
                          <Badge
                            key={kw}
                            variant="outline"
                            className="text-xs"
                          >
                            {kw}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-muted-foreground" />
                    <span>{job.company || "Unknown"}</span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1 text-sm text-muted-foreground">
                    <MapPin className="h-3 w-3" />
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
                    {job.posted_at
                      ? formatRelativeTime(job.posted_at)
                      : "Unknown"}
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
  );
}
