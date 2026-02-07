const hits = new Map<string, { count: number; resetAt: number }>();

/**
 * Extract a client identifier from a request for per-IP rate limiting.
 */
export function getClientIdentifier(request: { headers: { get(name: string): string | null } }): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    // x-forwarded-for can contain multiple IPs; the first is the client
    return forwarded.split(",")[0].trim();
  }
  return request.headers.get("x-real-ip") || "unknown";
}

/**
 * Simple in-memory rate limiter.
 * Returns true if the request should be BLOCKED.
 * When an identifier is provided, the rate limit is scoped per identifier (e.g. per IP).
 */
export function isRateLimited(
  key: string,
  maxRequests: number,
  windowMs: number,
  identifier?: string
): boolean {
  const effectiveKey = identifier ? `${key}:${identifier}` : key;
  const now = Date.now();
  const entry = hits.get(effectiveKey);

  if (!entry || now > entry.resetAt) {
    hits.set(effectiveKey, { count: 1, resetAt: now + windowMs });
    return false;
  }

  entry.count++;
  return entry.count > maxRequests;
}

// Cleanup stale entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of hits) {
    if (now > entry.resetAt) hits.delete(key);
  }
}, 5 * 60 * 1000);
