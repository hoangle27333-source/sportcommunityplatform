"use client";

import React from "react";
import { Info } from "lucide-react";

interface ColumnInfoTooltipProps {
  title: string;
  description: string;
  formula?: string;
  align?: "left" | "center" | "right";
}

/**
 * Reusable (i) info icon for table column headers explaining metrics, logic, and formulas.
 * Includes both native OS tooltip and a sleek floating dark card on hover.
 */
export function ColumnInfoTooltip({
  title,
  description,
  formula,
  align = "center",
}: ColumnInfoTooltipProps) {
  const nativeTooltip = `${title}\n${description}${formula ? `\n• Formula: ${formula}` : ""}`;

  return (
    <span
      onClick={(e) => e.stopPropagation()}
      className="relative group/info inline-flex items-center cursor-help select-none align-middle shrink-0"
      title={nativeTooltip}
      aria-label={nativeTooltip}
    >
      <span className="w-3.5 h-3.5 rounded-full bg-slate-100 hover:bg-indigo-50 border border-slate-300/80 group-hover/info:border-indigo-300 flex items-center justify-center transition-colors">
        <Info className="w-2.5 h-2.5 text-slate-400 group-hover/info:text-indigo-600 transition-colors" />
      </span>

      {/* Floating Tooltip Card */}
      <span
        role="tooltip"
        className={`absolute top-full mt-1.5 hidden group-hover/info:block z-50 w-60 p-2.5 bg-slate-900/95 text-white text-[11px] rounded-xl shadow-2xl backdrop-blur-md border border-slate-700/80 pointer-events-none transition-all duration-150 normal-case tracking-normal font-normal text-left ${
          align === "right"
            ? "right-0"
            : align === "left"
            ? "left-0"
            : "left-1/2 -translate-x-1/2"
        }`}
      >
        <span className="flex items-center space-x-1.5 font-bold text-slate-100 text-xs mb-1">
          <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
          <span>{title}</span>
        </span>
        <span className="block text-slate-300 leading-relaxed text-[11px]">
          {description}
        </span>
        {formula && (
          <span className="block mt-2 pt-1.5 border-t border-slate-700/80">
            <span className="block text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-0.5">
              Formula / Logic:
            </span>
            <span className="block bg-slate-800/90 text-amber-300 px-1.5 py-1 rounded font-mono text-[10px] border border-slate-700/60 break-words">
              {formula}
            </span>
          </span>
        )}
      </span>
    </span>
  );
}
