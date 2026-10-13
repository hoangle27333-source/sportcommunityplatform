'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Users,
  Search,
  Filter,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  RefreshCw,
  Flame,
  Clock,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  X,
  Calendar,
  Layers,
  Sparkles,
  SlidersHorizontal,
} from 'lucide-react';
import { ScoutDialogFrame, scoutButtonClass, scoutInputClass } from './scout-dialog-frame';
import { PlatformIcon } from './platform-icon';
import { t, formatNumber } from '@/lib/i18n';
import { scoutFetch } from '@/lib/apify/scout-client';

export type ScoutPickerChannel = {
  url: string;
  platform: 'Instagram' | 'Facebook' | 'TikTok' | 'Unsupported' | string;
  available: boolean;
  reason?: string;
};

export type ScoutPickerAccount = {
  entityType: 'kol' | 'community';
  id: string;
  name: string;
  sport: string[];
  geography: string;
  urls: string[];
  channels: ScoutPickerChannel[];
};

export interface AccountPostScoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (result?: any) => void;
  initialCriteria?: Record<string, any>;
  preselectedAccount?: { entityType: 'kol' | 'community'; id: string };
  resumeSessionId?: string;
  source?: string;
}

export function AccountPostScoutModal({
  isOpen,
  onClose,
  onSuccess,
  initialCriteria = {},
  preselectedAccount,
  resumeSessionId,
  source = '/trending',
}: AccountPostScoutModalProps) {
  // Navigation & Step: 1 = Account Selection, 2 = Plan Review, 3 = Running / Progress, 4 = Completed
  const [step, setStep] = useState<1 | 2 | 3 | 4>(resumeSessionId ? 3 : 1);

  // Accounts registry
  const [accounts, setAccounts] = useState<ScoutPickerAccount[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [accountsError, setAccountsError] = useState('');

  // Search & Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [entityTypeFilter, setEntityTypeFilter] = useState<'all' | 'kol' | 'community'>('all');
  const [sportFilter, setSportFilter] = useState('all');
  const [platformFilter, setPlatformFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 15;

  // Expanded accounts (for viewing individual channels)
  const [expandedAccounts, setExpandedAccounts] = useState<Set<string>>(new Set());

  // Selection Map: Key is `${entityType}:${id}`, Value is array of selected channel URLs
  const [selectedAccounts, setSelectedAccounts] = useState<
    Map<string, { entityType: 'kol' | 'community'; id: string; name: string; channelUrls: string[] }>
  >(new Map());

  // Configuration / Criteria
  const [mode, setMode] = useState<'latest' | 'top'>((initialCriteria.mode as any) || 'latest');
  const [recentDays, setRecentDays] = useState<number>(Number(initialCriteria.recentDays) || 7);
  const [isCustomWindow, setIsCustomWindow] = useState(
    Boolean(initialCriteria.publishedFrom && initialCriteria.publishedTo)
  );
  const [customFrom, setCustomFrom] = useState(
    initialCriteria.publishedFrom
      ? new Date(initialCriteria.publishedFrom).toISOString().slice(0, 16)
      : new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 16)
  );
  const [customTo, setCustomTo] = useState(
    initialCriteria.publishedTo
      ? new Date(initialCriteria.publishedTo).toISOString().slice(0, 16)
      : new Date().toISOString().slice(0, 16)
  );
  const [limitPerAccount, setLimitPerAccount] = useState<number>(
    Number(initialCriteria.limitPerAccount) || 10
  );

  // Quality Filter (Default disabled)
  const [qualityFilterEnabled, setQualityFilterEnabled] = useState(
    Boolean(initialCriteria.qualityFilter?.enabled)
  );
  const [minViews, setMinViews] = useState<number>(
    Number(initialCriteria.qualityFilter?.minViews) || 1000
  );
  const [minInteractions, setMinInteractions] = useState<number>(
    Number(initialCriteria.qualityFilter?.minInteractions) || 50
  );
  const [metricRule, setMetricRule] = useState<'views-first' | 'interactions-first'>(
    initialCriteria.qualityFilter?.metricRule || 'views-first'
  );

  // Plan State
  const [planning, setPlanning] = useState(false);
  const [plan, setPlan] = useState<any>(null);
  const [planError, setPlanError] = useState('');

  // Execution & Progress State
  const [sessionId, setSessionId] = useState<string | null>(resumeSessionId || null);
  const [startingScout, setStartingScout] = useState(false);
  const [sessionProgress, setSessionProgress] = useState<any>(null);
  const [sessionResult, setSessionResult] = useState<any>(null);
  const [sessionStatus, setSessionStatus] = useState<'pending' | 'running' | 'complete' | 'failed'>(
    resumeSessionId ? 'running' : 'pending'
  );
  const [executionError, setExecutionError] = useState('');

  // Load accounts from API
  const loadAccounts = useCallback(async () => {
    setLoadingAccounts(true);
    setAccountsError('');
    try {
      const res = await scoutFetch('/api/sport-hub/scout/accounts');
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to load eligible accounts.');
      }
      const fetched: ScoutPickerAccount[] = data.accounts || [];
      setAccounts(fetched);

      // If preselectedAccount was passed, select it
      if (preselectedAccount) {
        const found = fetched.find(
          a => a.entityType === preselectedAccount.entityType && a.id === preselectedAccount.id
        );
        if (found) {
          const eligibleUrls = found.channels.filter(c => c.available).map(c => c.url);
          if (eligibleUrls.length > 0) {
            setSelectedAccounts(
              new Map([
                [
                  `${found.entityType}:${found.id}`,
                  {
                    entityType: found.entityType,
                    id: found.id,
                    name: found.name,
                    channelUrls: eligibleUrls,
                  },
                ],
              ])
            );
          }
        }
      }
    } catch (err: any) {
      setAccountsError(err.message || 'Unable to load accounts.');
    } finally {
      setLoadingAccounts(false);
    }
  }, [preselectedAccount]);

  useEffect(() => {
    if (isOpen && !resumeSessionId) {
      void loadAccounts();
    }
  }, [isOpen, loadAccounts, resumeSessionId]);

  // Extract available sports from accounts
  const availableSports = useMemo(() => {
    const set = new Set<string>();
    accounts.forEach(a => {
      (a.sport || []).forEach(s => {
        if (s && s.trim()) set.add(s.trim());
      });
    });
    return Array.from(set).sort();
  }, [accounts]);

  // Filtered Accounts
  const filteredAccounts = useMemo(() => {
    return accounts.filter(account => {
      const matchType =
        entityTypeFilter === 'all' || account.entityType === entityTypeFilter;

      const matchSearch =
        !searchQuery.trim() ||
        account.name.toLowerCase().includes(searchQuery.trim().toLowerCase()) ||
        account.urls.some(u => u.toLowerCase().includes(searchQuery.trim().toLowerCase()));

      const matchSport =
        sportFilter === 'all' ||
        (account.sport || []).some(s => s.toLowerCase() === sportFilter.toLowerCase());

      const matchPlatform =
        platformFilter === 'all' ||
        account.channels.some(
          c => c.platform.toLowerCase() === platformFilter.toLowerCase() && c.available
        );

      return matchType && matchSearch && matchSport && matchPlatform;
    });
  }, [accounts, entityTypeFilter, searchQuery, sportFilter, platformFilter]);

  // Pagination for filtered accounts
  const totalPages = Math.max(1, Math.ceil(filteredAccounts.length / pageSize));
  const paginatedAccounts = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredAccounts.slice(start, start + pageSize);
  }, [filteredAccounts, currentPage, pageSize]);

  // Reset page when filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, entityTypeFilter, sportFilter, platformFilter]);

  // Toggle Account Selection
  const toggleAccount = (account: ScoutPickerAccount) => {
    const key = `${account.entityType}:${account.id}`;
    setSelectedAccounts(prev => {
      const next = new Map(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        const eligibleUrls = account.channels.filter(c => c.available).map(c => c.url);
        if (eligibleUrls.length === 0) return next;
        if (next.size >= 1000) {
          alert('Account selection is bounded to 1,000 unique accounts per batch request.');
          return next;
        }
        next.set(key, {
          entityType: account.entityType,
          id: account.id,
          name: account.name,
          channelUrls: eligibleUrls,
        });
      }
      return next;
    });
  };

  // Toggle Specific Channel Selection
  const toggleChannel = (account: ScoutPickerAccount, channelUrl: string) => {
    const key = `${account.entityType}:${account.id}`;
    setSelectedAccounts(prev => {
      const next = new Map(prev);
      const existing = next.get(key);
      if (existing) {
        let updatedUrls: string[];
        if (existing.channelUrls.includes(channelUrl)) {
          updatedUrls = existing.channelUrls.filter(u => u !== channelUrl);
        } else {
          updatedUrls = [...existing.channelUrls, channelUrl];
        }
        if (updatedUrls.length === 0) {
          next.delete(key);
        } else {
          next.set(key, { ...existing, channelUrls: updatedUrls });
        }
      } else {
        if (next.size >= 1000) {
          alert('Account selection is bounded to 1,000 unique accounts per batch request.');
          return next;
        }
        next.set(key, {
          entityType: account.entityType,
          id: account.id,
          name: account.name,
          channelUrls: [channelUrl],
        });
      }
      return next;
    });
  };

  // Select All Matching Accounts (Across ALL pages of current filtered set)
  const isAllMatchingSelected = useMemo(() => {
    if (filteredAccounts.length === 0) return false;
    const eligibleFiltered = filteredAccounts.filter(a => a.channels.some(c => c.available));
    if (eligibleFiltered.length === 0) return false;
    return eligibleFiltered.every(a => selectedAccounts.has(`${a.entityType}:${a.id}`));
  }, [filteredAccounts, selectedAccounts]);

  const selectAllMatching = () => {
    setSelectedAccounts(prev => {
      const next = new Map(prev);
      const eligibleFiltered = filteredAccounts.filter(a => a.channels.some(c => c.available));

      if (isAllMatchingSelected) {
        // Deselect matching
        eligibleFiltered.forEach(a => next.delete(`${a.entityType}:${a.id}`));
      } else {
        // Select matching up to 1,000
        let reachedLimit = false;
        for (const a of eligibleFiltered) {
          const key = `${a.entityType}:${a.id}`;
          if (!next.has(key)) {
            if (next.size >= 1000) {
              reachedLimit = true;
              break;
            }
            const urls = a.channels.filter(c => c.available).map(c => c.url);
            if (urls.length > 0) {
              next.set(key, {
                entityType: a.entityType,
                id: a.id,
                name: a.name,
                channelUrls: urls,
              });
            }
          }
        }
        if (reachedLimit) {
          alert('Bounded to 1,000 unique accounts per request. Some accounts were not added.');
        }
      }
      return next;
    });
  };

  // Clear selection
  const clearSelection = () => {
    setSelectedAccounts(new Map());
  };

  // Total selected accounts and channels count
  const totalSelectedAccounts = selectedAccounts.size;
  const totalSelectedChannels = useMemo(() => {
    let count = 0;
    selectedAccounts.forEach(a => {
      count += a.channelUrls.length;
    });
    return count;
  }, [selectedAccounts]);

  // Request Batch Plan from Backend
  const handleGeneratePlan = async () => {
    if (totalSelectedAccounts === 0) return;
    setPlanning(true);
    setPlanError('');
    setPlan(null);

    try {
      const accountsPayload = Array.from(selectedAccounts.values()).map(a => ({
        entityType: a.entityType,
        id: a.id,
        channelUrls: a.channelUrls,
      }));

      const body: Record<string, any> = {
        kind: 'account-posts',
        accounts: accountsPayload,
        mode,
        limitPerAccount,
        qualityFilter: {
          enabled: qualityFilterEnabled,
          minViews,
          minInteractions,
          metricRule,
          policyVersion: 1,
        },
      };

      if (isCustomWindow) {
        const fromIso = new Date(customFrom).toISOString();
        const toIso = new Date(customTo).toISOString();
        const duration = Date.parse(toIso) - Date.parse(fromIso);
        if (duration <= 0 || duration > 30 * 86400000 || Date.parse(toIso) > Date.now() + 60000) {
          throw new Error('Choose a past publication window of up to 30 days.');
        }
        body.publishedFrom = fromIso;
        body.publishedTo = toIso;
      } else {
        body.recentDays = recentDays;
      }

      const res = await scoutFetch('/api/sport-hub/scout/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        if (data.code === 'PLAN_STALE') {
          throw new Error('The plan is stale. Preserving selections; please request a new plan.');
        }
        if (data.code === 'POST_WORKSPACE_SCHEMA_UNAVAILABLE') {
          throw new Error('Posts workspaces require the database migration. No collection was started.');
        }
        throw new Error(data.error || 'Failed to generate batch scout plan.');
      }

      setPlan(data.plan);
      setStep(2);
    } catch (err: any) {
      setPlanError(err.message || 'Error generating batch plan.');
    } finally {
      setPlanning(false);
    }
  };

  // Start Scout Batch Execution
  const handleStartScout = async () => {
    if (!plan || !plan.hash) {
      setPlanError('A reviewed batch plan is required before starting collection.');
      return;
    }

    setStartingScout(true);
    setExecutionError('');

    try {
      const payload = {
        ...plan.criteria,
        planHash: plan.hash,
        uiContext: { source },
      };

      const res = await scoutFetch('/api/sport-hub/scout/account-posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        if (data.code === 'PLAN_STALE') {
          setStep(1);
          throw new Error('The plan has expired. Please review and generate a new plan.');
        }
        if (data.code === 'POST_WORKSPACE_SCHEMA_UNAVAILABLE') {
          throw new Error('Posts workspaces require the database migration. No collection was started.');
        }
        throw new Error(data.error || 'Failed to start account posts collection.');
      }

      if (data.sessionId) {
        setSessionId(data.sessionId);
        setSessionStatus('running');
        setStep(3);
      } else if (data.posts) {
        // Immediate completion
        setSessionResult(data);
        setSessionStatus('complete');
        setStep(4);
      }
    } catch (err: any) {
      setExecutionError(err.message || 'Error starting scout task.');
    } finally {
      setStartingScout(false);
    }
  };

  // Durable Polling for Running Session
  useEffect(() => {
    if (!sessionId || step !== 3) return;

    let cancelled = false;
    let timer: NodeJS.Timeout;

    const poll = async () => {
      try {
        const res = await fetch(`/api/sport-hub/scout?sessionId=${encodeURIComponent(sessionId)}`);
        const data = await res.json();
        if (cancelled) return;

        if (res.ok && data.success) {
          if (data.progress) {
            setSessionProgress(data.progress);
          }

          if (data.status === 'complete' || (data.status === 'failed' && !data.pending)) {
            setSessionStatus(data.status);
            setSessionResult(data);
            setStep(4);
            if (data.status === 'complete') {
              window.dispatchEvent(new CustomEvent('sport-hub-data-changed'));
              onSuccess?.(data);
            }
            return;
          }
        }
      } catch (err: any) {
        console.error('Scout polling error:', err);
      }

      if (!cancelled) {
        timer = setTimeout(poll, 2000);
      }
    };

    void poll();

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [sessionId, step, onSuccess]);

  if (!isOpen) return null;

  return (
    <ScoutDialogFrame
      title={
        step === 1
          ? 'Scout Account Posts'
          : step === 2
          ? 'Review Batch Scout Plan'
          : step === 3
          ? 'Collecting Account Posts...'
          : 'Batch Collection Completed'
      }
      description={
        step === 1
          ? 'Collect public posts from saved KOLs & Creators or Communities & Clubs across connected channels.'
          : step === 2
          ? 'Review the verified batch budget, eligible accounts, and channel exclusions before launching.'
          : step === 3
          ? 'Cloud workers are processing your batch in the background. You can close this window at any time.'
          : 'Review the collected posts and account results below.'
      }
      onClose={onClose}
      wide
    >
      {/* ─── STEP 1: ACCOUNT SELECTION & SETTINGS ─── */}
      {step === 1 && (
        <div className="space-y-6">
          {accountsError && (
            <div role="alert" className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 flex items-start space-x-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-semibold">{accountsError}</p>
                <button
                  type="button"
                  onClick={loadAccounts}
                  className="mt-1 text-red-600 underline font-semibold hover:text-red-800"
                >
                  Retry Loading Accounts
                </button>
              </div>
            </div>
          )}

          {planError && (
            <div role="alert" className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 flex items-start space-x-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <p className="font-semibold leading-relaxed">{planError}</p>
            </div>
          )}

          {/* 1. Mode & Date & Limit Settings */}
          <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-2xs space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
              <div className="flex items-center space-x-2">
                <SlidersHorizontal className="w-4 h-4 text-indigo-600" />
                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                  Collection Configuration
                </h3>
              </div>

              {/* Mode Toggle: Latest vs Top */}
              <div className="inline-flex rounded-xl border border-slate-200 p-1 bg-slate-50 gap-1 text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setMode('latest')}
                  className={`px-3 py-1.5 rounded-lg transition ${
                    mode === 'latest'
                      ? 'bg-white text-indigo-700 shadow-xs border border-slate-200/80'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Latest Posts
                </button>
                <button
                  type="button"
                  onClick={() => setMode('top')}
                  className={`px-3 py-1.5 rounded-lg flex items-center space-x-1.5 transition ${
                    mode === 'top'
                      ? 'bg-white text-amber-700 shadow-xs border border-slate-200/80'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Flame className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
                  <span>Top Posts</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
              {/* Time Window */}
              <div>
                <label className="block font-bold text-slate-700 mb-1.5 flex items-center justify-between">
                  <span>Time Window</span>
                  <button
                    type="button"
                    onClick={() => setIsCustomWindow(!isCustomWindow)}
                    className="text-indigo-600 hover:underline font-normal text-[11px]"
                  >
                    {isCustomWindow ? 'Use Presets' : 'Custom Dates'}
                  </button>
                </label>
                {isCustomWindow ? (
                  <div className="space-y-1.5">
                    <input
                      type="datetime-local"
                      value={customFrom}
                      onChange={e => setCustomFrom(e.target.value)}
                      className={`${scoutInputClass} text-[11px]`}
                      title="Published From (Local time)"
                    />
                    <input
                      type="datetime-local"
                      value={customTo}
                      onChange={e => setCustomTo(e.target.value)}
                      className={`${scoutInputClass} text-[11px]`}
                      title="Published To (Local time)"
                    />
                  </div>
                ) : (
                  <select
                    value={recentDays}
                    onChange={e => setRecentDays(Number(e.target.value))}
                    className={scoutInputClass}
                  >
                    <option value={7}>Last 7 days (Default)</option>
                    <option value={14}>Last 14 days</option>
                    <option value={30}>Last 30 days (Max)</option>
                  </select>
                )}
              </div>

              {/* Limit per account */}
              <div>
                <label className="block font-bold text-slate-700 mb-1.5">
                  Posts Limit per Account
                </label>
                <div className="flex items-center space-x-2">
                  <input
                    type="number"
                    min={1}
                    max={50}
                    value={limitPerAccount}
                    onChange={e =>
                      setLimitPerAccount(Math.max(1, Math.min(50, Number(e.target.value) || 1)))
                    }
                    className={scoutInputClass}
                  />
                  <span className="text-slate-400 text-xs shrink-0">1–50</span>
                </div>
                <p className="text-[10px] text-slate-400 mt-1">
                  Bounded to 50 posts per account per batch run.
                </p>
              </div>

              {/* Quality Filter Toggle */}
              <div>
                <label className="block font-bold text-slate-700 mb-1.5 flex items-center justify-between">
                  <span>Quality Filter</span>
                  <span className="text-[10px] text-slate-400">Optional</span>
                </label>
                <div className="flex items-center space-x-2 h-9">
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={qualityFilterEnabled}
                      onChange={e => setQualityFilterEnabled(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600"></div>
                  </label>
                  <span className="text-xs text-slate-600 font-medium">
                    {qualityFilterEnabled ? 'Filter enabled' : 'Disabled (Default)'}
                  </span>
                </div>
              </div>
            </div>

            {/* Quality Filter Options (if enabled) */}
            {qualityFilterEnabled && (
              <div className="p-3 bg-indigo-50/50 rounded-xl border border-indigo-100 text-xs grid grid-cols-1 sm:grid-cols-3 gap-3 mt-2">
                <div>
                  <label className="block text-[11px] font-semibold text-indigo-950 mb-1">
                    Min Views
                  </label>
                  <input
                    type="number"
                    min={0}
                    step={500}
                    value={minViews}
                    onChange={e => setMinViews(Math.max(0, Number(e.target.value) || 0))}
                    className={scoutInputClass}
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-indigo-950 mb-1">
                    Min Interactions
                  </label>
                  <input
                    type="number"
                    min={0}
                    step={10}
                    value={minInteractions}
                    onChange={e => setMinInteractions(Math.max(0, Number(e.target.value) || 0))}
                    className={scoutInputClass}
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-indigo-950 mb-1">
                    Metric Priority
                  </label>
                  <select
                    value={metricRule}
                    onChange={e => setMetricRule(e.target.value as any)}
                    className={scoutInputClass}
                  >
                    <option value="views-first">Views First</option>
                    <option value="interactions-first">Interactions First</option>
                  </select>
                </div>
              </div>
            )}
          </div>

          {/* 2. Account Picker: Search & Filters */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2.5">
              <div className="flex items-center space-x-2">
                <Users className="w-4 h-4 text-indigo-600" />
                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                  Select Accounts ({accounts.length} available)
                </h3>
              </div>

              {/* Selection Summary Pill */}
              <div className="flex items-center space-x-2 text-xs">
                <span className="font-extrabold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2.5 py-1 rounded-full">
                  {totalSelectedAccounts.toLocaleString('en-US')} accounts selected ({totalSelectedChannels} channels)
                </span>
                {totalSelectedAccounts > 0 && (
                  <button
                    type="button"
                    onClick={clearSelection}
                    className="text-slate-500 hover:text-slate-800 font-medium underline cursor-pointer"
                  >
                    Clear selection
                  </button>
                )}
              </div>
            </div>

            {/* Filter Bar */}
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 text-xs">
              <div className="relative sm:col-span-1">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Search account name or URL..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className={`${scoutInputClass} pl-8`}
                />
              </div>

              <div>
                <select
                  value={entityTypeFilter}
                  onChange={e => setEntityTypeFilter(e.target.value as any)}
                  className={scoutInputClass}
                >
                  <option value="all">All Types</option>
                  <option value="kol">KOLs & Creators</option>
                  <option value="community">Communities & Clubs</option>
                </select>
              </div>

              <div>
                <select
                  value={sportFilter}
                  onChange={e => setSportFilter(e.target.value)}
                  className={scoutInputClass}
                >
                  <option value="all">All Sports</option>
                  {availableSports.map(s => (
                    <option key={s} value={s}>
                      {t(s)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <select
                  value={platformFilter}
                  onChange={e => setPlatformFilter(e.target.value)}
                  className={scoutInputClass}
                >
                  <option value="all">All Platforms</option>
                  <option value="Instagram">Instagram</option>
                  <option value="Facebook">Facebook</option>
                  <option value="TikTok">TikTok</option>
                </select>
              </div>
            </div>

            {/* Select All Matching Bar */}
            <div className="flex items-center justify-between bg-slate-100/80 px-3 py-2 rounded-xl text-xs text-slate-700">
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={selectAllMatching}
                  disabled={filteredAccounts.length === 0}
                  className="font-bold text-indigo-600 hover:text-indigo-800 cursor-pointer disabled:opacity-50"
                >
                  {isAllMatchingSelected
                    ? `Deselect All ${filteredAccounts.length} Matching Accounts`
                    : `Select All ${filteredAccounts.length} Matching Accounts`}
                </button>
                <span className="text-slate-400">·</span>
                <span className="text-[11px] text-slate-500">
                  Selects across all pages of current filter
                </span>
              </div>
              <span className="text-slate-500 text-[11px]">
                Showing {paginatedAccounts.length} of {filteredAccounts.length} accounts
              </span>
            </div>

            {/* Account List */}
            {loadingAccounts ? (
              <div className="py-12 flex flex-col items-center justify-center space-y-2">
                <RefreshCw className="w-6 h-6 animate-spin text-indigo-600" />
                <p className="text-xs text-slate-500">Loading accounts and channels...</p>
              </div>
            ) : filteredAccounts.length === 0 ? (
              <div className="py-10 text-center bg-white rounded-2xl border border-dashed border-slate-200">
                <Users className="w-8 h-8 mx-auto text-slate-300 mb-2" />
                <p className="text-xs font-semibold text-slate-600">No matching accounts found.</p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Try adjusting your search or filters.
                </p>
              </div>
            ) : (
              <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
                {paginatedAccounts.map(account => {
                  const key = `${account.entityType}:${account.id}`;
                  const isSelected = selectedAccounts.has(key);
                  const selectedData = selectedAccounts.get(key);
                  const selectedChannelUrls = selectedData?.channelUrls || [];
                  const isExpanded = expandedAccounts.has(key);
                  const hasEligibleChannels = account.channels.some(c => c.available);

                  return (
                    <div
                      key={key}
                      className={`p-3 rounded-xl border transition ${
                        isSelected
                          ? 'border-indigo-300 bg-indigo-50/20'
                          : 'border-slate-200 bg-white hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center space-x-3 min-w-0">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            disabled={!hasEligibleChannels}
                            onChange={() => toggleAccount(account)}
                            className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 w-4 h-4 cursor-pointer disabled:opacity-40"
                          />
                          <div className="min-w-0">
                            <div className="flex items-center space-x-2">
                              <span className="text-xs font-bold text-slate-900 truncate">
                                {account.name}
                              </span>
                              <span
                                className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                                  account.entityType === 'kol'
                                    ? 'bg-blue-50 text-blue-700 border border-blue-200'
                                    : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                }`}
                              >
                                {account.entityType === 'kol' ? 'Creator' : 'Community'}
                              </span>
                              {(account.sport || []).slice(0, 2).map(s => (
                                <span
                                  key={s}
                                  className="text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded hidden sm:inline"
                                >
                                  {t(s)}
                                </span>
                              ))}
                            </div>

                            {/* Connected Channels Pill Strip */}
                            <div className="flex flex-wrap items-center gap-1.5 mt-1">
                              {account.channels.map(channel => (
                                <span
                                  key={channel.url}
                                  title={channel.available ? channel.url : channel.reason}
                                  className={`inline-flex items-center space-x-1 px-1.5 py-0.5 rounded text-[10px] ${
                                    channel.available
                                      ? isSelected && selectedChannelUrls.includes(channel.url)
                                        ? 'bg-indigo-100 text-indigo-800 font-semibold'
                                        : 'bg-slate-100 text-slate-600'
                                      : 'bg-slate-100 text-slate-400 line-through opacity-60'
                                  }`}
                                >
                                  <PlatformIcon platform={channel.platform} size="xs" />
                                  <span className="truncate max-w-[120px]">
                                    {channel.platform}
                                  </span>
                                  {!channel.available && (
                                    <span className="text-[9px] text-amber-700 font-semibold no-underline">
                                      (unsupported)
                                    </span>
                                  )}
                                </span>
                              ))}
                            </div>
                          </div>
                        </div>

                        {/* Expand Channels Button */}
                        <div className="flex items-center space-x-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => {
                              setExpandedAccounts(prev => {
                                const next = new Set(prev);
                                if (next.has(key)) next.delete(key);
                                else next.add(key);
                                return next;
                              });
                            }}
                            className="p-1 rounded-lg hover:bg-slate-100 text-slate-500 transition"
                            title="Expand channels"
                          >
                            {isExpanded ? (
                              <ChevronUp className="w-4 h-4" />
                            ) : (
                              <ChevronDown className="w-4 h-4" />
                            )}
                          </button>
                        </div>
                      </div>

                      {/* Expanded Channel Selection Details */}
                      {isExpanded && (
                        <div className="mt-3 pt-3 border-t border-slate-100 space-y-1.5 pl-7">
                          <p className="text-[11px] font-bold text-slate-600">
                            Connected Channels ({account.channels.length})
                          </p>
                          {account.channels.map(channel => {
                            const isChanSelected = selectedChannelUrls.includes(channel.url);
                            return (
                              <div
                                key={channel.url}
                                className={`flex items-start justify-between gap-2 p-2 rounded-lg text-xs ${
                                  !channel.available
                                    ? 'bg-slate-50 text-slate-400'
                                    : 'bg-white border border-slate-100'
                                }`}
                              >
                                <label className="flex items-start space-x-2 min-w-0 cursor-pointer flex-1">
                                  <input
                                    type="checkbox"
                                    checked={isChanSelected}
                                    disabled={!channel.available}
                                    onChange={() => toggleChannel(account, channel.url)}
                                    className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5 mt-0.5 cursor-pointer disabled:opacity-40"
                                  />
                                  <div className="min-w-0">
                                    <div className="flex items-center space-x-1.5">
                                      <PlatformIcon platform={channel.platform} size="xs" />
                                      <a
                                        href={channel.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="font-medium text-slate-800 hover:text-indigo-600 truncate flex items-center space-x-1"
                                      >
                                        <span className="truncate">{channel.url}</span>
                                        <ExternalLink className="w-2.5 h-2.5 text-slate-400 shrink-0" />
                                      </a>
                                    </div>
                                    {!channel.available && (
                                      <p className="text-[10px] text-amber-700 mt-0.5">
                                        {channel.reason || 'This channel platform is not supported.'}
                                      </p>
                                    )}
                                  </div>
                                </label>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between pt-2 text-xs text-slate-600">
                <button
                  type="button"
                  disabled={currentPage <= 1}
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 cursor-pointer"
                >
                  Previous
                </button>
                <span>
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  type="button"
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 cursor-pointer"
                >
                  Next
                </button>
              </div>
            )}
          </div>

          {/* Action Footer */}
          <div className="pt-4 border-t border-slate-200 flex items-center justify-between">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={totalSelectedAccounts === 0 || planning}
              onClick={handleGeneratePlan}
              className="px-5 py-2.5 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 active:scale-95 text-white text-xs font-bold rounded-xl shadow-xs flex items-center space-x-2 transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {planning ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Generating Batch Plan...</span>
                </>
              ) : (
                <>
                  <span>Review Batch Plan</span>
                  <span className="bg-white/20 px-2 py-0.5 rounded-full text-[10px]">
                    {totalSelectedAccounts} accounts
                  </span>
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* ─── STEP 2: PLAN REVIEW & TOTAL BATCH BUDGET ─── */}
      {step === 2 && plan && (
        <div className="space-y-6">
          {executionError && (
            <div role="alert" className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 flex items-start space-x-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <p className="font-semibold">{executionError}</p>
            </div>
          )}

          {/* Budget & Batch Scope Callout */}
          <div className="p-4 rounded-2xl bg-indigo-50/70 border border-indigo-200 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-extrabold text-indigo-900 uppercase tracking-wider">
                Total Batch Budget
              </span>
              <span className="px-2.5 py-1 rounded-full text-xs font-black bg-indigo-600 text-white shadow-xs">
                ${Number(plan.maxSessionUsd || 1).toFixed(2)} USD Cap
              </span>
            </div>
            <p className="text-xs text-indigo-800/90 leading-relaxed">
              One shared budget applies to the entire batch of{' '}
              <strong>{plan.accountCount} accounts</strong> ({plan.channelCount} eligible channels).
              Cloud workers will stop before exceeding this cap.
            </p>
          </div>

          {/* Batch Criteria Summary */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div className="p-3 rounded-xl bg-white border border-slate-200">
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
                Eligible Accounts
              </span>
              <span className="text-xl font-black text-slate-900 block mt-1">
                {plan.accountCount}
              </span>
            </div>

            <div className="p-3 rounded-xl bg-white border border-slate-200">
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
                Total Channels
              </span>
              <span className="text-xl font-black text-slate-900 block mt-1">
                {plan.channelCount}
              </span>
            </div>

            <div className="p-3 rounded-xl bg-white border border-slate-200">
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
                Mode & Window
              </span>
              <span className="text-sm font-bold text-slate-900 block mt-1 capitalize">
                {plan.criteria?.mode === 'top' ? 'Top Posts' : 'Latest Posts'}
                <span className="text-[11px] text-slate-500 block font-normal">
                  {plan.criteria?.publishedFrom
                    ? `${new Date(plan.criteria.publishedFrom).toLocaleDateString()} – ${new Date(
                        plan.criteria.publishedTo
                      ).toLocaleDateString()}`
                    : `Last ${plan.criteria?.recentDays || 7} days`}
                </span>
              </span>
            </div>

            <div className="p-3 rounded-xl bg-white border border-slate-200">
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
                Limit per Account
              </span>
              <span className="text-xl font-black text-slate-900 block mt-1">
                {plan.criteria?.limitPerAccount}
              </span>
            </div>
          </div>

          {/* Skipped Channels / Accounts (if any) */}
          {plan.skipped?.length > 0 && (
            <div className="p-3.5 rounded-xl bg-amber-50/70 border border-amber-200 text-xs space-y-2">
              <div className="flex items-center space-x-1.5 font-bold text-amber-800">
                <AlertTriangle className="w-4 h-4 text-amber-600" />
                <span>Excluded Channels ({plan.skipped.length})</span>
              </div>
              <p className="text-[11px] text-amber-700">
                These channels cannot be collected and will be skipped during execution:
              </p>
              <div className="max-h-32 overflow-y-auto space-y-1 pr-1">
                {plan.skipped.map((s: any, idx: number) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between text-[11px] bg-white/70 p-1.5 rounded border border-amber-200/50"
                  >
                    <span className="truncate max-w-[280px] font-medium text-slate-800">
                      {s.channelUrl || s.name || s.id}
                    </span>
                    <span className="text-amber-800 font-semibold">{s.reason}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Eligible Accounts Overview */}
          <div className="space-y-2">
            <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
              Included Accounts ({plan.accounts.length})
            </h4>
            <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1 rounded-xl border border-slate-200 p-2 bg-slate-50/50">
              {plan.accounts.map((acc: any) => (
                <div
                  key={`${acc.entityType}:${acc.id}`}
                  className="flex items-center justify-between p-2 rounded-lg bg-white border border-slate-100 text-xs"
                >
                  <div className="flex items-center space-x-2">
                    <span className="font-bold text-slate-900">{acc.name}</span>
                    <span className="text-[10px] bg-slate-100 px-1.5 py-0.5 rounded text-slate-600">
                      {acc.entityType === 'kol' ? 'Creator' : 'Community'}
                    </span>
                  </div>
                  <span className="text-[11px] text-slate-500 font-medium">
                    {acc.channelUrls.length} channel(s)
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Plan Action Footer */}
          <div className="pt-4 border-t border-slate-200 flex items-center justify-between">
            <button
              type="button"
              disabled={startingScout}
              onClick={() => setStep(1)}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 transition cursor-pointer"
            >
              Back to Edit Selection
            </button>
            <button
              type="button"
              disabled={startingScout}
              onClick={handleStartScout}
              className="px-6 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 active:scale-95 text-white text-xs font-bold rounded-xl shadow-xs flex items-center space-x-2 transition cursor-pointer disabled:opacity-50"
            >
              {startingScout ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Launching Batch Task...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Start Scout ({plan.accountCount} Accounts)</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* ─── STEP 3: RUNNING PROGRESS (DURABLE) ─── */}
      {step === 3 && (
        <div className="space-y-6 py-2">
          {/* Progress Header Banner */}
          <div className="p-4 rounded-2xl bg-blue-50/70 border border-blue-200 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2.5">
                <RefreshCw className="w-4 h-4 text-blue-600 animate-spin" />
                <span className="text-xs font-extrabold text-blue-900 uppercase tracking-wider">
                  Collecting Account Posts in Cloud Workers
                </span>
              </div>
              <span className="text-[11px] font-bold text-blue-700 bg-white px-2 py-0.5 rounded-full border border-blue-200">
                Durable Session
              </span>
            </div>

            {/* Progress Bar */}
            {sessionProgress && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs text-blue-950 font-semibold">
                  <span>
                    Completed {sessionProgress.completedAccounts || 0} of{' '}
                    {sessionProgress.totalAccounts || 1} accounts
                  </span>
                  <span>
                    {Math.round(
                      ((sessionProgress.completedAccounts || 0) /
                        (sessionProgress.totalAccounts || 1)) *
                        100
                    )}
                    %
                  </span>
                </div>
                <div className="w-full bg-blue-200/80 rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-indigo-600 h-2 transition-all duration-500 rounded-full"
                    style={{
                      width: `${Math.min(
                        100,
                        Math.round(
                          ((sessionProgress.completedAccounts || 0) /
                            (sessionProgress.totalAccounts || 1)) *
                            100
                        )
                      )}%`,
                    }}
                  />
                </div>
              </div>
            )}

            <p className="text-[11px] text-slate-500 leading-relaxed">
              Closing this modal or reloading will <strong>not</strong> stop collection. You can
              reopen this task anytime from Scout Activity or the durable session URL.
            </p>
          </div>

          {/* Account Results Stream */}
          {sessionProgress?.accountResults?.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                Progress by Account ({sessionProgress.accountResults.length})
              </h4>
              <div className="max-h-64 overflow-y-auto space-y-1.5 pr-1">
                {sessionProgress.accountResults.map((item: any, idx: number) => (
                  <div
                    key={idx}
                    className="p-2.5 rounded-xl border border-slate-200 bg-white flex items-center justify-between text-xs"
                  >
                    <div className="flex items-center space-x-2">
                      <span className="font-bold text-slate-900">{item.name}</span>
                      <span className="text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                        {item.entityType === 'kol' ? 'Creator' : 'Community'}
                      </span>
                    </div>

                    <div className="flex items-center space-x-2">
                      {item.status === 'complete' ? (
                        <span className="text-[11px] font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 flex items-center space-x-1">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>{item.counts?.saved ?? 0} saved</span>
                        </span>
                      ) : item.status === 'failed' ? (
                        <span className="text-[11px] font-semibold text-rose-600 bg-rose-50 px-2 py-0.5 rounded border border-rose-200 flex items-center space-x-1">
                          <AlertCircle className="w-3 h-3" />
                          <span>{item.error || 'Failed'}</span>
                        </span>
                      ) : (
                        <span className="text-[11px] text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                          {item.status}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Running Action Footer */}
          <div className="pt-4 border-t border-slate-200 flex items-center justify-between">
            <span className="text-xs text-slate-400">
              Session ID: <code className="text-slate-600">{sessionId}</code>
            </span>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition cursor-pointer"
            >
              Close & Run in Background
            </button>
          </div>
        </div>
      )}

      {/* ─── STEP 4: COMPLETED RESULTS ─── */}
      {step === 4 && sessionResult && (
        <div className="space-y-6">
          {/* Summary Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-950">
              <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider block">
                Saved Posts
              </span>
              <span className="text-2xl font-black text-emerald-900 block mt-1">
                {(sessionResult.counts?.saved ?? sessionResult.posts?.length ?? 0).toLocaleString(
                  'en-US'
                )}
              </span>
            </div>

            <div className="p-3 rounded-xl bg-white border border-slate-200">
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
                Accounts Completed
              </span>
              <span className="text-2xl font-black text-slate-900 block mt-1">
                {sessionResult.counts?.completedAccounts ??
                  sessionResult.accountResults?.filter((r: any) => r.status === 'complete').length ??
                  0}
              </span>
            </div>

            <div className="p-3 rounded-xl bg-white border border-slate-200">
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
                Failed Accounts
              </span>
              <span className="text-2xl font-black text-rose-600 block mt-1">
                {sessionResult.counts?.failedAccounts ??
                  sessionResult.accountResults?.filter((r: any) => r.status === 'failed').length ??
                  0}
              </span>
            </div>

            <div className="p-3 rounded-xl bg-white border border-slate-200">
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
                Stop Reason
              </span>
              <span className="text-sm font-bold text-slate-900 block mt-1 capitalize">
                {sessionResult.stopReason?.replace(/-/g, ' ') || 'Complete'}
              </span>
            </div>
          </div>

          {/* Account breakdown list */}
          {sessionResult.accountResults?.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                Account Results
              </h4>
              <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
                {sessionResult.accountResults.map((res: any, idx: number) => (
                  <div
                    key={idx}
                    className="p-2.5 rounded-xl border border-slate-200 bg-white flex items-center justify-between text-xs"
                  >
                    <div>
                      <span className="font-bold text-slate-900">{res.name}</span>
                      <span className="text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded ml-2">
                        {res.entityType === 'kol' ? 'Creator' : 'Community'}
                      </span>
                      {res.warnings?.length > 0 && (
                        <p className="text-[10px] text-amber-700 mt-0.5">
                          {res.warnings.join(' · ')}
                        </p>
                      )}
                    </div>
                    <div>
                      {res.status === 'complete' ? (
                        <span className="text-[11px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                          {res.counts?.saved ?? 0} posts saved
                        </span>
                      ) : (
                        <span className="text-[11px] font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                          {res.error || 'Failed'}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Saved Posts Preview Cards */}
          {sessionResult.posts?.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                Saved Posts ({sessionResult.posts.length})
              </h4>
              <div className="max-h-56 overflow-y-auto space-y-2 pr-1">
                {sessionResult.posts.slice(0, 10).map((post: any, idx: number) => (
                  <div
                    key={post.id || idx}
                    className="p-3 rounded-xl bg-white border border-slate-200 text-xs space-y-1.5"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-900 truncate">
                        {post.author || 'Creator'}
                      </span>
                      <a
                        href={post.postUrl || post.post_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-indigo-600 hover:underline flex items-center space-x-1"
                      >
                        <span>View</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                    <p className="text-slate-600 line-clamp-2">{post.title || post.caption}</p>
                    <div className="flex items-center space-x-3 text-[11px] text-slate-400">
                      <span>Views: {post.views == null ? '—' : formatNumber(post.views)}</span>
                      <span>Likes: {post.likes == null ? '—' : formatNumber(post.likes)}</span>
                      <span>Comments: {post.comments == null ? '—' : formatNumber(post.comments)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Completed Action Footer */}
          <div className="pt-4 border-t border-slate-200 flex items-center justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition cursor-pointer"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </ScoutDialogFrame>
  );
}

