import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

type CookieToSet = { name: string; value: string; options: CookieOptions };

/** Paths reachable without an authenticated session. */
const PUBLIC_PATHS = [
  "/",
  "/sport-hub",
  "/api/lark",
  "/templates",
  "/portal",
  "/login",
  "/auth/callback",
];

function isPublicPath(pathname: string): boolean {
  return (
    pathname === "/" ||
    PUBLIC_PATHS.some(
      (p) => p !== "/" && (pathname === p || pathname.startsWith(`${p}/`))
    )
  );
}

export async function updateSession(
  request: NextRequest
): Promise<NextResponse> {
  const { pathname } = request.nextUrl;
  const isPublic = isPublicPath(pathname);

  // For public routes (except /login where we might redirect logged-in users), pass through immediately
  if (isPublic && pathname !== "/login") {
    return NextResponse.next({ request });
  }

  // If Supabase credentials are not configured, allow public access
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
    return NextResponse.next({ request });
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
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

  // IMPORTANT: getUser() revalidates the token with Supabase (not just decode),
  // so a revoked/expired session is caught here — do not replace with getSession().
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // R1.1: unauthenticated access to any non-public route -> redirect to /login.
  if (!user && !isPublic) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Logged-in users hitting /login go to the dashboard.
  if (user && pathname === "/login") {
    const homeUrl = request.nextUrl.clone();
    homeUrl.pathname = "/";
    homeUrl.search = "";
    return NextResponse.redirect(homeUrl);
  }

  return response;
}
