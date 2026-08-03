"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Field, Input } from "@/components/ui/field";
import { Button } from "@/components/ui/button";

/**
 * Client login form (requirements R1.2): email+password and Google OAuth.
 * On success the middleware-refreshed session cookie gates protected routes.
 *
 * Fixes applied:
 *  - Inputs now have visible <label> via Field (WCAG 1.3.1)
 *  - autocomplete wired for password manager support
 *  - Uses design system components (Field, Input, Button) so tokens and
 *    dark mode apply automatically — no more raw slate-* classes
 *  - Placeholders end with … per Web Interface Guidelines typography rule
 */
export function LoginForm({ next }: { next: string }) {
  const router = useRouter();
  const supabase = createClient();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handlePasswordLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    let loginEmail = email.trim();
    if (loginEmail.toLowerCase() === "admin") {
      loginEmail = "admin@sportcommunityplatform.com";
    }
    const { error } = await supabase.auth.signInWithPassword({
      email: loginEmail,
      password,
    });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    router.replace(next);
    router.refresh();
  }

  async function handleGoogleLogin() {
    setError(null);
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(
      next,
    )}`;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo },
    });
    if (error) setError(error.message);
  }

  return (
    <div className="mt-6 space-y-4">
      <form onSubmit={handlePasswordLogin} className="space-y-3">
        <Field label="Email / Tài khoản" required>
          {(props) => (
            <Input
              {...props}
              type="text"
              autoComplete="username"
              spellCheck={false}
              placeholder="admin hoặc email…"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          )}
        </Field>

        <Field label="Mật khẩu" required>
          {(props) => (
            <Input
              {...props}
              type="password"
              autoComplete="current-password"
              placeholder="Mật khẩu…"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          )}
        </Field>

        <Button
          type="submit"
          variant="primary"
          size="lg"
          loading={loading}
          className="w-full"
        >
          Đăng nhập
        </Button>
      </form>

      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        hoặc
        <span className="h-px flex-1 bg-border" />
      </div>

      <Button
        type="button"
        variant="outline"
        size="lg"
        onClick={handleGoogleLogin}
        className="w-full"
      >
        Đăng nhập với Google
      </Button>

      {error && (
        <p role="alert" aria-live="assertive" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
