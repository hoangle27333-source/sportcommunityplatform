"use client";

import React, { ReactNode } from "react";

interface ActionTooltipProps {
  label: string;
  children: ReactNode;
  position?: "top" | "bottom";
  align?: "center" | "left" | "right";
  className?: string;
}

/**
 * Instant floating tooltip for table action buttons.
 * Appears instantly on hover with sleek dark styling and pointer arrow.
 */
export function ActionTooltip({
  label,
  children,
  position = "top",
  align = "center",
  className = "",
}: ActionTooltipProps) {
  return (
    <div className={`relative group/acttip inline-flex items-center ${className}`}>
      {children}
      <div
        role="tooltip"
        className={`absolute z-50 px-2 py-1 bg-slate-900/95 text-white text-[10px] font-semibold rounded-md shadow-xl border border-slate-700/80 whitespace-nowrap pointer-events-none opacity-0 group-hover/acttip:opacity-100 transition-all duration-150 ease-out ${
          position === "top"
            ? `bottom-full mb-1.5 ${
                align === "center"
                  ? "left-1/2 -translate-x-1/2"
                  : align === "right"
                  ? "right-0"
                  : "left-0"
              }`
            : `top-full mt-1.5 ${
                align === "center"
                  ? "left-1/2 -translate-x-1/2"
                  : align === "right"
                  ? "right-0"
                  : "left-0"
              }`
        }`}
      >
        <span>{label}</span>
        {/* Subtle arrow pointer */}
        <span
          className={`absolute border-4 border-transparent ${
            position === "top"
              ? `top-full border-t-slate-900/95 ${
                  align === "center"
                    ? "left-1/2 -translate-x-1/2"
                    : align === "right"
                    ? "right-2"
                    : "left-2"
                }`
              : `bottom-full border-b-slate-900/95 ${
                  align === "center"
                    ? "left-1/2 -translate-x-1/2"
                    : align === "right"
                    ? "right-2"
                    : "left-2"
                }`
          }`}
        />
      </div>
    </div>
  );
}
