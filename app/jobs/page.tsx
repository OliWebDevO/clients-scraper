"use client";

import { useEffect, useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { JobTable } from "@/components/JobTable";
import { JobFilterPanel } from "@/components/JobFilterPanel";
import { ScrapeJobsModal, JobScrapeConfig } from "@/components/ScrapeJobsModal";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
import type { Job } from "@/lib/types";
import { exportToCSV } from "@/lib/utils";
import { Play, Download, RefreshCw, Briefcase } from "lucide-react";

export default function JobsPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [scrapeModalOpen, setScrapeModalOpen] = useState(false);
  const [isScraping, setIsScraping] = useState(false);

  // Filters
  const [searchTerm, setSearchTerm] = useState("");
  const [filters, setFilters] = useState({
    source: "",
    keyword: "",
    dateRange: "",
  });

  const { toast } = useToast();

  const fetchJobs = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("jobs")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      toast({
        title: "Error",
        description: "Failed to fetch jobs",
        variant: "destructive",
      });
    } else {
      setJobs(data || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchJobs();
  }, []);

  // Get unique keywords
  const allKeywords = useMemo(() => {
    const kws = new Set<string>();
    jobs.forEach((job) => {
      job.keywords_matched?.forEach((kw) => kws.add(kw));
    });
    return Array.from(kws).sort();
  }, [jobs]);

  // Filter jobs
  const filteredJobs = useMemo(() => {
    return jobs.filter((job) => {
      // Search
      if (searchTerm) {
        const search = searchTerm.toLowerCase();
        if (
          !job.title.toLowerCase().includes(search) &&
          !job.company?.toLowerCase().includes(search) &&
          !job.location?.toLowerCase().includes(search)
        ) {
          return false;
        }
      }

      // Source filter
      if (filters.source && filters.source !== "all") {
        if (job.source.toLowerCase() !== filters.source.toLowerCase()) {
          return false;
        }
      }

      // Keyword filter
      if (filters.keyword && filters.keyword !== "all") {
        if (!job.keywords_matched?.includes(filters.keyword)) {
          return false;
        }
      }

      // Date range filter
      if (filters.dateRange && filters.dateRange !== "all") {
        const days = parseInt(filters.dateRange, 10);
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - days);
        const jobDate = job.posted_at ? new Date(job.posted_at) : new Date(job.created_at);
        if (jobDate < cutoff) {
          return false;
        }
      }

      return true;
    });
  }, [jobs, searchTerm, filters]);

  const handleStartScrape = async (config: JobScrapeConfig) => {
    setIsScraping(true);
    try {
      const response = await fetch("/api/scrape/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });

      const result = await response.json();

      if (result.success) {
        toast({
          title: "Scrape Complete",
          description: `Found ${result.items_found} jobs`,
          variant: "success",
        });
        setScrapeModalOpen(false);
        fetchJobs();
      } else {
        throw new Error(result.error || "Scrape failed");
      }
    } catch (error) {
      toast({
        title: "Error",
        description:
          error instanceof Error ? error.message : "Failed to start scrape",
        variant: "destructive",
      });
    } finally {
      setIsScraping(false);
    }
  };

  const handleExport = () => {
    const dataToExport =
      selectedIds.length > 0
        ? filteredJobs.filter((j) => selectedIds.includes(j.id))
        : filteredJobs;

    exportToCSV(
      dataToExport.map((j) => ({
        title: j.title,
        company: j.company || "",
        location: j.location || "",
        salary: j.salary || "",
        source: j.source,
        url: j.url,
        posted_at: j.posted_at || "",
        keywords: j.keywords_matched?.join(", ") || "",
      })),
      `jobs-${new Date().toISOString().split("T")[0]}`
    );

    toast({
      title: "Export Complete",
      description: `Exported ${dataToExport.length} jobs to CSV`,
    });
  };

  const handleClearFilters = () => {
    setSearchTerm("");
    setFilters({ source: "", keyword: "", dateRange: "" });
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Jobs</h1>
          <p className="mt-1 text-sm sm:text-base text-muted-foreground">
            {filteredJobs.length} job opportunities found
          </p>
        </div>
        <div className="flex flex-wrap gap-2 sm:gap-3">
          <Button variant="outline" size="sm" onClick={fetchJobs} disabled={loading} className="flex-1 sm:flex-none">
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            <span className="hidden xs:inline">Refresh</span>
          </Button>
          <Button variant="outline" size="sm" onClick={handleExport} className="flex-1 sm:flex-none">
            <Download className="mr-2 h-4 w-4" />
            <span className="hidden xs:inline">Export</span>
            {selectedIds.length > 0 && ` (${selectedIds.length})`}
          </Button>
          <Button size="sm" onClick={() => setScrapeModalOpen(true)} className="w-full sm:w-auto">
            <Play className="mr-2 h-4 w-4" />
            Scrape Jobs
          </Button>
        </div>
      </div>

      {/* Filters */}
      <JobFilterPanel
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        filters={filters}
        onFilterChange={(key, value) =>
          setFilters((prev) => ({ ...prev, [key]: value }))
        }
        onClearFilters={handleClearFilters}
        keywords={allKeywords}
      />

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <JobTable
          jobs={filteredJobs}
          selectedIds={selectedIds}
          onSelectionChange={setSelectedIds}
        />
      )}

      {/* Modal */}
      <ScrapeJobsModal
        open={scrapeModalOpen}
        onOpenChange={setScrapeModalOpen}
        onStartScrape={handleStartScrape}
        isLoading={isScraping}
      />
    </div>
  );
}
