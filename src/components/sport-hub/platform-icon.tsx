"use client";

import React from "react";
import { Facebook, Instagram, Youtube, Globe, ExternalLink } from "lucide-react";
import { KOLChannel } from "./types";
import { formatNumber } from "@/lib/i18n";

// Custom TikTok SVG Icon
export function TikTokIcon({ className = "w-3.5 h-3.5" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64c.298-.002.595.042.88.13V9.4a6.33 6.33 0 0 0-1-.08A6.34 6.34 0 0 0 3 15.66a6.34 6.34 0 0 0 10.82 4.49 6.3 6.3 0 0 0 1.86-4.48V8.71a8.28 8.28 0 0 0 4.91 1.6V6.86a4.86 4.86 0 0 1-1-.17z" />
    </svg>
  );
}

// Custom Threads SVG Icon
export function ThreadsIcon({ className = "w-3.5 h-3.5" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M12.186 24C5.467 24 0 18.533 0 11.814 0 5.095 5.467 0 12.186 0c6.643 0 11.884 5.215 11.884 11.765 0 .64-.055 1.282-.164 1.908h-4.084c.054-.34.082-.68.082-1.026 0-4.382-3.473-7.925-7.718-7.925-4.246 0-7.718 3.543-7.718 7.925 0 4.382 3.472 7.926 7.718 7.926 2.38 0 4.542-1.127 5.955-3.033l3.076 2.502C18.995 22.378 15.753 24 12.186 24zm-.008-8.728c-1.84 0-3.333-1.493-3.333-3.333 0-1.84 1.493-3.333 3.333-3.333 1.84 0 3.333 1.493 3.333 3.333 0 1.84-1.493 3.333-3.333 3.333z" />
    </svg>
  );
}

export function PlatformIcon({
  platform,
  className,
  size,
}: {
  platform: string;
  className?: string;
  size?: "xs" | "sm" | "md" | "lg";
}) {
  const sizeClass =
    size === "xs"
      ? "w-3 h-3"
      : size === "sm"
      ? "w-3.5 h-3.5"
      : size === "md"
      ? "w-4 h-4"
      : size === "lg"
      ? "w-5 h-5"
      : className || "w-3.5 h-3.5";

  const appliedClass = className && size ? `${sizeClass} ${className}` : (className || sizeClass);
  const norm = (platform || "").toLowerCase();
  if (norm.includes("tiktok") || norm.includes("tik tok")) {
    return <TikTokIcon className={appliedClass} />;
  }
  if (norm.includes("youtube") || norm.includes("yt")) {
    return <Youtube className={appliedClass} />;
  }
  if (norm.includes("facebook") || norm.includes("fb")) {
    return <Facebook className={appliedClass} />;
  }
  if (norm.includes("instagram") || norm.includes("ig")) {
    return <Instagram className={appliedClass} />;
  }
  if (norm.includes("threads")) {
    return <ThreadsIcon className={appliedClass} />;
  }
  if (norm.includes("strava")) {
    return (
      <svg className={appliedClass} viewBox="0 0 24 24" fill="currentColor">
        <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0l-7.23 14.173h4.172" />
      </svg>
    );
  }
  if (norm.includes("zalo")) {
    return (
      <span className={`font-black text-[10px] tracking-tighter leading-none select-none ${appliedClass}`}>
        Z
      </span>
    );
  }
  if (norm.includes("telegram")) {
    return (
      <svg className={appliedClass} viewBox="0 0 24 24" fill="currentColor">
        <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
      </svg>
    );
  }
  return <Globe className={appliedClass} />;
}

export function getPlatformBadgeStyle(platform: string) {
  const norm = (platform || "").toLowerCase();
  if (norm.includes("tiktok")) {
    return {
      bg: "bg-slate-900",
      text: "text-white",
      border: "border-slate-800",
      hoverBg: "hover:bg-slate-800",
      lightBg: "bg-slate-100",
      lightText: "text-slate-900",
      ring: "ring-slate-900",
      accent: "#000000",
    };
  }
  if (norm.includes("youtube")) {
    return {
      bg: "bg-red-600",
      text: "text-white",
      border: "border-red-500",
      hoverBg: "hover:bg-red-700",
      lightBg: "bg-red-50",
      lightText: "text-red-700",
      ring: "ring-red-500",
      accent: "#FF0000",
    };
  }
  if (norm.includes("facebook")) {
    return {
      bg: "bg-blue-600",
      text: "text-white",
      border: "border-blue-500",
      hoverBg: "hover:bg-blue-700",
      lightBg: "bg-blue-50",
      lightText: "text-blue-700",
      ring: "ring-blue-500",
      accent: "#1877F2",
    };
  }
  if (norm.includes("instagram")) {
    return {
      bg: "bg-gradient-to-tr from-amber-500 via-rose-500 to-purple-600",
      text: "text-white",
      border: "border-rose-400",
      hoverBg: "hover:opacity-90",
      lightBg: "bg-fuchsia-50",
      lightText: "text-fuchsia-700",
      ring: "ring-pink-500",
      accent: "#E1306C",
    };
  }
  if (norm.includes("threads")) {
    return {
      bg: "bg-slate-900",
      text: "text-white",
      border: "border-slate-700",
      hoverBg: "hover:bg-slate-800",
      lightBg: "bg-slate-100",
      lightText: "text-slate-800",
      ring: "ring-slate-700",
      accent: "#101010",
    };
  }
  if (norm.includes("strava")) {
    return {
      bg: "bg-[#FC4C02]",
      text: "text-white",
      border: "border-orange-500",
      hoverBg: "hover:bg-[#E34402]",
      lightBg: "bg-orange-50",
      lightText: "text-orange-700",
      ring: "ring-orange-500",
      accent: "#FC4C02",
    };
  }
  if (norm.includes("zalo")) {
    return {
      bg: "bg-blue-500",
      text: "text-white",
      border: "border-blue-400",
      hoverBg: "hover:bg-blue-600",
      lightBg: "bg-blue-50",
      lightText: "text-blue-700",
      ring: "ring-blue-400",
      accent: "#0068FF",
    };
  }
  if (norm.includes("telegram")) {
    return {
      bg: "bg-sky-500",
      text: "text-white",
      border: "border-sky-400",
      hoverBg: "hover:bg-sky-600",
      lightBg: "bg-sky-50",
      lightText: "text-sky-700",
      ring: "ring-sky-400",
      accent: "#229ED9",
    };
  }

  return {
    bg: "bg-slate-600",
    text: "text-white",
    border: "border-slate-500",
    hoverBg: "hover:bg-slate-700",
    lightBg: "bg-slate-50",
    lightText: "text-slate-700",
    ring: "ring-slate-400",
    accent: "#64748B",
  };
}

/**
 * Renders multiple connected channels as a sleek single-line cluster of icons with tooltips
 */
export function MultiChannelCluster({
  channels = [],
  onSelectChannel,
  maxDisplay = 4,
}: {
  channels: KOLChannel[];
  onSelectChannel?: (channel: KOLChannel) => void;
  maxDisplay?: number;
}) {
  if (!channels || channels.length === 0) {
    return <span className="text-slate-400 text-xs">—</span>;
  }

  // Sort channels so primary is first, then by followers descending
  const sorted = [...channels].sort((a, b) => {
    if (a.isPrimary && !b.isPrimary) return -1;
    if (!a.isPrimary && b.isPrimary) return 1;
    return (b.followers || 0) - (a.followers || 0);
  });

  const visible = sorted.slice(0, maxDisplay);
  const hiddenCount = sorted.length - visible.length;

  return (
    <div className="flex items-center space-x-1 flex-nowrap whitespace-nowrap">
      {visible.map((ch, idx) => {
        const style = getPlatformBadgeStyle(ch.platform);
        const isPrimaryAndMulti = ch.isPrimary && channels.length > 1;

        return (
          <button
            key={idx}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (onSelectChannel) {
                onSelectChannel(ch);
              } else if (ch.url && ch.url !== "#") {
                window.open(ch.url, "_blank");
              }
            }}
            title={`${ch.platform}${isPrimaryAndMulti ? " (Primary Channel)" : ""}: ${ch.handle || "Connected"}${
              ch.followers ? ` · ${formatNumber(ch.followers)} followers` : ""
            }${ch.er ? ` · ${ch.er}% ER` : ""}`}
            className={`w-6 h-6 rounded-md ${style.lightBg} ${style.lightText} flex items-center justify-center border transition shadow-2xs shrink-0 cursor-pointer hover:scale-110 active:scale-95 ${
              isPrimaryAndMulti
                ? "border-amber-300 ring-1 ring-amber-400/70"
                : "border-slate-200/80 hover:border-slate-300"
            }`}
          >
            <PlatformIcon platform={ch.platform} className="w-3.5 h-3.5" />
          </button>
        );
      })}

      {hiddenCount > 0 && (
        <span
          onClick={(e) => {
            e.stopPropagation();
            if (onSelectChannel) onSelectChannel(sorted[0]);
          }}
          className="text-[10px] font-bold text-slate-500 bg-slate-100 hover:bg-slate-200 px-1.5 py-0.5 rounded-md border border-slate-200 cursor-pointer shrink-0"
          title={`${hiddenCount} more channel${hiddenCount > 1 ? "s" : ""}: ${sorted
            .slice(maxDisplay)
            .map((c) => c.platform)
            .join(", ")}`}
        >
          +{hiddenCount}
        </span>
      )}
    </div>
  );
}

/**
 * Interactive Channel Pill for Header and Cards
 */
export function ChannelPill({
  channel,
  active = false,
  onClick,
}: {
  channel: KOLChannel;
  active?: boolean;
  onClick?: () => void;
}) {
  const style = getPlatformBadgeStyle(channel.platform);

  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-2.5 py-1 rounded-xl text-xs font-semibold transition flex items-center space-x-1.5 border cursor-pointer ${
        active
          ? `${style.bg} ${style.text} shadow-sm border-transparent`
          : `${style.lightBg} ${style.lightText} border-slate-200 hover:border-slate-300`
      }`}
    >
      <PlatformIcon platform={channel.platform} className="w-3.5 h-3.5" />
      <span>{channel.platform}</span>
      <span className="opacity-80 text-[11px]">({formatNumber(channel.followers)})</span>
    </button>
  );
}
