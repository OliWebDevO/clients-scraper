import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: Date | string | null): string {
  if (!date) return "N/A";
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function formatRelativeTime(date: Date | string | null): string {
  if (!date) return "Never";
  const d = typeof date === "string" ? new Date(date) : date;
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - d.getTime()) / 1000);

  if (diffInSeconds < 60) return "Just now";
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
  if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)}d ago`;
  return formatDate(d);
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function randomDelay(min: number, max: number): Promise<void> {
  const ms = Math.floor(Math.random() * (max - min + 1)) + min;
  return delay(ms);
}

export function parseRating(ratingStr: string | null | undefined): number | null {
  if (!ratingStr) return null;
  const match = ratingStr.match(/[\d.]+/);
  if (match) {
    const rating = parseFloat(match[0]);
    return rating > 0 && rating <= 5 ? rating : null;
  }
  return null;
}

export function parseReviewCount(reviewStr: string | null | undefined): number | null {
  if (!reviewStr) return null;
  const cleaned = reviewStr.replace(/[^\d]/g, "");
  const count = parseInt(cleaned, 10);
  return isNaN(count) ? null : count;
}

export function extractCity(address: string | null | undefined): string | null {
  if (!address) return null;
  const parts = address.split(",").map((p) => p.trim());
  return parts.length >= 2 ? parts[parts.length - 2] : parts[0] || null;
}

export function replaceTemplateVariables(
  template: string,
  variables: Record<string, string | null | undefined>
): string {
  let result = template;
  for (const [key, value] of Object.entries(variables)) {
    const regex = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, "g");
    const safe = (value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    result = result.replace(regex, safe);
  }
  return result;
}

/**
 * Re-apply the blank line spacing pattern from the original text onto the AI-generated text.
 * The AI often collapses multiple blank lines into single ones - this restores the original layout.
 */
export function reapplySpacing(original: string, generated: string): string {
  const originalGaps = original.match(/\n{2,}/g) || [];

  let gapIndex = 0;
  return generated.replace(/\n{2,}/g, () => {
    if (gapIndex < originalGaps.length) {
      return originalGaps[gapIndex++];
    }
    return "\n\n";
  });
}

export function exportToCSV<T extends Record<string, unknown>>(
  data: T[],
  filename: string
): void {
  if (data.length === 0) return;

  const headers = Object.keys(data[0]);
  const csvRows: string[] = [];

  csvRows.push(headers.join(","));

  for (const row of data) {
    const values = headers.map((header) => {
      const value = row[header];
      const stringValue = value === null || value === undefined ? "" : String(value);
      const escaped = stringValue.replace(/"/g, '""');
      return `"${escaped}"`;
    });
    csvRows.push(values.join(","));
  }

  const csvString = csvRows.join("\n");
  const blob = new Blob([csvString], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `${filename}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}
