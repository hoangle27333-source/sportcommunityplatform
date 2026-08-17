"use client";

import { useState, useId } from "react";
import { useRouter } from "next/navigation";
import { Loader2, PlusCircle } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { Badge } from "@/components/ui/badge";
import { parseProfileUrl } from "@/lib/scraper/url-parser";

const LABEL_OPTIONS = [
  { value: "competitor", label: "Đối thủ" },
  { value: "own", label: "Của mình" },
  { value: "reference", label: "Tham khảo" },
];

export function AddAccountForm() {
  const id = useId();
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [label, setLabel] = useState("competitor");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Real-time platform detection
  const detected = url.trim() ? parseProfileUrl(url) : null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!detected) {
      setError("URL không hợp lệ. Dán đường dẫn Facebook Page hoặc Instagram profile.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/tracked-accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, label }),
      });

      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(json.error ?? "Có lỗi xảy ra.");
        return;
      }

      setUrl("");
      router.refresh();
    } catch {
      setError("Không thể kết nối máy chủ.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-lg border border-border bg-card p-4 shadow-sm"
    >
      <p className="mb-3 text-sm font-medium text-foreground">Thêm tài khoản theo dõi</p>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        {/* URL input */}
        <div className="relative flex-1">
          <input
            id={`${id}-url`}
            type="text"
            required
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
              setError(null);
            }}
            placeholder="https://facebook.com/page-name hoặc https://instagram.com/username"
            className={cn(
              "w-full rounded-md border bg-background px-3 py-2 pr-28 text-sm text-foreground placeholder:text-muted-foreground",
              "focus:outline-none focus:ring-2 focus:ring-primary/50",
              error ? "border-destructive" : "border-border",
            )}
          />
          {/* Live platform badge */}
          {detected && (
            <span className="absolute right-2 top-1/2 -translate-y-1/2">
              <Badge tone={detected.platform === "instagram" ? "danger" : "primary"}>
                {detected.platform === "facebook" ? "Facebook" : "Instagram"}
              </Badge>
            </span>
          )}
        </div>

        {/* Label select */}
        <select
          id={`${id}-label`}
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          className="rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
        >
          {LABEL_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>

        {/* Submit */}
        <button
          type="submit"
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {loading ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <PlusCircle className="size-4" aria-hidden="true" />
          )}
          Thêm theo dõi
        </button>
      </div>

      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
    </form>
  );
}
