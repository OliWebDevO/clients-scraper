"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { BusinessTable } from "@/components/BusinessTable";
import { FilterPanel } from "@/components/FilterPanel";
import {
  ScrapeBusinessModal,
  BusinessScrapeConfig,
  ProgressUpdate,
} from "@/components/ScrapeBusinessModal";
import { SendEmailModal } from "@/components/SendEmailModal";
import { DraftModal } from "@/components/DraftModal";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
import type { Business, DraftProgressUpdate } from "@/lib/types";
import { exportToCSV } from "@/lib/utils";
import { Play, Download, Mail, Users, RefreshCw } from "lucide-react";

/** Escape special characters in a search string for use inside Supabase `.or()` / `.ilike()` */
function sanitizeSearch(raw: string): string {
  return raw.replace(/[%_\\]/g, (c) => `\\${c}`);
}

export default function ClientsPage() {
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [scrapeModalOpen, setScrapeModalOpen] = useState(false);
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [selectedBusiness, setSelectedBusiness] = useState<Business | null>(
    null
  );
  const [isScraping, setIsScraping] = useState(false);
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [scrapeProgress, setScrapeProgress] = useState<ProgressUpdate | null>(null);

  // Draft states
  const [draftModalOpen, setDraftModalOpen] = useState(false);
  const [draftBusiness, setDraftBusiness] = useState<Business | null>(null);
  const [isDraftGenerating, setIsDraftGenerating] = useState(false);
  const [draftProgress, setDraftProgress] = useState<DraftProgressUpdate | null>(null);
  const [draftDownloadUrl, setDraftDownloadUrl] = useState<string | null>(null);
  const [draftDownloadFilename, setDraftDownloadFilename] = useState<string | null>(null);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [draftStatuses, setDraftStatuses] = useState<Record<string, "none" | "generating" | "done">>({});

  // All categories (fetched once from full table)
  const [allCategories, setAllCategories] = useState<string[]>([]);

  // Filters
  const [searchTerm, setSearchTerm] = useState("");
  const [filters, setFilters] = useState({
    investigated: "",
    viable: "not-red", // Default: hide non-viable
    minRating: "",
    category: "",
    hasWebsite: "",
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

  const fetchBusinesses = useCallback(async (p: number) => {
    setLoading(true);
    const from = p * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    let query = supabase
      .from("businesses")
      .select("id,name,address,phone,rating,review_count,category,google_maps_url,has_website,website_url,website_score,website_issues,location_query,investigated,viable,created_at,updated_at", { count: "exact" });

    // --- Server-side filters ---

    // Always hide businesses with good websites (score < 25)
    query = query.or("has_website.eq.false,website_score.is.null,website_score.gte.25");

    // Search
    if (debouncedSearch) {
      const s = sanitizeSearch(debouncedSearch);
      query = query.or(`name.ilike.%${s}%,address.ilike.%${s}%,category.ilike.%${s}%`);
    }

    // Category
    if (filters.category && filters.category !== "all") {
      query = query.eq("category", filters.category);
    }

    // Min rating
    if (filters.minRating && filters.minRating !== "all") {
      query = query.gte("rating", parseFloat(filters.minRating));
    }

    // Investigated
    if (filters.investigated && filters.investigated !== "all") {
      query = query.eq("investigated", filters.investigated === "yes");
    }

    // Viable
    if (filters.viable) {
      if (filters.viable === "not-red") {
        // Hide non-viable (false), show viable (true) and undecided (null)
        query = query.or("viable.eq.true,viable.is.null");
      } else if (filters.viable === "yes") {
        query = query.eq("viable", true);
      } else if (filters.viable === "no") {
        query = query.eq("viable", false);
      } else if (filters.viable === "na") {
        query = query.is("viable", null);
      }
      // "all" – no filter
    }

    // Has website
    if (filters.hasWebsite && filters.hasWebsite !== "all") {
      query = query.eq("has_website", filters.hasWebsite === "yes");
    }

    // Order & paginate
    query = query
      .order("has_website", { ascending: true })
      .order("website_score", { ascending: false, nullsFirst: false })
      .order("review_count", { ascending: false, nullsFirst: false })
      .range(from, to);

    const { data, error, count } = await query;

    if (error) {
      toast({
        title: "Error",
        description: "Failed to fetch businesses",
        variant: "destructive",
      });
    } else {
      setBusinesses(data || []);
      setTotalCount(count || 0);
    }
    setLoading(false);
  }, [debouncedSearch, filters, toast]);

  const fetchCategories = async () => {
    const { data: catData } = await supabase
      .from("businesses")
      .select("category")
      .not("category", "is", null)
      .limit(1000);

    if (catData) {
      const unique = Array.from(new Set(catData.map((c: { category: string }) => c.category))).sort();
      setAllCategories(unique);
    }
  };

  const fetchDraftStatuses = useCallback(async (businessIds: string[]) => {
    if (businessIds.length === 0) return;
    try {
      const { data } = await supabase
        .from("business_drafts")
        .select("business_id, status")
        .in("business_id", businessIds);

      if (data) {
        const statuses: Record<string, "none" | "generating" | "done"> = {};
        data.forEach((d: { business_id: string; status: string }) => {
          statuses[d.business_id] = d.status === "completed" ? "done" : "none";
        });
        setDraftStatuses(statuses);
      }
    } catch {
      // business_drafts table may not exist yet
    }
  }, []);

  // Reset page to 0 when any filter changes
  useEffect(() => {
    setPage(0);
  }, [debouncedSearch, filters]);

  // Fetch businesses whenever page, debounced search, or filters change
  useEffect(() => {
    fetchBusinesses(page);
  }, [page, fetchBusinesses]);

  useEffect(() => {
    fetchCategories();
  }, []);

  useEffect(() => {
    fetchDraftStatuses(businesses.map(b => b.id));
  }, [businesses, fetchDraftStatuses]);

  // Use allCategories from the dedicated query (full table, not just current page)
  const categories = allCategories;

  const handleStartScrape = async (config: BusinessScrapeConfig) => {
    setIsScraping(true);
    setScrapeProgress({ current: 0, total: 10, progress: 0, message: "Démarrage...", phase: "init" });

    try {
      const response = await fetch("/api/scrape/businesses/stream", {
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
              case "status":
                setScrapeProgress(data);
                break;
              case "complete":
                toast({
                  title: "Recherche terminée",
                  description: data.message,
                  variant: "success",
                });
                setScrapeModalOpen(false);
                fetchBusinesses(page);
                fetchCategories();
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

  const handleSendEmail = (business: Business) => {
    setSelectedBusiness(business);
    setEmailModalOpen(true);
  };

  const handleToggleInvestigated = async (business: Business) => {
    const newValue = !business.investigated;

    // Optimistic update
    setBusinesses(prev =>
      prev.map(b => b.id === business.id ? { ...b, investigated: newValue } : b)
    );

    try {
      const res = await fetch("/api/businesses", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: business.id, investigated: newValue }),
      });
      const result = await res.json();
      if (!result.success) throw new Error();
    } catch {
      // Revert on error
      setBusinesses(prev =>
        prev.map(b => b.id === business.id ? { ...b, investigated: !newValue } : b)
      );
      toast({
        title: "Erreur",
        description: "Impossible de mettre à jour le statut",
        variant: "destructive",
      });
    }
  };

  const handleToggleViable = async (business: Business, value: boolean | null) => {
    const oldValue = business.viable;

    // Optimistic update
    setBusinesses(prev =>
      prev.map(b => b.id === business.id ? { ...b, viable: value } : b)
    );

    try {
      const res = await fetch("/api/businesses", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: business.id, viable: value }),
      });
      const result = await res.json();
      if (!result.success) throw new Error();
    } catch {
      // Revert on error
      setBusinesses(prev =>
        prev.map(b => b.id === business.id ? { ...b, viable: oldValue } : b)
      );
      toast({
        title: "Erreur",
        description: "Impossible de mettre à jour le statut",
        variant: "destructive",
      });
    }
  };

  const handleEmailSend = async (data: {
    subject: string;
    body: string;
    recipientEmail: string;
  }) => {
    setIsSendingEmail(true);
    try {
      const response = await fetch("/api/emails/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...data,
          businessId: selectedBusiness?.id,
        }),
      });

      const result = await response.json();

      if (result.success) {
        toast({
          title: "Email Sent",
          description: `Email sent to ${data.recipientEmail}`,
          variant: "success",
        });
        setEmailModalOpen(false);
      } else {
        throw new Error(result.error || "Failed to send email");
      }
    } catch (error) {
      toast({
        title: "Error",
        description:
          error instanceof Error ? error.message : "Failed to send email",
        variant: "destructive",
      });
    } finally {
      setIsSendingEmail(false);
    }
  };

  const handleDraft = async (business: Business) => {
    setDraftBusiness(business);
    setDraftModalOpen(true);
    setIsDraftGenerating(true);
    setDraftProgress({ progress: 0, message: "Demarrage...", phase: "init" });
    setDraftDownloadUrl(null);
    setDraftDownloadFilename(null);
    setDraftError(null);
    setDraftStatuses(prev => ({ ...prev, [business.id]: "generating" }));

    try {
      const response = await fetch("/api/businesses/draft/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId: business.id }),
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
                setDraftStatuses(prev => ({ ...prev, [business.id]: "done" }));
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
      setDraftStatuses(prev => ({ ...prev, [business.id]: "none" }));
    }
  };

  const handleExport = () => {
    const dataToExport = selectedIds.length > 0
      ? businesses.filter((b) => selectedIds.includes(b.id))
      : businesses;

    exportToCSV(
      dataToExport.map((b) => ({
        name: b.name,
        address: b.address || "",
        phone: b.phone || "",
        rating: b.rating || "",
        reviews: b.review_count || "",
        category: b.category || "",
        has_website: b.has_website ? "Yes" : "No",
        google_maps_url: b.google_maps_url || "",
      })),
      `clients-${new Date().toISOString().split("T")[0]}`
    );

    toast({
      title: "Export Complete",
      description: `Exported ${dataToExport.length} businesses to CSV`,
    });
  };

  const handleClearFilters = () => {
    setSearchTerm("");
    setFilters({ investigated: "", viable: "not-red", minRating: "", category: "", hasWebsite: "" });
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Clients</h1>
          <p className="mt-1 text-sm sm:text-base text-muted-foreground">
            {totalCount} potential clients{debouncedSearch || Object.values(filters).some(v => v && v !== "not-red") ? " (filtered)" : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 sm:gap-3">
          <Button variant="outline" size="sm" onClick={() => fetchBusinesses(page)} disabled={loading} className="flex-1 sm:flex-none">
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            <span className="hidden xs:inline">Refresh</span>
          </Button>
          <Button variant="outline" size="sm" onClick={handleExport} className="flex-1 sm:flex-none">
            <Download className="mr-2 h-4 w-4" />
            <span className="hidden xs:inline">Export</span>
            {selectedIds.length > 0 && ` (${selectedIds.length})`}
          </Button>
          {selectedIds.length > 0 && (
            <Button variant="outline" size="sm" className="flex-1 sm:flex-none">
              <Mail className="mr-2 h-4 w-4" />
              <span className="hidden sm:inline">Email</span> ({selectedIds.length})
            </Button>
          )}
          <Button size="sm" onClick={() => setScrapeModalOpen(true)} className="w-full sm:w-auto">
            <Play className="mr-2 h-4 w-4" />
            Find Clients
          </Button>
        </div>
      </div>

      {/* Filters */}
      <FilterPanel
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        filters={filters}
        onFilterChange={(key, value) =>
          setFilters((prev) => ({ ...prev, [key]: value }))
        }
        onClearFilters={handleClearFilters}
        categories={categories}
      />

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <BusinessTable
          businesses={businesses}
          selectedIds={selectedIds}
          onSelectionChange={setSelectedIds}
          onSendEmail={handleSendEmail}
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
      <ScrapeBusinessModal
        open={scrapeModalOpen}
        onOpenChange={setScrapeModalOpen}
        onStartScrape={handleStartScrape}
        isLoading={isScraping}
        progressData={scrapeProgress}
      />

      <SendEmailModal
        open={emailModalOpen}
        onOpenChange={setEmailModalOpen}
        business={selectedBusiness}
        onSend={handleEmailSend}
        isLoading={isSendingEmail}
      />

      <DraftModal
        open={draftModalOpen}
        onOpenChange={setDraftModalOpen}
        isGenerating={isDraftGenerating}
        progress={draftProgress}
        error={draftError}
        downloadUrl={draftDownloadUrl}
        downloadFilename={draftDownloadFilename}
        title="Draft Proposal"
      />
    </div>
  );
}
