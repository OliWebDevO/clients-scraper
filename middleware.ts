import { NextRequest, NextResponse } from "next/server";
import { verifySession, SESSION_COOKIE_NAME } from "@/lib/auth";

const PUBLIC_PATHS = ["/login", "/api/auth/login", "/api/cron"];

// Paths exempt from CSRF Origin check (called by external services)
const CSRF_EXEMPT_PATHS = ["/api/cron"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // CSRF protection: for state-changing requests, verify Origin or Referer header
  const method = request.method.toUpperCase();
  if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
    const isExempt = CSRF_EXEMPT_PATHS.some((path) => pathname.startsWith(path));
    if (!isExempt) {
      const origin = request.headers.get("origin");
      const referer = request.headers.get("referer");
      const host = request.headers.get("host");

      // Reject if both Origin and Referer are absent on state-changing requests
      if (!origin && !referer) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }

      // Reject if Origin or Referer is present but Host header is missing
      if ((origin || referer) && !host) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }

      // Validate Origin header if present
      if (origin && host) {
        try {
          const originHost = new URL(origin).host;
          if (originHost !== host) {
            return NextResponse.json({ error: "CSRF origin mismatch" }, { status: 403 });
          }
        } catch {
          return NextResponse.json({ error: "Invalid origin header" }, { status: 403 });
        }
      }

      // Validate Referer header if Origin is absent
      if (!origin && referer && host) {
        try {
          const refererHost = new URL(referer).host;
          if (refererHost !== host) {
            return NextResponse.json({ error: "CSRF referer mismatch" }, { status: 403 });
          }
        } catch {
          return NextResponse.json({ error: "Invalid referer header" }, { status: 403 });
        }
      }
    }
  }

  if (PUBLIC_PATHS.some((path) => pathname.startsWith(path))) {
    const response = NextResponse.next();
    addSecurityHeaders(response);
    return response;
  }

  // Fix 9: Add security headers to static assets too
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.includes(".")
  ) {
    const response = NextResponse.next();
    addSecurityHeaders(response);
    return response;
  }

  const sessionCookie = request.cookies.get(SESSION_COOKIE_NAME);

  if (!sessionCookie?.value) {
    return redirectOrReject(request, pathname);
  }

  const session = await verifySession(sessionCookie.value);

  if (!session) {
    const response = redirectOrReject(request, pathname);
    response.cookies.delete(SESSION_COOKIE_NAME);
    return response;
  }

  const response = NextResponse.next();
  addSecurityHeaders(response);
  return response;
}

function addSecurityHeaders(response: NextResponse): void {
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("X-DNS-Prefetch-Control", "off");
  response.headers.set(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' https://*.supabase.co; font-src 'self';"
  );
  response.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=()"
  );
  if (process.env.NODE_ENV === "production") {
    response.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
}

function redirectOrReject(request: NextRequest, pathname: string): NextResponse {
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const loginUrl = new URL("/login", request.url);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
