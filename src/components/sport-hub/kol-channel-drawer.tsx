"use client";

import React from "react";
import { ExternalLink, Eye, Star, Share2, Layers, CheckCircle2, TrendingUp, Sparkles, Plus } from "lucide-react";
import { KOL, KOLChannel } from "./types";
import { getKolAggregates } from "@/lib/sport-hub/kol-channels";
import { PlatformIcon, getPlatformBadgeStyle } from "./platform-icon";
import { formatNumber } from "@/lib/i18n";

export interface KolChannelDrawerProps {
  kol: KOL;
  onView360?: (kol: KOL) => void;
  onAddChannel?: (kol: KOL) => void;
  onClose?: () => void;
}

export function KolChannelDrawer({ kol, onView360, onAddChannel, onClose }: KolChannelDrawerProps) {
  const { totalFollowers, totalAvgViews, blendedEr, channels, channelCount } = getKolAggregates(kol);

  return (
    <div className="bg-slate-50/90 border-y border-indigo-100 px-4 sm:px-6 py-4 animate-in fade-in slide-in-from-top-1 duration-150 shadow-inner">
      {/* ─── DRAWER HEADER ─── */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-200/80">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-xs">
            <Layers className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h4 className="text-xs sm:text-sm font-bold text-slate-900">
                Multi-Channel Social Breakdown — <span className="text-indigo-600">{kol.name}</span>
              </h4>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-800 border border-indigo-200">
                {channelCount} {channelCount > 1 ? "Channels" : "Channel"}
              </span>
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Individual channel performance metrics vs. total cross-platform audience footprint
            </p>
          </div>
        </div>

        {/* Aggregate KPI Badges & 360 Action */}
        <div className="flex items-center space-x-2">
          <div className="hidden sm:flex items-center space-x-3 text-xs bg-white px-3 py-1.5 rounded-xl border border-slate-200 shadow-2xs">
            <div>
              <span className="text-slate-400 text-[10px] block uppercase font-medium">Total Audience</span>
              <span className="font-extrabold text-slate-900">{formatNumber(totalFollowers)}</span>
            </div>
            <div className="border-l border-slate-200 pl-3">
              <span className="text-slate-400 text-[10px] block uppercase font-medium">Combined Views</span>
              <span className="font-extrabold text-slate-900">{formatNumber(totalAvgViews)}</span>
            </div>
            <div className="border-l border-slate-200 pl-3">
              <span className="text-slate-400 text-[10px] block uppercase font-medium">Blended ER</span>
              <span className="font-extrabold text-emerald-600">{blendedEr}%</span>
            </div>
          </div>

          {onAddChannel && (
            <button
              type="button"
              onClick={() => onAddChannel(kol)}
              className="px-3 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-semibold border border-indigo-200 transition flex items-center space-x-1.5 shadow-2xs active:scale-95 cursor-pointer"
              title="Add another social channel to this creator"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Channel</span>
            </button>
          )}

          {onView360 && (
            <button
              type="button"
              onClick={() => onView360(kol)}
              className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold transition flex items-center space-x-1.5 shadow-xs active:scale-95 cursor-pointer"
            >
              <Eye className="w-3.5 h-3.5" />
              <span>Full 360° Dossier</span>
            </button>
          )}
        </div>
      </div>

      {/* ─── AUDIENCE SHARE MULTI-COLOR PROGRESS STACK ─── */}
      {channelCount > 1 && totalFollowers > 0 && (
        <div className="my-3.5 bg-white p-3 rounded-xl border border-slate-200 shadow-2xs space-y-1.5">
          <div className="flex items-center justify-between text-[11px] font-semibold text-slate-600">
            <span className="flex items-center space-x-1">
              <Share2 className="w-3 h-3 text-indigo-500" />
              <span>Audience Distribution across Channels</span>
            </span>
            <span className="text-slate-400 text-[10px]">100% cross-platform total</span>
          </div>

          {/* Stacked Progress Bar */}
          <div className="h-2.5 rounded-full overflow-hidden flex bg-slate-100 border border-slate-200/60 shadow-inner">
            {channels.map((ch, idx) => {
              const sharePercent = totalFollowers > 0 ? (ch.followers / totalFollowers) * 100 : 0;
              const style = getPlatformBadgeStyle(ch.platform);
              return (
                <div
                  key={idx}
                  style={{ width: `${Math.max(2, sharePercent)}%` }}
                  className={`h-full ${style.bg} transition-all duration-300 relative group`}
                  title={`${ch.platform}: ${sharePercent.toFixed(1)}% (${formatNumber(ch.followers)} followers)`}
                />
              );
            })}
          </div>

          {/* Legend */}
          <div className="flex items-center space-x-4 pt-1 flex-wrap text-[10px] text-slate-500">
            {channels.map((ch, idx) => {
              const sharePercent = totalFollowers > 0 ? ((ch.followers / totalFollowers) * 100).toFixed(1) : "0";
              const style = getPlatformBadgeStyle(ch.platform);
              return (
                <div key={idx} className="flex items-center space-x-1.5">
                  <span className={`w-2 h-2 rounded-full ${style.bg}`} />
                  <span className="font-semibold text-slate-700">{ch.platform}:</span>
                  <span className="text-slate-500">{sharePercent}% ({formatNumber(ch.followers)})</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ─── CHANNEL METRICS SUB-TABLE ─── */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-2xs">
        <table className="w-full text-left text-xs border-collapse">
          <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase font-bold text-[10px] tracking-wider">
            <tr>
              <th className="py-2 px-3">Platform & Handle</th>
              <th className="py-2 px-3 text-right">Channel Followers</th>
              <th className="py-2 px-3 text-center">Audience Share</th>
              <th className="py-2 px-3 text-right">Avg Views / Post</th>
              <th className="py-2 px-3 text-right">Engagement Rate</th>
              <th className="py-2 px-3 text-center">Status</th>
              <th className="py-2 px-3 text-center">Direct Link</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {channels.map((ch, idx) => {
              const sharePercent = totalFollowers > 0 ? ((ch.followers / totalFollowers) * 100).toFixed(1) : "0";
              const style = getPlatformBadgeStyle(ch.platform);

              return (
                <tr key={idx} className="hover:bg-slate-50/70 transition h-10">
                  {/* Platform & Handle */}
                  <td className="py-2 px-3 whitespace-nowrap">
                    <div className="flex items-center space-x-1.5 max-w-[220px]" title={`${ch.platform} — ${ch.handle || kol.name}`}>
                      <div className={`w-5 h-5 rounded-md ${style.lightBg} ${style.lightText} flex items-center justify-center border border-slate-200 shrink-0`}>
                        <PlatformIcon platform={ch.platform} className="w-3 h-3" />
                      </div>
                      <span className="font-bold text-slate-900 text-xs">{ch.platform}</span>
                      <span className="text-slate-300 shrink-0">·</span>
                      <span className="text-[11px] text-slate-400 truncate">
                        {ch.handle || kol.name}
                      </span>
                      {ch.isPrimary && (
                        <span className="px-1.5 py-0.2 rounded text-[9px] font-extrabold bg-amber-100 text-amber-800 border border-amber-200 shrink-0">
                          Primary
                        </span>
                      )}
                    </div>
                  </td>

                  {/* Followers */}
                  <td className="py-2 px-3 text-right font-extrabold text-slate-900 whitespace-nowrap text-xs">
                    {formatNumber(ch.followers)}
                  </td>

                  {/* Share % */}
                  <td className="py-2 px-3 text-center whitespace-nowrap">
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700">
                      {sharePercent}%
                    </span>
                  </td>

                  {/* Avg Views */}
                  <td className="py-2 px-3 text-right font-semibold text-slate-700 whitespace-nowrap text-xs">
                    {ch.avgViews > 0 ? formatNumber(ch.avgViews) : "—"}
                  </td>

                  {/* ER */}
                  <td className="py-2 px-3 text-right whitespace-nowrap">
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200/60">
                      {ch.er}%
                    </span>
                  </td>

                  {/* Status */}
                  <td className="py-2 px-3 text-center whitespace-nowrap">
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200/60">
                      Active
                    </span>
                  </td>

                  {/* Direct Link */}
                  <td className="py-2 px-3 text-center whitespace-nowrap">
                    {ch.url && ch.url !== "#" ? (
                      <a
                        href={ch.url}
                        target="_blank"
                        rel="noreferrer"
                        className="p-1 rounded-lg text-indigo-600 hover:bg-indigo-50 inline-flex items-center transition"
                        title="Open channel URL"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    ) : (
                      <span className="text-slate-300 text-[10px]">—</span>
                    )}
                  </td>
                </tr>
              );
            })}

            {/* Total Row */}
            {channelCount > 1 && (
              <tr className="bg-indigo-50/40 font-bold border-t border-indigo-100">
                <td className="py-2.5 px-3 text-indigo-950 flex items-center space-x-1.5">
                  <span>TOTAL (Across {channelCount} Channels)</span>
                </td>
                <td className="py-2.5 px-3 text-right text-indigo-950 font-black">
                  {formatNumber(totalFollowers)}
                </td>
                <td className="py-2.5 px-3 text-center text-indigo-700">
                  100%
                </td>
                <td className="py-2.5 px-3 text-right text-indigo-950 font-black">
                  {formatNumber(totalAvgViews)}
                </td>
                <td className="py-2.5 px-3 text-right">
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-300">
                    {blendedEr}% (Blended)
                  </span>
                </td>
                <td className="py-2.5 px-3 text-center text-[10px] text-indigo-700 font-semibold">
                  Aggregated
                </td>
                <td className="py-2.5 px-3 text-center text-slate-400">—</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
