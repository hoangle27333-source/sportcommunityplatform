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

  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handlePasswordLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
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
  }

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    const trimmedName = name.trim();
    const trimmedEmail = email.trim();

    if (!trimmedName) {
      setError("Please enter your full name.");
      return;
    }
    if (!trimmedEmail) {
      setError("Please enter your email address.");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters long.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    const { data, error: signUpError } = await supabase.auth.signUp({
      email: trimmedEmail,
      password,
      options: {
        data: {
          name: trimmedName,
        },
      },
    });

    setLoading(false);

    if (signUpError) {
      setError(signUpError.message);
      return;
    }

    // If session is immediately established
    if (data.session) {
      // Upsert profile record to ensure name and editor role are set
      await supabase
        .from("profiles")
        .upsert({
          id: data.user?.id,
          name: trimmedName,
          email: trimmedEmail,
          role: "editor",
        })
        .select();

      router.replace(next);
    } else {
      setSuccessMsg(
        "Account created successfully! If email verification is enabled, please check your inbox. Otherwise, switch to Sign In."
      );
      setMode("signin");
    }
  }

  return (
    <div className="mt-6 space-y-4">
      {/* Tab Selector: Sign In vs Sign Up */}
      <div className="grid grid-cols-2 p-1 bg-muted/60 rounded-xl border border-border text-xs font-semibold">
        <button
          type="button"
          onClick={() => {
            setMode("signin");
            setError(null);
            setSuccessMsg(null);
          }}
          className={`py-1.5 rounded-lg transition text-center ${
            mode === "signin"
              ? "bg-card text-foreground shadow-xs font-bold border border-border/60"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Sign In
        </button>
        <button
          type="button"
          onClick={() => {
            setMode("signup");
            setError(null);
            setSuccessMsg(null);
          }}
          className={`py-1.5 rounded-lg transition text-center ${
            mode === "signup"
              ? "bg-card text-foreground shadow-xs font-bold border border-border/60"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Create Account
        </button>
      </div>

      {mode === "signin" ? (
        <form onSubmit={handlePasswordLogin} className="space-y-3">
          <Field label="Email / Username" required>
            {(props) => (
              <Input
                {...props}
                type="text"
                autoComplete="username"
                spellCheck={false}
                placeholder="admin or email…"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            )}
          </Field>

          <Field label="Password" required>
            {(props) => (
              <Input
                {...props}
                type="password"
                autoComplete="current-password"
                placeholder="Password…"
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
            Sign In
          </Button>
        </form>
      ) : (
        <form onSubmit={handleSignUp} className="space-y-3">
          <Field label="Full Name / Display Name" required>
            {(props) => (
              <Input
                {...props}
                type="text"
                autoComplete="name"
                placeholder="e.g. Alex Nguyen…"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            )}
          </Field>

          <Field label="Work Email" required>
            {(props) => (
              <Input
                {...props}
                type="email"
                autoComplete="email"
                placeholder="name@company.com…"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            )}
          </Field>

          <Field label="Password" required>
            {(props) => (
              <Input
                {...props}
                type="password"
                autoComplete="new-password"
                placeholder="At least 6 characters…"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            )}
          </Field>

          <Field label="Confirm Password" required>
            {(props) => (
              <Input
                {...props}
                type="password"
                autoComplete="new-password"
                placeholder="Confirm password…"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
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
            Create Account
          </Button>
        </form>
      )}

      {error && (
        <p role="alert" aria-live="assertive" className="text-sm text-destructive font-medium bg-destructive/10 p-2.5 rounded-lg border border-destructive/20">
          {error}
        </p>
      )}

      {successMsg && (
        <p role="status" className="text-sm text-emerald-700 font-medium bg-emerald-50 p-2.5 rounded-lg border border-emerald-200">
          {successMsg}
        </p>
      )}
    </div>
  );
}
