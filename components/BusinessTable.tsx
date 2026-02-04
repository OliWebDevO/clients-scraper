"use client";

import { useState } from "react";
import {
  ExternalLink,
  Star,
  MessageSquare,
  Mail,
  MoreHorizontal,
  Check,
  MapPin,
  Phone,
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
}

export function BusinessTable({
  businesses,
  selectedIds,
  onSelectionChange,
  onSendEmail,
}: BusinessTableProps) {
  const [hoveredRow, setHoveredRow] = useState<string | null>(null);

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
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-16">
        <MessageSquare className="mb-4 h-12 w-12 text-muted-foreground/30" />
        <p className="text-lg font-medium text-muted-foreground">
          No businesses found
        </p>
        <p className="mt-1 text-sm text-muted-foreground/70">
          Start a scrape to find potential clients
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
                    selectedIds.length === businesses.length &&
                    businesses.length > 0
                  }
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
              <th className="w-24 px-4 py-3 text-right text-sm font-medium text-muted-foreground">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {businesses.map((business) => (
              <tr
                key={business.id}
                className={`border-b border-border transition-colors duration-150 ${
                  hoveredRow === business.id ? "bg-muted/30" : ""
                } ${selectedIds.includes(business.id) ? "bg-primary/5" : ""}`}
                onMouseEnter={() => setHoveredRow(business.id)}
                onMouseLeave={() => setHoveredRow(null)}
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
                    <MapPin className="h-3 w-3" />
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
                  {business.has_website ? (
                    <Badge variant="outline" className="gap-1">
                      <Check className="h-3 w-3" />
                      Has Website
                    </Badge>
                  ) : (
                    <Badge variant="success" className="gap-1">
                      No Website
                    </Badge>
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => onSendEmail(business)}
                      title="Send email"
                    >
                      <Mail className="h-4 w-4" />
                    </Button>
                    {business.google_maps_url && (
                      <a
                        href={business.google_maps_url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <Button variant="ghost" size="icon" title="View on Maps">
                          <ExternalLink className="h-4 w-4" />
                        </Button>
                      </a>
                    )}
                    <Button variant="ghost" size="icon">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
