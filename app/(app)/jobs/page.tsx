"use client";

import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { JobTable } from "@/components/JobTable";
import { JobFilterPanel } from "@/components/JobFilterPanel";
import { ScrapeJobsModal, JobScrapeConfig, JobProgressUpdate } from "@/components/ScrapeJobsModal";
import { DraftModal } from "@/components/DraftModal";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
import type { Job, DraftProgressUpdate } from "@/lib/types";
import { exportToCSV } from "@/lib/utils";
import { Play, Download, RefreshCw, Briefcase } from "lucide-react";

/** Escape special characters in a search string for use inside Supabase `.or()` / `.ilike()` */
function sanitizeSearch(raw: string): string {
  return raw.replace(/[%_\\]/g, (c) => `\\${c}`);
}

export default function JobsPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [scrapeModalOpen, setScrapeModalOpen] = useState(false);
  const [isScraping, setIsScraping] = useState(false);
  const [scrapeProgress, setScrapeProgress] = useState<JobProgressUpdate | null>(null);

  // Draft states
  const [draftModalOpen, setDraftModalOpen] = useState(false);
  const [draftJob, setDraftJob] = useState<Job | null>(null);
  const [isDraftGenerating, setIsDraftGenerating] = useState(false);
  const [draftProgress, setDraftProgress] = useState<DraftProgressUpdate | null>(null);
  const [draftDownloadUrl, setDraftDownloadUrl] = useState<string | null>(null);
  const [draftDownloadFilename, setDraftDownloadFilename] = useState<string | null>(null);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [draftStatuses, setDraftStatuses] = useState<Record<string, "none" | "generating" | "done">>({});

  // Filters
  const [searchTerm, setSearchTerm] = useState("");
  const [filters, setFilters] = useState({
    source: "",
    keyword: "",
    dateRange: "",
    investigated: "",
    viable: "not-red",
  });

  const { toast } = useToast();

  const PAGE_SIZE = 50;

  // Debounced search term for the actual query
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      setDebouncedSearch(searchTerm);
    }, 350);
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, [searchTerm]);

  const fetchJobs = useCallback(async (p: number) => {
    setLoading(true);
    const from = p * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    let query = supabase
      .from("jobs")
      .select("id,title,company,location,salary,description,url,source,keywords_matched,posted_at,investigated,viable,created_at", { count: "exact" });

    // --- Server-side filters ---

    // Search
    if (debouncedSearch) {
      const s = sanitizeSearch(debouncedSearch);
      query = query.or(`title.ilike.%${s}%,company.ilike.%${s}%,location.ilike.%${s}%`);
    }

    // Source
    if (filters.source && filters.source !== "all") {
      query = query.ilike("source", filters.source);
    }

    // Keyword (stored in keywords_matched array)
    if (filters.keyword && filters.keyword !== "all") {
      query = query.contains("keywords_matched", [filters.keyword]);
    }

    // Date range
    if (filters.dateRange && filters.dateRange !== "all") {
      const days = parseInt(filters.dateRange, 10);
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - days);
      const cutoffStr = cutoff.toISOString();
      query = query.or(`posted_at.gte.${cutoffStr},and(posted_at.is.null,created_at.gte.${cutoffStr})`);
    }

    // Investigated
    if (filters.investigated && filters.investigated !== "all") {
      query = query.eq("investigated", filters.investigated === "yes");
    }

    // Viable
    if (filters.viable) {
      if (filters.viable === "not-red") {
        query = query.or("viable.eq.true,viable.is.null");
      } else if (filters.viable === "yes") {
        query = query.eq("viable", true);
      } else if (filters.viable === "no") {
        query = query.eq("viable", false);
      } else if (filters.viable === "na") {
        query = query.is("viable", null);
      }
    }

    // Order & paginate
    query = query
      .order("created_at", { ascending: false })
      .range(from, to);

    const { data, error, count } = await query;

    if (error) {
      toast({
        title: "Error",
        description: "Failed to fetch jobs",
        variant: "destructive",
      });
    } else {
      setJobs(data || []);
      setTotalCount(count || 0);
    }
    setLoading(false);
  }, [debouncedSearch, filters, toast]);

  const fetchDraftStatuses = useCallback(async (jobIds: string[]) => {
    if (jobIds.length === 0) return;
    try {
      const { data } = await supabase
        .from("job_drafts")
        .select("job_id, status")
        .in("job_id", jobIds);

      if (data) {
        const statuses: Record<string, "none" | "generating" | "done"> = {};
        data.forEach((d: { job_id: string; status: string }) => {
          statuses[d.job_id] = d.status === "completed" ? "done" : "none";
        });
        setDraftStatuses(statuses);
      }
    } catch {
      // job_drafts table may not exist yet
    }
  }, []);

  // Reset page to 0 when any filter changes
  useEffect(() => {
    setPage(0);
  }, [debouncedSearch, filters]);

  // Fetch jobs whenever page, debounced search, or filters change
  useEffect(() => {
    fetchJobs(page);
  }, [page, fetchJobs]);

  useEffect(() => {
    fetchDraftStatuses(jobs.map(j => j.id));
  }, [jobs, fetchDraftStatuses]);

  // Get unique keywords from current page (for the dropdown)
  const allKeywords = useMemo(() => {
    const kws = new Set<string>();
    jobs.forEach((job) => {
      job.keywords_matched?.forEach((kw) => kws.add(kw));
    });
    return Array.from(kws).sort();
  }, [jobs]);

  const handleStartScrape = async (config: JobScrapeConfig) => {
    setIsScraping(true);
    setScrapeProgress({ current: 0, total: config.platforms.length, progress: 0, message: "Démarrage...", phase: "init" });

    try {
      const response = await fetch("/api/scrape/jobs/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });

      if (!response.ok) {
        throw new Error("Erreur de connexion au serveur");
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error("Impossible de lire le stream");
      }

      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() || "";

        for (const chunk of lines) {
          if (!chunk.trim()) continue;

          const eventMatch = chunk.match(/event: (\w+)/);
          const dataMatch = chunk.match(/data: (.+)/);

          if (eventMatch && dataMatch) {
            const eventType = eventMatch[1];
            const data = JSON.parse(dataMatch[1]);

            switch (eventType) {
              case "progress":
                setScrapeProgress(data);
                break;
              case "complete":
                toast({
                  title: "Recherche terminée",
                  description: data.message,
                  variant: "success",
                });
                setScrapeModalOpen(false);
                fetchJobs(page);
                break;
              case "error":
                throw new Error(data.message);
            }
          }
        }
      }
    } catch (error) {
      toast({
        title: "Erreur",
        description:
          error instanceof Error ? error.message : "Échec de la recherche",
        variant: "destructive",
      });
    } finally {
      setIsScraping(false);
      setScrapeProgress(null);
    }
  };

  const handleToggleInvestigated = async (job: Job) => {
    const newValue = !job.investigated;
    setJobs(prev => prev.map(j => j.id === job.id ? { ...j, investigated: newValue } : j));

    const { error } = await supabase
      .from("jobs")
      .update({ investigated: newValue })
      .eq("id", job.id);

    if (error) {
      setJobs(prev => prev.map(j => j.id === job.id ? { ...j, investigated: !newValue } : j));
      toast({ title: "Erreur", description: "Impossible de mettre à jour le statut", variant: "destructive" });
    }
  };

  const handleToggleViable = async (job: Job, value: boolean | null) => {
    const oldValue = job.viable;
    setJobs(prev => prev.map(j => j.id === job.id ? { ...j, viable: value } : j));

    const { error } = await supabase
      .from("jobs")
      .update({ viable: value })
      .eq("id", job.id);

    if (error) {
      setJobs(prev => prev.map(j => j.id === job.id ? { ...j, viable: oldValue } : j));
      toast({ title: "Erreur", description: "Impossible de mettre à jour le statut", variant: "destructive" });
    }
  };

  const handleDraft = async (job: Job) => {
    setDraftJob(job);
    setDraftModalOpen(true);
    setIsDraftGenerating(true);
    setDraftProgress({ progress: 0, message: "Démarrage...", phase: "init" });
    setDraftDownloadUrl(null);
    setDraftDownloadFilename(null);
    setDraftError(null);
    setDraftStatuses(prev => ({ ...prev, [job.id]: "generating" }));

    try {
      const response = await fetch("/api/jobs/draft/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId: job.id }),
      });

      if (!response.ok) {
        throw new Error("Erreur de connexion au serveur");
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error("Impossible de lire le stream");
      }

      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() || "";

        for (const chunk of lines) {
          if (!chunk.trim()) continue;

          const eventMatch = chunk.match(/event: (\w+)/);
          const dataMatch = chunk.match(/data: (.+)/);

          if (eventMatch && dataMatch) {
            const eventType = eventMatch[1];
            const data = JSON.parse(dataMatch[1]);

            switch (eventType) {
              case "progress":
                setDraftProgress(data);
                break;
              case "complete":
                setDraftDownloadUrl(data.downloadUrl);
                setDraftDownloadFilename(data.filename);
                setIsDraftGenerating(false);
                setDraftStatuses(prev => ({ ...prev, [job.id]: "done" }));
                break;
              case "error":
                throw new Error(data.message);
            }
          }
        }
      }
    } catch (error) {
      setDraftError(error instanceof Error ? error.message : "Erreur inconnue");
      setIsDraftGenerating(false);
      setDraftStatuses(prev => ({ ...prev, [job.id]: "none" }));
    }
  };

  const handleExport = () => {
    const dataToExport =
      selectedIds.length > 0
        ? jobs.filter((j) => selectedIds.includes(j.id))
        : jobs;

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
    setFilters({ source: "", keyword: "", dateRange: "", investigated: "", viable: "not-red" });
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Jobs</h1>
          <p className="mt-1 text-sm sm:text-base text-muted-foreground">
            {totalCount} job opportunities{debouncedSearch || Object.values(filters).some(v => v && v !== "not-red") ? " (filtered)" : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 sm:gap-3">
          <Button variant="outline" size="sm" onClick={() => fetchJobs(page)} disabled={loading} className="flex-1 sm:flex-none">
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
            Find Jobs
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
          jobs={jobs}
          selectedIds={selectedIds}
          onSelectionChange={setSelectedIds}
          onToggleInvestigated={handleToggleInvestigated}
          onToggleViable={handleToggleViable}
          onDraft={handleDraft}
          draftStatuses={draftStatuses}
        />
      )}

      {/* Pagination */}
      {totalCount > PAGE_SIZE && (
        <div className="flex items-center justify-between pt-2">
          <p className="text-sm text-muted-foreground">
            Page {page + 1} / {Math.ceil(totalCount / PAGE_SIZE)}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 0}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={(page + 1) * PAGE_SIZE >= totalCount}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      {/* Modals */}
      <ScrapeJobsModal
        open={scrapeModalOpen}
        onOpenChange={setScrapeModalOpen}
        onStartScrape={handleStartScrape}
        isLoading={isScraping}
        progressData={scrapeProgress}
      />

      <DraftModal
        open={draftModalOpen}
        onOpenChange={setDraftModalOpen}
        isGenerating={isDraftGenerating}
        progress={draftProgress}
        error={draftError}
        downloadUrl={draftDownloadUrl}
        downloadFilename={draftDownloadFilename}
      />
    </div>
  );
}
