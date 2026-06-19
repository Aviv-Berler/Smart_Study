import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Use getUser() — NOT getSession() — so the JWT is cryptographically verified
  // and the session is refreshed via the Supabase server on every request.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isLoginPage = pathname.startsWith("/login");

  // /auth/** is the OAuth callback family — NEVER block these routes.
  // The callback handler must run to exchange the code for a session;
  // if middleware redirects first, the session is never established.
  const isAuthRoute = pathname.startsWith("/auth/");

  // Unauthenticated → redirect to login (skip auth routes and login itself)
  if (!user && !isLoginPage && !isAuthRoute) {
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  // Already authenticated → skip the login page
  if (user && isLoginPage) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match every path EXCEPT:
     *  - Next.js internals (_next/static, _next/image)
     *  - /auth/**  ← OAuth callback must never be intercepted here
     *  - Static assets (favicon, images, etc.)
     */
    "/((?!_next/static|_next/image|favicon.ico|auth/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
