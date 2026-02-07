"use client";

import React from "react";
import {
  ExternalLink,
  Star,
  MessageSquare,
  Mail,
  Check,
  MapPin,
  Phone,
  Globe,
  AlertTriangle,
  XCircle,
  X,
  FileText,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import type { Business } from "@/lib/types";

interface BusinessTableProps {
  businesses: Business[];
  selectedIds: string[];
  onSelectionChange: (ids: string[]) => void;
  onSendEmail: (business: Business) => void;
  onToggleInvestigated: (business: Business) => void;
  onToggleViable: (business: Business, value: boolean | null) => void;
  onDraft?: (business: Business) => void;
  draftStatuses?: Record<string, "none" | "generating" | "done">;
}

export const BusinessTable = React.memo(function BusinessTable({
  businesses,
  selectedIds,
  onSelectionChange,
  onSendEmail,
  onToggleInvestigated,
  onToggleViable,
  onDraft,
  draftStatuses = {},
}: BusinessTableProps) {
  const toggleSelection = (id: string) => {
    if (selectedIds.includes(id)) {
      onSelectionChange(selectedIds.filter((i) => i !== id));
    } else {
      onSelectionChange([...selectedIds, id]);
    }
  };

  const toggleAll = () => {
    if (selectedIds.length === businesses.length) {
      onSelectionChange([]);
    } else {
      onSelectionChange(businesses.map((b) => b.id));
    }
  };

  if (businesses.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-12 sm:py-16 px-4">
        <MessageSquare className="mb-4 h-10 w-10 sm:h-12 sm:w-12 text-muted-foreground/30" />
        <p className="text-base sm:text-lg font-medium text-muted-foreground text-center">
          No businesses found
        </p>
        <p className="mt-1 text-sm text-muted-foreground/70 text-center">
          Start a search to find potential clients
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
            checked={selectedIds.length === businesses.length && businesses.length > 0}
            onCheckedChange={toggleAll}
          />
          <span className="text-sm text-muted-foreground">
            Select all ({businesses.length})
          </span>
        </div>

        {/* Cards */}
        {businesses.map((business) => (
          <div
            key={business.id}
            className={`rounded-lg border border-border p-4 space-y-3 ${
              selectedIds.includes(business.id) ? "bg-primary/5 border-primary/30" : ""
            } ${business.investigated ? "opacity-50" : ""}`}
          >
            {/* Header: Checkbox + Name */}
            <div className="flex items-start gap-3">
              <Checkbox
                checked={selectedIds.includes(business.id)}
                onCheckedChange={() => toggleSelection(business.id)}
                className="mt-1"
              />
              <div className="flex-1 min-w-0">
                <h3 className="font-medium truncate">{business.name}</h3>
                {business.address && (
                  <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
                    <MapPin className="h-3 w-3 shrink-0" />
                    <span className="truncate">{business.address}</span>
                  </p>
                )}
              </div>
            </div>

            {/* Info Row */}
            <div className="flex flex-wrap items-center gap-1.5 overflow-hidden">
              {/* Rating */}
              <div className="flex items-center gap-1 shrink-0">
                <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />
                <span className="text-xs font-medium">
                  {business.rating?.toFixed(1) || "N/A"}
                </span>
                <span className="text-xs text-muted-foreground">
                  ({business.review_count || 0})
                </span>
              </div>

              {/* Category */}
              {business.category && (
                <Badge variant="secondary" className="font-normal text-xs truncate max-w-[100px]">
                  {business.category}
                </Badge>
              )}

              {/* Website Status */}
              <WebsiteStatusBadge business={business} compact />
            </div>

            {/* Actions */}
            <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-border">
              {/* Vu checkbox */}
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => onToggleInvestigated(business)}
                  className={`shrink-0 h-5 w-5 rounded border-2 flex items-center justify-center transition-colors ${
                    business.investigated
                      ? "bg-green-500 border-green-500 text-white"
                      : "border-muted-foreground/30 hover:border-green-500"
                  }`}
                  title={business.investigated ? "Marquer non vu" : "Marquer vu"}
                >
                  {business.investigated && <Check className="h-3 w-3" />}
                </button>
                <span className="text-xs text-muted-foreground">Vu</span>
              </div>
              {/* Viable checkbox */}
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => {
                    const nextValue = business.viable === null ? true : business.viable === true ? false : null;
                    onToggleViable(business, nextValue);
                  }}
                  className={`shrink-0 h-5 w-5 rounded border-2 flex items-center justify-center transition-colors ${
                    business.viable === true
                      ? "bg-green-500 border-green-500 text-white"
                      : business.viable === false
                      ? "bg-red-500 border-red-500 text-white"
                      : "border-muted-foreground/30 hover:border-muted-foreground"
                  }`}
                  title={business.viable === true ? "Viable" : business.viable === false ? "Non viable" : "Non décidé"}
                >
                  {business.viable === true && <Check className="h-3 w-3" />}
                  {business.viable === false && <X className="h-3 w-3" />}
                </button>
                <span className="text-xs text-muted-foreground">Viable</span>
              </div>
              <div className="flex-1" />
              <div className="flex items-center gap-1.5">
                {onDraft && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onDraft(business)}
                    disabled={draftStatuses[business.id] === "generating"}
                    className="shrink-0 px-2.5"
                  >
                    {draftStatuses[business.id] === "generating" ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <FileText className={`h-4 w-4 ${draftStatuses[business.id] === "done" ? "text-blue-500" : ""}`} />
                    )}
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onSendEmail(business)}
                  className="shrink-0 px-2.5"
                >
                  <Mail className="h-4 w-4" />
                </Button>
                {business.website_url && (
                  <a href={business.website_url} target="_blank" rel="noopener noreferrer" className="shrink-0">
                    <Button variant="outline" size="sm" className="px-2.5">
                      <Globe className="h-4 w-4" />
                    </Button>
                  </a>
                )}
                {business.google_maps_url && (
                  <a href={business.google_maps_url} target="_blank" rel="noopener noreferrer" className="shrink-0">
                    <Button variant="outline" size="sm" className="px-2.5">
                      <ExternalLink className="h-4 w-4" />
                    </Button>
                  </a>
                )}
              </div>
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
                    checked={selectedIds.length === businesses.length && businesses.length > 0}
                    onCheckedChange={toggleAll}
                  />
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
                  Business
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
                  Location
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
                  Rating
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
                  Category
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
                  Status
                </th>
                <th className="w-14 px-3 py-3 text-center text-sm font-medium text-muted-foreground">
                  Vu
                </th>
                <th className="w-14 px-3 py-3 text-center text-sm font-medium text-muted-foreground">
                  Viable
                </th>
                <th className="w-14 px-3 py-3 text-center text-sm font-medium text-muted-foreground">
                  Draft
                </th>
                <th className="px-4 py-3 text-right text-sm font-medium text-muted-foreground">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {businesses.map((business) => (
                <tr
                  key={business.id}
                  className={`border-b border-border transition-colors duration-150 hover:bg-muted/30 ${selectedIds.includes(business.id) ? "bg-primary/5" : ""} ${business.investigated ? "opacity-50" : ""}`}
                >
                  <td className="px-4 py-3">
                    <Checkbox
                      checked={selectedIds.includes(business.id)}
                      onCheckedChange={() => toggleSelection(business.id)}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col">
                      <span className="font-medium">{business.name}</span>
                      {business.phone && (
                        <span className="flex items-center gap-1 text-sm text-muted-foreground">
                          <Phone className="h-3 w-3" />
                          {business.phone}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 text-sm text-muted-foreground">
                      <MapPin className="h-3 w-3 shrink-0" />
                      <span className="max-w-[200px] truncate">
                        {business.address || "N/A"}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                      <span className="font-medium">
                        {business.rating?.toFixed(1) || "N/A"}
                      </span>
                      <span className="text-sm text-muted-foreground">
                        ({business.review_count || 0})
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant="secondary" className="font-normal">
                      {business.category || "Unknown"}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <WebsiteStatusBadge business={business} />
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex justify-center">
                      <button
                        onClick={() => onToggleInvestigated(business)}
                        className={`shrink-0 h-5 w-5 rounded border-2 flex items-center justify-center transition-colors cursor-pointer ${
                          business.investigated
                            ? "bg-green-500 border-green-500 text-white"
                            : "border-muted-foreground/30 hover:border-green-500"
                        }`}
                        title={business.investigated ? "Marquer non vu" : "Marquer vu"}
                      >
                        {business.investigated && <Check className="h-3 w-3" />}
                      </button>
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex justify-center">
                      <button
                        onClick={() => {
                          const nextValue = business.viable === null ? true : business.viable === true ? false : null;
                          onToggleViable(business, nextValue);
                        }}
                        className={`shrink-0 h-5 w-5 rounded border-2 flex items-center justify-center transition-colors cursor-pointer ${
                          business.viable === true
                            ? "bg-green-500 border-green-500 text-white"
                            : business.viable === false
                            ? "bg-red-500 border-red-500 text-white"
                            : "border-muted-foreground/30 hover:border-muted-foreground"
                        }`}
                        title={business.viable === true ? "Viable" : business.viable === false ? "Non viable" : "Non décidé"}
                      >
                        {business.viable === true && <Check className="h-3 w-3" />}
                        {business.viable === false && <X className="h-3 w-3" />}
                      </button>
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex justify-center">
                      {onDraft ? (
                        <button
                          onClick={() => onDraft(business)}
                          disabled={draftStatuses[business.id] === "generating"}
                          className={`shrink-0 h-7 w-7 rounded flex items-center justify-center transition-colors cursor-pointer ${
                            draftStatuses[business.id] === "generating"
                              ? "text-blue-400 animate-pulse"
                              : draftStatuses[business.id] === "done"
                              ? "bg-blue-500/20 text-blue-400 hover:bg-blue-500/30"
                              : "text-muted-foreground/40 hover:text-muted-foreground hover:bg-muted"
                          }`}
                          title={
                            draftStatuses[business.id] === "generating"
                              ? "Generating..."
                              : draftStatuses[business.id] === "done"
                              ? "Re-generate draft"
                              : "Generate draft proposal"
                          }
                        >
                          {draftStatuses[business.id] === "generating" ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <FileText className="h-4 w-4" />
                          )}
                        </button>
                      ) : (
                        <span className="text-muted-foreground/30">&mdash;</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => onSendEmail(business)}
                        title="Envoyer email"
                      >
                        <Mail className="h-4 w-4" />
                      </Button>
                      {business.website_url && (
                        <a
                          href={business.website_url}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <Button variant="ghost" size="icon" title="Voir le site web">
                            <Globe className="h-4 w-4" />
                          </Button>
                        </a>
                      )}
                      {business.google_maps_url && (
                        <a
                          href={business.google_maps_url}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <Button variant="ghost" size="icon" title="Voir sur Maps">
                            <ExternalLink className="h-4 w-4" />
                          </Button>
                        </a>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
});

function WebsiteStatusBadge({ business, compact }: { business: Business; compact?: boolean }) {
  // No website = best prospect
  if (!business.has_website) {
    return (
      <Badge variant="success" className="gap-1 text-xs">
        <XCircle className="h-3 w-3" />
        {compact ? "No site" : "No site"}
      </Badge>
    );
  }

  // Has website with score
  const score = business.website_score;
  const issues = business.website_issues || [];

  if (score === null || score === undefined) {
    return (
      <Badge variant="outline" className="gap-1 text-xs">
        <Globe className="h-3 w-3" />
        Site web
      </Badge>
    );
  }

  // High score = bad site = good prospect
  if (score >= 50) {
    return (
      <div className="flex flex-col gap-1">
        <Badge variant="destructive" className="gap-1 text-xs">
          <AlertTriangle className="h-3 w-3" />
          {compact ? `Refaire (${score})` : `Site a refaire (${score})`}
        </Badge>
        {!compact && issues.length > 0 && (
          <span className="text-xs text-muted-foreground" title={issues.join(", ")}>
            {issues.slice(0, 2).join(", ")}
            {issues.length > 2 && "..."}
          </span>
        )}
      </div>
    );
  }

  // Medium score
  if (score >= 25) {
    return (
      <div className="flex flex-col gap-1">
        <Badge className="gap-1 text-xs bg-orange-500/20 text-orange-600 border-orange-500/30">
          <AlertTriangle className="h-3 w-3" />
          {compact ? `Vieux (${score})` : `Site vieillissant (${score})`}
        </Badge>
        {!compact && issues.length > 0 && (
          <span className="text-xs text-muted-foreground" title={issues.join(", ")}>
            {issues.slice(0, 2).join(", ")}
          </span>
        )}
      </div>
    );
  }

  // Low score = good site = not ideal prospect
  return (
    <Badge variant="outline" className="gap-1 text-xs text-muted-foreground">
      <Check className="h-3 w-3" />
      {compact ? `Bon (${score})` : `Bon site (${score})`}
    </Badge>
  );
}
