"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
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

  const fetchBusinesses = async (p = page) => {
    setLoading(true);
    const from = p * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    const { data, error, count } = await supabase
      .from("businesses")
      .select("id,name,address,phone,rating,review_count,category,google_maps_url,has_website,website_url,website_score,website_issues,location_query,investigated,viable,created_at,updated_at", { count: "exact" })
      .order("has_website", { ascending: true })
      .order("website_score", { ascending: false, nullsFirst: false })
      .order("review_count", { ascending: false, nullsFirst: false })
      .range(from, to);

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

  useEffect(() => {
    fetchBusinesses(page);
  }, [page]);

  useEffect(() => {
    fetchDraftStatuses(businesses.map(b => b.id));
  }, [businesses, fetchDraftStatuses]);

  // Get unique categories
  const categories = useMemo(() => {
    const cats = new Set(
      businesses.map((b) => b.category).filter(Boolean) as string[]
    );
    return Array.from(cats).sort();
  }, [businesses]);

  // Filter and sort businesses
  const filteredBusinesses = useMemo(() => {
    // First filter
    const filtered = businesses.filter((business) => {
      // Hide businesses with good websites (score < 25)
      if (business.has_website && business.website_score !== null && business.website_score < 25) {
        return false;
      }

      // Investigated filter
      if (filters.investigated && filters.investigated !== "all") {
        const isInvestigated = filters.investigated === "yes";
        if (business.investigated !== isInvestigated) {
          return false;
        }
      }

      // Viable filter
      if (filters.viable) {
        if (filters.viable === "not-red") {
          // Hide non-viable (false), show viable (true) and not decided (null)
          if (business.viable === false) {
            return false;
          }
        } else if (filters.viable === "yes") {
          if (business.viable !== true) {
            return false;
          }
        } else if (filters.viable === "no") {
          if (business.viable !== false) {
            return false;
          }
        } else if (filters.viable === "na") {
          if (business.viable !== null) {
            return false;
          }
        }
        // "all" shows everything
      }

      // Search
      if (searchTerm) {
        const search = searchTerm.toLowerCase();
        if (
          !business.name.toLowerCase().includes(search) &&
          !business.address?.toLowerCase().includes(search) &&
          !business.category?.toLowerCase().includes(search)
        ) {
          return false;
        }
      }

      // Rating filter
      if (filters.minRating && filters.minRating !== "all") {
        const minRating = parseFloat(filters.minRating);
        if (!business.rating || business.rating < minRating) {
          return false;
        }
      }

      // Category filter
      if (filters.category && filters.category !== "all") {
        if (business.category !== filters.category) {
          return false;
        }
      }

      // Website filter
      if (filters.hasWebsite && filters.hasWebsite !== "all") {
        const hasWebsite = filters.hasWebsite === "yes";
        if (business.has_website !== hasWebsite) {
          return false;
        }
      }

      return true;
    });

    // Then sort: no website first, then by score (worst to best), then unknown at end
    // Within each group, sort by review_count (most reviews first)
    return filtered.sort((a, b) => {
      // No website first (best prospects)
      if (!a.has_website && b.has_website) return -1;
      if (a.has_website && !b.has_website) return 1;

      // Both no website: sort by review count (most first)
      if (!a.has_website && !b.has_website) {
        return (b.review_count || 0) - (a.review_count || 0);
      }

      // Both have website: sort by score (highest/worst first)
      const aScore = a.website_score;
      const bScore = b.website_score;

      // Null scores (analysis failed) go to the end
      if (aScore === null && bScore !== null) return 1;
      if (aScore !== null && bScore === null) return -1;
      if (aScore === null && bScore === null) {
        return (b.review_count || 0) - (a.review_count || 0);
      }

      // Different score groups: higher score = worse site = better prospect = comes first
      if (aScore! !== bScore!) {
        return bScore! - aScore!;
      }

      // Same score group: sort by review count (most first)
      return (b.review_count || 0) - (a.review_count || 0);
    });
  }, [businesses, searchTerm, filters]);

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
                fetchBusinesses();
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

    const { error } = await supabase
      .from("businesses")
      .update({ investigated: newValue })
      .eq("id", business.id);

    if (error) {
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

    const { error } = await supabase
      .from("businesses")
      .update({ viable: value })
      .eq("id", business.id);

    if (error) {
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
      ? filteredBusinesses.filter((b) => selectedIds.includes(b.id))
      : filteredBusinesses;

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
            {filteredBusinesses.length} of {totalCount} potential clients
          </p>
        </div>
        <div className="flex flex-wrap gap-2 sm:gap-3">
          <Button variant="outline" size="sm" onClick={() => fetchBusinesses()} disabled={loading} className="flex-1 sm:flex-none">
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
          businesses={filteredBusinesses}
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
