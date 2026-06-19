import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (code) {
    // 1. Build the redirect response FIRST so we can attach cookies to it.
    const response = NextResponse.redirect(new URL(next, request.url));

    // 2. Create the Supabase client wired to read from the request and
    //    write to BOTH the request (current scope) and the response (browser).
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return request.cookies.get(name)?.value;
          },
          set(name: string, value: string, options: CookieOptions) {
            // NextRequest.cookies.set only accepts (name, value)
            request.cookies.set(name, value);
            // NextResponse.cookies.set accepts (name, value, options)
            response.cookies.set(name, value, options);
          },
          remove(name: string, options: CookieOptions) {
            request.cookies.set(name, "");
            response.cookies.set(name, "", options);
          },
        },
      }
    );

    // 3. Exchange the PKCE code — this calls set() above, baking tokens into
    //    the response cookies before we return it.
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return response;
    }
  }

  return NextResponse.redirect(new URL("/login?error=oauth_failed", request.url));
}
