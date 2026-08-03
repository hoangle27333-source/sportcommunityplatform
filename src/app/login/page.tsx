import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

/**
 * /login — email+password and Google OAuth (requirements R1.2).
 * Server component: if already authenticated, bounce to the dashboard.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect("/");

  const { next } = await searchParams;

  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm rounded-xl border border-border bg-card p-8 shadow-md">
        <div className="flex items-center gap-2.5">
          {/* Brand mark */}
          <span className="grid size-8 shrink-0 place-items-center rounded bg-primary text-primary-foreground">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M2 12a5 5 0 0 0 5 5 8 8 0 0 1 5 2 8 8 0 0 1 5-2 5 5 0 0 0 5-5V7h-5a8 8 0 0 0-5 2 8 8 0 0 0-5-2H2Z"/>
            </svg>
          </span>
          <h1 className="text-lg font-semibold tracking-tight text-foreground">
            Content Automation Hub
          </h1>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          Đăng nhập để tiếp tục
        </p>
        <LoginForm next={next ?? "/"} />
      </div>
    </main>
  );
}
