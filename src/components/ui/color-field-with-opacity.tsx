"use client";

import * as React from "react";
import { cn } from "@/lib/utils/cn";

function clamp(n: number, min: number, max: number) {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

export function splitHexColorAndOpacity(
  value: string | undefined,
  fallback = "#000000",
): { hex: string; opacity: number } {
  const raw = String(value || "").trim();
  if (/^#[0-9a-fA-F]{8}$/.test(raw)) {
    const alpha = parseInt(raw.slice(7, 9), 16);
    return {
      hex: raw.slice(0, 7).toUpperCase(),
      opacity: clamp(alpha / 255, 0, 1),
    };
  }
  if (/^#[0-9a-fA-F]{6}$/.test(raw)) {
    return { hex: raw.toUpperCase(), opacity: 1 };
  }
  return { hex: fallback.toUpperCase(), opacity: 1 };
}

export function combineHexColorAndOpacity(hex: string, opacity: number): string {
  const safeHex = /^#[0-9a-fA-F]{6}$/.test(hex) ? hex.toUpperCase() : "#000000";
  const safeOpacity = clamp(opacity, 0, 1);
  if (safeOpacity >= 0.999) return safeHex;
  const alpha = Math.round(safeOpacity * 255)
    .toString(16)
    .padStart(2, "0")
    .toUpperCase();
  return `${safeHex}${alpha}`;
}

/**
 * ColorFieldWithOpacity — redesign v2
 *
 * Vertical stack layout to prevent squishing in narrow grid columns:
 *   [Label]
 *   [Color swatch] [opacity %]
 *   [─────────── Opacity slider ─────────────]
 *
 * Slider uses accent-primary color via CSS.
 */
export function ColorFieldWithOpacity({
  label,
  value,
  onChange,
  fallback = "#000000",
  className,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  fallback?: string;
  className?: string;
}) {
  const parsed = splitHexColorAndOpacity(value, fallback);
  const opacityPercent = Math.round(parsed.opacity * 100);

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {/* Label */}
      <span className="text-xs font-semibold text-foreground">{label}</span>

      {/* Row: color swatch + opacity value */}
      <div className="flex items-center gap-2">
        {/* Color picker */}
        <label
          className="relative cursor-pointer"
          title={`Chọn màu: ${label}`}
        >
          <span
            className="block h-8 w-10 rounded-md border border-border shadow-sm"
            style={{ backgroundColor: parsed.hex }}
          />
          <input
            type="color"
            value={parsed.hex}
            onChange={(e) =>
              onChange(combineHexColorAndOpacity(e.target.value, parsed.opacity))
            }
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            aria-label={`Màu ${label}`}
          />
        </label>

        {/* Opacity % badge */}
        <span className="min-w-[2.5rem] rounded-md border border-border bg-muted px-1.5 py-1 text-center text-xs font-medium tabular text-foreground">
          {opacityPercent}%
        </span>
      </div>

      {/* Opacity slider — full width */}
      <div className="flex items-center gap-2">
        <input
          type="range"
          min="0"
          max="100"
          step="1"
          value={opacityPercent}
          onChange={(e) =>
            onChange(
              combineHexColorAndOpacity(parsed.hex, Number(e.target.value) / 100),
            )
          }
          className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-border accent-primary"
          aria-label={`Opacity ${label}`}
          style={{
            // Custom track fill via CSS gradient
            background: `linear-gradient(to right, hsl(var(--primary)) 0%, hsl(var(--primary)) ${opacityPercent}%, hsl(var(--border)) ${opacityPercent}%, hsl(var(--border)) 100%)`,
          }}
        />
      </div>
    </div>
  );
}
