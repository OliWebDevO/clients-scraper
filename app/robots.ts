import type { MetadataRoute } from "next";

// Private internal tool: no search engine may crawl or index it
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", disallow: "/" } };
}
