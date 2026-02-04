"use client";

import { useEffect, useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { BusinessTable } from "@/components/BusinessTable";
import { FilterPanel } from "@/components/FilterPanel";
import {
  ScrapeBusinessModal,
  BusinessScrapeConfig,
} from "@/components/ScrapeBusinessModal";
import { SendEmailModal } from "@/components/SendEmailModal";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
import type { Business } from "@/lib/types";
import { exportToCSV } from "@/lib/utils";
import { Play, Download, Mail, Users, RefreshCw } from "lucide-react";

export default function ClientsPage() {
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [scrapeModalOpen, setScrapeModalOpen] = useState(false);
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [selectedBusiness, setSelectedBusiness] = useState<Business | null>(
    null
  );
  const [isScraping, setIsScraping] = useState(false);
  const [isSendingEmail, setIsSendingEmail] = useState(false);

  // Filters
  const [searchTerm, setSearchTerm] = useState("");
  const [filters, setFilters] = useState({
    minRating: "",
    category: "",
    hasWebsite: "",
  });

  const { toast } = useToast();

  const fetchBusinesses = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("businesses")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      toast({
        title: "Error",
        description: "Failed to fetch businesses",
        variant: "destructive",
      });
    } else {
      setBusinesses(data || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchBusinesses();
  }, []);

  // Get unique categories
  const categories = useMemo(() => {
    const cats = new Set(
      businesses.map((b) => b.category).filter(Boolean) as string[]
    );
    return Array.from(cats).sort();
  }, [businesses]);

  // Filter businesses
  const filteredBusinesses = useMemo(() => {
    return businesses.filter((business) => {
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
  }, [businesses, searchTerm, filters]);

  const handleStartScrape = async (config: BusinessScrapeConfig) => {
    setIsScraping(true);
    try {
      const response = await fetch("/api/scrape/businesses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });

      const result = await response.json();

      if (result.success) {
        toast({
          title: "Scrape Complete",
          description: `Found ${result.items_found} businesses`,
          variant: "success",
        });
        setScrapeModalOpen(false);
        fetchBusinesses();
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

  const handleSendEmail = (business: Business) => {
    setSelectedBusiness(business);
    setEmailModalOpen(true);
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
    setFilters({ minRating: "", category: "", hasWebsite: "" });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Clients</h1>
          <p className="mt-1 text-muted-foreground">
            {filteredBusinesses.length} potential clients found
          </p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" onClick={fetchBusinesses} disabled={loading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button variant="outline" onClick={handleExport}>
            <Download className="mr-2 h-4 w-4" />
            Export
            {selectedIds.length > 0 && ` (${selectedIds.length})`}
          </Button>
          {selectedIds.length > 0 && (
            <Button variant="outline">
              <Mail className="mr-2 h-4 w-4" />
              Email Selected ({selectedIds.length})
            </Button>
          )}
          <Button onClick={() => setScrapeModalOpen(true)}>
            <Play className="mr-2 h-4 w-4" />
            Scrape Businesses
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
        />
      )}

      {/* Modals */}
      <ScrapeBusinessModal
        open={scrapeModalOpen}
        onOpenChange={setScrapeModalOpen}
        onStartScrape={handleStartScrape}
        isLoading={isScraping}
      />

      <SendEmailModal
        open={emailModalOpen}
        onOpenChange={setEmailModalOpen}
        business={selectedBusiness}
        onSend={handleEmailSend}
        isLoading={isSendingEmail}
      />
    </div>
  );
}
