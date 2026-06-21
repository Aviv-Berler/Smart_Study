/** OAuth callback route — must match `src/app/auth/callback/route.ts` */
export const AUTH_CALLBACK_PATH = "/auth/callback";

/**
 * Build the Supabase OAuth redirect URL for the current deployment origin.
 * Works for localhost, Vercel previews, and custom production domains.
 */
export function buildAuthCallbackUrl(origin: string, nextPath = "/"): string {
  const base = origin.replace(/\/$/, "");
  const next = nextPath.startsWith("/") ? nextPath : `/${nextPath}`;
  return `${base}${AUTH_CALLBACK_PATH}?next=${encodeURIComponent(next)}`;
}

/**
 * Resolve site origin from request headers (Server Actions / Route Handlers).
 * Prefers Vercel/proxy forwarded headers when present.
 */
export function getSiteOriginFromHeaders(headerStore: Headers): string {
  const host =
    headerStore.get("x-forwarded-host")?.split(",")[0]?.trim() ??
    headerStore.get("host");

  if (!host) {
    throw new Error("Cannot resolve site origin: missing Host header");
  }

  const proto =
    headerStore.get("x-forwarded-proto")?.split(",")[0]?.trim() ??
    (host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https");

  return `${proto}://${host}`;
}

/** Server-side OAuth callback URL derived from the incoming request host. */
export function buildAuthCallbackUrlFromHeaders(
  headerStore: Headers,
  nextPath = "/",
): string {
  return buildAuthCallbackUrl(getSiteOriginFromHeaders(headerStore), nextPath);
}
