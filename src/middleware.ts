import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

/**
 * Root middleware — refreshes the Supabase session on every request and
 * enforces auth (requirements R1.1). Role-based checks live in the pages/
 * route handlers plus database RLS.
 */
export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Run on all paths EXCEPT:
     *   - Next.js internals (_next/static, _next/image)
     *   - favicon and common static asset extensions
     * so we don't pay the auth revalidation cost on assets.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js)$).*)",
  ],
};
