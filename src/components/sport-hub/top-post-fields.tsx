'use client';
import { useEffect, useState } from 'react';
import { scoutFetch } from '@/lib/apify/scout-client';
import type { ContentFilter } from '@/lib/apify/content-settings';
import { scoutInputClass } from './scout-dialog-frame';
import {
  TrendingUp,
  Calendar,
  SlidersHorizontal,
  Info,
  Check,
  Eye,
  Heart,
  MessageSquare,
  Sparkles,
} from 'lucide-react';

export type TopPostForm = {
  selectionMode?: 'top';
  rankingMode?: 'views-first';
  recentDays: number;
  publishedFrom?: string;
  publishedTo?: string;
  thresholdsEnabled: boolean;
  minViews: number;
  minInteractions: number;
  qualityFilter?: ContentFilter;
};

export function topPostDefaults(criteria: Record<string, any>): TopPostForm {
  return {
    selectionMode: 'top',
    rankingMode: 'views-first',
    recentDays: criteria.recentDays || 7,
    publishedFrom: criteria.publishedFrom,
    publishedTo: criteria.publishedTo,
    qualityFilter: criteria.qualityFilter,
    thresholdsEnabled: criteria.qualityFilter?.enabled ?? criteria.thresholdsEnabled ?? true,
    minViews: criteria.qualityFilter?.minViews ?? criteria.minViews ?? 1000,
    minInteractions: criteria.qualityFilter?.minInteractions ?? criteria.minInteractions ?? 50,
  };
}

const localDate = (iso?: string) => {
  if (!iso) return '';
  const date = new Date(iso);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};

export function validateTopPostDates(value: TopPostForm) {
  if (value.publishedFrom === undefined && value.publishedTo === undefined) return;
  const from = Date.parse(value.publishedFrom || ''), to = Date.parse(value.publishedTo || '');
  if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from || to - from > 30 * 86400000 || to > Date.now() + 60000) {
    throw new Error('Choose a past publication window of up to 30 days.');
  }
}

export function TopPostFields({
  value,
  onChange,
  disabled = false,
}: {
  value: TopPostForm;
  onChange: (value: TopPostForm) => void;
  disabled?: boolean;
}) {
  const custom = value.publishedFrom !== undefined || value.publishedTo !== undefined;

  return (
    <div className="space-y-3 rounded-2xl border border-slate-200/90 bg-white p-3.5 shadow-2xs">
      {/* ─── 1. RANKING PRIORITY STRIP ─── */}
      <div className="bg-slate-50/90 border border-slate-200/80 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <div className="flex items-center space-x-2.5">
          <div className="w-7 h-7 rounded-lg bg-indigo-50 border border-indigo-200/60 flex items-center justify-center text-indigo-600 shrink-0">
            <TrendingUp className="w-3.5 h-3.5" />
          </div>
          <div>
            <div className="flex items-center space-x-1.5">
              <span className="text-xs font-bold text-slate-800">Ranking Priority</span>
              <span className="text-[10px] bg-indigo-100 text-indigo-700 font-bold px-1.5 py-0.2 rounded">
                Views First
              </span>
            </div>
            <p className="text-[11px] text-slate-500">Sorted by highest reach within sample</p>
          </div>
        </div>

        <div className="flex items-center gap-1 flex-wrap text-[11px] font-semibold text-slate-600">
          <span className="px-2 py-0.5 rounded-md bg-white border border-slate-200 shadow-2xs text-slate-800">
            1. Views
          </span>
          <span className="text-slate-300 text-xs">→</span>
          <span className="px-2 py-0.5 rounded-md bg-white border border-slate-200 shadow-2xs text-slate-800">
            2. Likes
          </span>
          <span className="text-slate-300 text-xs">→</span>
          <span className="px-2 py-0.5 rounded-md bg-white border border-slate-200 shadow-2xs text-slate-800">
            3. Comments
          </span>
          <span className="text-slate-300 text-xs">→</span>
          <span className="px-2 py-0.5 rounded-md bg-white border border-slate-200 shadow-2xs text-slate-800">
            4. Shares
          </span>
        </div>
      </div>

      {/* ─── 2. PUBLICATION WINDOW PRESETS ─── */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label className="text-xs font-bold text-slate-700 flex items-center space-x-1.5">
            <Calendar className="w-3.5 h-3.5 text-slate-500" />
            <span>Publication Window</span>
          </label>
          <span className="text-[10px] text-slate-400 font-medium">Past posts up to 30 days</span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
          {[
            { days: 1, label: 'Last 24 hours' },
            { days: 7, label: 'Last 7 days' },
            { days: 30, label: 'Last 30 days' },
            { days: 'custom', label: 'Custom Range' },
          ].map((opt) => {
            const isSelected =
              opt.days === 'custom' ? custom : !custom && value.recentDays === opt.days;
            return (
              <button
                key={String(opt.days)}
                type="button"
                disabled={disabled}
                onClick={() => {
                  if (opt.days === 'custom') {
                    onChange({ ...value, publishedFrom: '', publishedTo: '' });
                  } else {
                    onChange({
                      ...value,
                      recentDays: Number(opt.days),
                      publishedFrom: undefined,
                      publishedTo: undefined,
                    });
                  }
                }}
                className={`py-1.5 px-2 rounded-lg text-xs font-semibold border transition text-center cursor-pointer ${
                  isSelected
                    ? 'bg-slate-900 border-slate-900 text-white shadow-xs font-bold'
                    : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300'
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>

        {custom && (
          <div className="grid gap-3 sm:grid-cols-2 pt-2 bg-slate-50/70 p-3 rounded-xl border border-slate-200/80">
            {(['publishedFrom', 'publishedTo'] as const).map((key, index) => (
              <label key={key} className="text-xs font-medium text-slate-700 space-y-1">
                <span className="block">{index === 0 ? 'Published from' : 'Published to'}</span>
                <input
                  type="datetime-local"
                  required
                  disabled={disabled}
                  className={`${scoutInputClass} text-xs`}
                  value={localDate(value[key] || undefined)}
                  onChange={(e) => {
                    const entered = e.currentTarget.value;
                    onChange({
                      ...value,
                      [key]: entered ? new Date(entered).toISOString() : '',
                    });
                  }}
                  onInput={(e) => {
                    const entered = e.currentTarget.value;
                    onChange({
                      ...value,
                      [key]: entered ? new Date(entered).toISOString() : '',
                    });
                  }}
                />
              </label>
            ))}
            <p className="text-[11px] text-slate-500 sm:col-span-2">
              Select a past window of up to 30 days. Timestamps use your local timezone.
            </p>
          </div>
        )}
      </div>

      {/* ─── 3. TRANSPARENCY NOTICE ─── */}
      <div className="flex items-start space-x-2 p-2.5 rounded-xl bg-blue-50/60 border border-blue-100 text-xs text-blue-900">
        <Info className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
        <p className="text-[11px] leading-relaxed text-blue-800">
          Ranked within collected sample. Posts with verified views rank first; posts with views unavailable appear in an audited group. Missing metrics stay Unknown.
        </p>
      </div>

      {/* ─── 4. QUALITY FILTER (Collapsible) ─── */}
      <QualityFilterFields value={value} onChange={onChange} disabled={disabled} />
    </div>
  );
}

export function QualityFilterFields({
  value,
  onChange,
  disabled = false,
}: {
  value: TopPostForm;
  onChange: (value: TopPostForm) => void;
  disabled?: boolean;
}) {
  const [canEdit, setCanEdit] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let active = true;
    scoutFetch('/api/sport-hub/scout/content-settings')
      .then((r) => r.json())
      .then((result) => {
        if (!active) return;
        if (!result.success) throw new Error(result.error || 'Content settings are unavailable.');
        setCanEdit(result.canEdit);
        if (!value.qualityFilter)
          onChange({
            ...value,
            qualityFilter: result.settings,
            thresholdsEnabled: result.settings.enabled,
            minViews: result.settings.minViews,
            minInteractions: result.settings.minInteractions,
          });
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, []);

  const change = (next: TopPostForm) => {
    setSaved(false);
    onChange({
      ...next,
      qualityFilter: {
        enabled: next.thresholdsEnabled,
        minViews: next.minViews,
        minInteractions: next.minInteractions,
        metricRule: 'views-first',
        policyVersion: 1,
      },
    });
  };

  async function saveDefault() {
    setError('');
    try {
      const response = await scoutFetch('/api/sport-hub/scout/content-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(value.qualityFilter),
      });
      const result = await response.json();
      if (!result.success) throw new Error(result.error);
      setSaved(true);
    } catch (e: any) {
      setError(e.message);
    }
  }

  return (
    <details className="group rounded-xl border border-slate-200/90 bg-slate-50/50 transition">
      <summary className="cursor-pointer p-3 text-xs font-bold text-slate-700 flex items-center justify-between select-none">
        <span className="flex items-center space-x-1.5">
          <SlidersHorizontal className="w-3.5 h-3.5 text-slate-500" />
          <span>Advanced: Quality Thresholds</span>
        </span>
        <span className="text-[11px] font-normal text-slate-500">
          {value.thresholdsEnabled ? 'Active filter' : 'Filter off'}
        </span>
      </summary>

      <div className="p-3 pt-0 space-y-3">
        <label className="flex items-center space-x-2 text-xs font-medium text-slate-700 cursor-pointer">
          <input
            type="checkbox"
            disabled={disabled || !value.qualityFilter}
            checked={value.thresholdsEnabled}
            onChange={(e) => change({ ...value, thresholdsEnabled: e.target.checked })}
            className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300"
          />
          <span>Exclude low-engagement posts</span>
        </label>

        {value.thresholdsEnabled && (
          <div className="grid gap-3 sm:grid-cols-2 pt-1">
            <label className="text-xs text-slate-700 space-y-1">
              <span className="flex items-center space-x-1 text-[11px] font-semibold text-slate-600">
                <Eye className="w-3.5 h-3.5 text-slate-400" />
                <span>Minimum views</span>
              </span>
              <input
                type="number"
                min={1}
                max={1000000000}
                required
                disabled={disabled || !value.qualityFilter}
                className={`${scoutInputClass} text-xs`}
                value={value.minViews}
                onChange={(e) => change({ ...value, minViews: Number(e.target.value) })}
              />
            </label>

            <label className="text-xs text-slate-700 space-y-1">
              <span className="flex items-center space-x-1 text-[11px] font-semibold text-slate-600">
                <Heart className="w-3.5 h-3.5 text-slate-400" />
                <span>Min likes + comments (when views missing)</span>
              </span>
              <input
                type="number"
                min={1}
                max={1000000}
                required
                disabled={disabled || !value.qualityFilter}
                className={`${scoutInputClass} text-xs`}
                value={value.minInteractions}
                onChange={(e) => change({ ...value, minInteractions: Number(e.target.value) })}
              />
            </label>
          </div>
        )}

        <p className="text-[11px] text-slate-500 leading-tight">
          Views take priority. Without views, observed likes + comments are used. Retained items are saved automatically.
        </p>

        {!value.qualityFilter && !error && (
          <p className="text-[11px] text-slate-400">Loading default settings…</p>
        )}

        {canEdit && (
          <div className="pt-1 flex items-center justify-between">
            <button
              type="button"
              disabled={disabled || !value.qualityFilter}
              onClick={saveDefault}
              className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 underline cursor-pointer"
            >
              Save as default for future scouts
            </button>
            {saved && (
              <span role="status" className="text-[11px] text-emerald-700 font-semibold flex items-center space-x-1">
                <Check className="w-3 h-3" />
                <span>Defaults saved</span>
              </span>
            )}
          </div>
        )}

        {error && <p role="alert" className="text-[11px] text-red-700">{error}</p>}
      </div>
    </details>
  );
}
