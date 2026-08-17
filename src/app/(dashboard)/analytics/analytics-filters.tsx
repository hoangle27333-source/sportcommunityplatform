"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { cn } from "@/lib/utils/cn";

const PLATFORM_OPTIONS = [
  { value: "", label: "Tất cả" },
  { value: "facebook", label: "Facebook" },
  { value: "instagram", label: "Instagram" },
];

const DATE_RANGE_OPTIONS = [
  { value: "7d", label: "7 ngày" },
  { value: "14d", label: "14 ngày" },
  { value: "30d", label: "30 ngày" },
  { value: "90d", label: "90 ngày" },
];

export function AnalyticsFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const platform = searchParams.get("platform") ?? "";
  const dateRange = searchParams.get("dateRange") ?? "30d";

  function update(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
      {/* Platform */}
      <div className="flex items-center gap-1.5">
        <span className="text-xs font-medium text-muted-foreground">Nền tảng:</span>
        <div className="flex items-center gap-1 rounded-full bg-muted p-0.5">
          {PLATFORM_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => update("platform", opt.value)}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                platform === opt.value
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Date range */}
      <div className="flex items-center gap-1.5">
        <span className="text-xs font-medium text-muted-foreground">Khoảng thời gian:</span>
        <div className="flex items-center gap-1 rounded-full bg-muted p-0.5">
          {DATE_RANGE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => update("dateRange", opt.value)}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                dateRange === opt.value
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
