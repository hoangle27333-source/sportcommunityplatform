'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Clock,
  ExternalLink,
  Eye,
  Heart,
  MessageSquare,
  ArrowRight,
  RefreshCw,
  FileSearch,
  Users,
  Flame,
  ShieldAlert,
  Info,
  Layers,
  Sparkles,
  Link2,
} from 'lucide-react';
import { t, formatNumber } from '@/lib/i18n';
import { useCurrentUser } from '@/lib/auth/auth-context';
import type { ScoutContext, ScoutSessionSummary } from '@/lib/apify/scout-workspace';
import { DiscoveryScoutModal } from './discovery-scout-modal';
import { MarketTrendScoutModal } from './market-trend-scout-modal';
import { EntityPostScoutModal } from './entity-post-scout-modal';
import { RefreshDataModal } from './refresh-data-modal';
import { AddKolModal, AddCommunityModal, AddPostModal } from './action-modals';
import { ScoutDialogFrame, scoutButtonClass, scoutInputClass } from './scout-dialog-frame';
import { PlatformIcon } from './platform-icon';
import type { KOL, Community } from './types';

export type ScoutSubject = {
  id: string;
  name: string;
  profileUrl?: string;
  groupUrl?: string;
  channels?: { url?: string; isPrimary?: boolean }[];
};

/** Reusable Social Post Card displaying publishing account, platform, caption, and metrics */
function ScoutPostCard({ post }: { post: any }) {
  const authorName =
    post.author ||
    post.author_name ||
    post.ownerFullName ||
    post.user?.name ||
    post.username ||
    'Unknown Creator';
  const username = post.username || post.ownerUsername;
  const authorUrl =
    post.author_url ||
    post.authorUrl ||
    post.authorProfileUrl ||
    (username && post.platform?.includes('TikTok')
      ? `https://www.tiktok.com/@${username}`
      : undefined);
  const postUrl =
    typeof post.post_url === 'string' && /^https?:\/\//.test(post.post_url)
      ? post.post_url
      : post.url;
  const publishedDate =
    post.published_at || post.publishedAt
      ? new Date(post.published_at || post.publishedAt).toLocaleDateString(
          'en-US',
          { month: 'short', day: 'numeric', year: 'numeric' }
        )
      : null;

  const hasViews = typeof post.views === 'number' && post.views >= 0 && !post.scout_missing_metrics?.includes('views');
  const hasLikes = typeof post.likes === 'number' && post.likes >= 0 && !post.scout_missing_metrics?.includes('likes');
  const hasComments = typeof post.comments === 'number' && post.comments >= 0 && !post.scout_missing_metrics?.includes('comments');

  return (
    <div className="p-4 rounded-xl border border-slate-200 bg-white hover:border-slate-300 transition shadow-2xs space-y-3">
      {/* ─── 1. Account / Author Row & External Link ─── */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center space-x-2.5 min-w-0">
          {/* Avatar initial with vibrant gradient */}
          <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-blue-600 via-indigo-600 to-violet-600 text-white font-extrabold flex items-center justify-center text-xs shadow-2xs shrink-0 ring-2 ring-white">
            {authorName.slice(0, 1).toUpperCase()}
          </div>

          <div className="min-w-0">
            <div className="flex items-center space-x-1.5 flex-wrap">
              {authorUrl ? (
                <a
                  href={authorUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-bold text-slate-900 hover:text-indigo-600 truncate transition flex items-center space-x-1"
                  title={authorName}
                >
                  <span className="truncate">{authorName}</span>
                  <ExternalLink className="w-3 h-3 text-slate-400 shrink-0" />
                </a>
              ) : (
                <span
                  className="text-xs font-bold text-slate-900 truncate"
                  title={authorName}
                >
                  {authorName}
                </span>
              )}

              {/* Platform pill badge */}
              <span className="inline-flex items-center space-x-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700 shrink-0 border border-slate-200/80">
                <PlatformIcon platform={post.platform} size="xs" />
                <span>{post.platform}</span>
              </span>
            </div>

            {/* Handle & Published Date */}
            <div className="flex items-center space-x-2 text-[10px] text-slate-400 mt-0.5">
              {username && username !== authorName && (
                <span className="truncate">@{username.replace(/^@/, '')}</span>
              )}
              {publishedDate && (
                <span className="flex items-center space-x-1 shrink-0">
                  <Clock className="w-2.5 h-2.5" />
                  <span>{publishedDate}</span>
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Post Actions / View Post */}
        <div className="flex items-center space-x-2 shrink-0">
          {post.viral_tier && post.viral_tier !== 'Unknown' && (
            <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
              {t(post.viral_tier)}
            </span>
          )}

          {postUrl && (
            <a
              href={postUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="px-2.5 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-xs font-bold flex items-center space-x-1 transition cursor-pointer"
            >
              <span>View Post</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>
      </div>

      {/* ─── 2. Post Caption ─── */}
      <p className="text-xs text-slate-800 leading-relaxed font-normal line-clamp-3 bg-slate-50/50 p-2.5 rounded-lg border border-slate-100">
        {post.title || post.caption || 'Untitled Social Post'}
      </p>

      {/* ─── 3. Detailed Metrics Strip ─── */}
      <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-100 text-xs">
        {/* Likes */}
        <span className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-lg bg-rose-50/80 border border-rose-200/80 text-rose-700 font-bold text-[11px]">
          <Heart className="w-3.5 h-3.5 fill-rose-500 text-rose-500" />
          <span>{hasLikes ? formatNumber(post.likes) : 'Unknown'} likes / reactions</span>
        </span>

        {/* Comments */}
        <span className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-lg bg-blue-50/80 border border-blue-200/80 text-blue-700 font-bold text-[11px]">
          <MessageSquare className="w-3.5 h-3.5 fill-blue-500 text-blue-500" />
          <span>{hasComments ? formatNumber(post.comments) : 'Unknown'} comments</span>
        </span>

        {/* Views */}
        {hasViews ? (
          <span className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-lg bg-indigo-50/80 border border-indigo-200/80 text-indigo-700 font-bold text-[11px]">
            <Eye className="w-3.5 h-3.5 text-indigo-500" />
            <span>{formatNumber(post.views)} views</span>
          </span>
        ) : (
          <span className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-lg bg-slate-50 border border-slate-200 text-slate-500 font-medium text-[11px]">
            <Eye className="w-3.5 h-3.5 text-slate-400" />
            <span>Views Unknown</span>
          </span>
        )}

        {/* CRM Match */}
        {post.kol_id && (
          <span className="inline-flex items-center space-x-1 text-emerald-700 font-bold bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200 ml-auto text-[11px]">
            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
            <span>Linked to CRM Creator</span>
          </span>
        )}
      </div>
    </div>
  );
}

/** Reusable Skipped Post Card with publishing account, platform, metrics, and exclusion reason */
function ScoutSkippedPostCard({ post }: { post: any }) {
  const isNeedsVerification = post.reviewState === 'Needs Verification';
  const authorName = post.author || post.username || 'Unknown Account';
  const username = post.username;
  const authorUrl = post.authorUrl || post.url;
  const publishedDate = post.publishedAt
    ? new Date(post.publishedAt).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : null;
  const hasViews = typeof post.views === 'number' && post.views >= 0 && !post.scout_missing_metrics?.includes('views');
  const hasLikes = typeof post.likes === 'number' && post.likes >= 0 && !post.scout_missing_metrics?.includes('likes');
  const hasComments = typeof post.comments === 'number' && post.comments >= 0 && !post.scout_missing_metrics?.includes('comments');

  return (
    <div className="p-3.5 rounded-xl bg-white border border-slate-200/90 shadow-2xs space-y-2.5 transition hover:border-slate-300">
      {/* Account Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center space-x-2 min-w-0">
          <div className="w-6 h-6 rounded-full bg-slate-200 text-slate-700 font-bold flex items-center justify-center text-[10px] shrink-0">
            {authorName.slice(0, 1).toUpperCase()}
          </div>

          <div className="min-w-0">
            <div className="flex items-center space-x-1.5 flex-wrap">
              {post.authorUrl ? (
                <a
                  href={post.authorUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-bold text-slate-900 hover:text-indigo-600 truncate transition flex items-center space-x-1"
                >
                  <span className="truncate">{authorName}</span>
                  <ExternalLink className="w-2.5 h-2.5 text-slate-400 shrink-0" />
                </a>
              ) : (
                <span className="text-xs font-bold text-slate-900 truncate">
                  {authorName}
                </span>
              )}

              <span className="inline-flex items-center space-x-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-700 shrink-0">
                <PlatformIcon platform={post.platform} size="xs" />
                <span>{post.platform}</span>
              </span>
            </div>

            <div className="flex items-center space-x-2 text-[10px] text-slate-400">
              {username && username !== authorName && (
                <span className="truncate">@{username.replace(/^@/, '')}</span>
              )}
              {publishedDate && <span>· {publishedDate}</span>}
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-1.5 shrink-0">
          <span
            className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
              isNeedsVerification
                ? 'bg-amber-50 text-amber-800 border-amber-200'
                : 'bg-slate-100 text-slate-600 border-slate-200'
            }`}
          >
            {post.reviewState || 'Excluded'}
          </span>

          {post.url && (
            <a
              href={post.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-slate-500 hover:text-indigo-600 inline-flex items-center space-x-1 font-semibold ml-1"
            >
              <span>Inspect</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>
      </div>

      {/* Caption */}
      <p className="text-xs text-slate-700 leading-relaxed line-clamp-2">
        {post.caption || 'No caption text'}
      </p>

      {/* Metrics Row */}
      <div className="flex flex-wrap items-center gap-2 text-[10px]">
        {hasLikes && (
          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded bg-rose-50 text-rose-700 font-semibold border border-rose-200/60">
            <Heart className="w-3 h-3 fill-rose-500 text-rose-500" />
            <span>{formatNumber(post.likes)} likes</span>
          </span>
        )}
        {hasComments && (
          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded bg-blue-50 text-blue-700 font-semibold border border-blue-200/60">
            <MessageSquare className="w-3 h-3 fill-blue-500 text-blue-500" />
            <span>{formatNumber(post.comments)} comments</span>
          </span>
        )}
        {hasViews && (
          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 font-semibold border border-indigo-200/60">
            <Eye className="w-3 h-3 text-indigo-500" />
            <span>{formatNumber(post.views)} views</span>
          </span>
        )}
      </div>

      {/* Reason */}
      {post.reason && (
        <p className="text-[11px] text-slate-500 bg-slate-50 px-2.5 py-1.5 rounded-lg border border-slate-100 flex items-start space-x-1.5 leading-relaxed">
          <Info className="w-3 h-3 text-slate-400 shrink-0 mt-0.5" />
          <span>{post.reason}</span>
        </p>
      )}
    </div>
  );
}

export function ScoutTaskLauncher({
  context,
  subjects = [],
  entity,
  resumeSessionId,
  initialCriteria,
  onClose,
  onNavigate,
  onSuccess,
}: {
  context: ScoutContext;
  subjects?: ScoutSubject[];
  entity?: KOL | Community;
  resumeSessionId?: string;
  initialCriteria?: Record<string, any>;
  onClose: () => void;
  onNavigate?: (href: string) => void;
  onSuccess?: (result?: any) => void;
}) {
  const { isEditor, loading } = useCurrentUser();
  const [result, setResult] = useState<any>(null);
  const [selectionReady, setSelectionReady] = useState(
    !!context.ids?.length || !!entity
  );
  const [selected, setSelected] = useState<string[]>(context.ids || []);
  const [linkReady, setLinkReady] = useState(
    !!context.entityType || !!context.url
  );
  const [linkType, setLinkType] = useState<'kol' | 'community'>(
    context.entityType === 'community' ? 'community' : 'kol'
  );

  function success(value?: any) {
    onSuccess?.(value);
    setResult(
      value || {
        message: 'Record saved. Review the new record in its directory.',
      }
    );
  }

  if (loading) {
    return (
      <ScoutDialogFrame title="Scout" onClose={onClose}>
        <div className="flex items-center justify-center py-12">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
        </div>
      </ScoutDialogFrame>
    );
  }

  if (!isEditor) {
    return (
      <ScoutDialogFrame title="Scout" onClose={onClose}>
        <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800 flex items-start space-x-2">
          <AlertCircle className="w-4 h-4 shrink-0 text-amber-600 mt-0.5" />
          <p>
            Editor access is required to start or import Scout tasks. You can view
            your existing tasks in Activity.
          </p>
        </div>
      </ScoutDialogFrame>
    );
  }

  const resultEntityType =
    context.mode === 'link' && context.intent === 'profiles'
      ? linkType
      : context.entityType;
  const destination =
    resultEntityType === 'tracked'
      ? '/analytics/tracked'
      : context.intent === 'content'
      ? '/trending'
      : resultEntityType === 'community'
      ? '/community'
      : '/kols';
  const resultSessionId = result?.sessionId || resumeSessionId;
  const savedId = result?.record?.id;
  const resultsHref =
    savedId && context.intent === 'profiles'
      ? `${destination}?recordId=${encodeURIComponent(savedId)}`
      : resultSessionId
      ? `/scout?sessionId=${encodeURIComponent(resultSessionId)}`
      : destination;
  const collectHref = `/scout?intent=content&mode=entity&type=${
    resultEntityType || 'kol'
  }${savedId ? `&ids=${encodeURIComponent(savedId)}` : ''}`;
  const dismissForNavigation = onNavigate || onClose;

  if (result) {
    const isPartial = !!result.partial;
    const postsList: any[] = result.posts || [];

    return (
      <ScoutDialogFrame
        title={isPartial ? 'Completed with Warnings' : 'Task Completed'}
        description="Review the saved results or choose the next task."
        onClose={onClose}
        wide={postsList.length > 0}
        footer={
          <div className="flex items-center justify-between w-full">
            <Link
              className="px-3.5 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 transition"
              onClick={() => dismissForNavigation(destination)}
              href={destination}
            >
              Open{' '}
              {context.entityType === 'tracked'
                ? 'Analytics'
                : context.intent === 'content'
                ? 'Trending Posts'
                : 'Directory'}
            </Link>

            <Link
              className="px-4 py-2 bg-gradient-to-r from-rose-600 via-orange-600 to-amber-600 hover:from-rose-500 hover:to-amber-500 text-white text-xs font-bold rounded-xl shadow-xs flex items-center space-x-1.5 transition active:scale-95"
              onClick={() => dismissForNavigation(resultsHref)}
              href={resultsHref}
            >
              <span>View Detailed Results</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 flex items-start space-x-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <div className="leading-relaxed">
              <p className="font-bold">
                {result.summary || result.message || 'Results are ready in Activity.'}
              </p>
              {typeof result.insertedPosts === 'number' && (
                <p className="mt-1 text-emerald-800">
                  {result.insertedPosts} observed posts saved with these profiles.
                </p>
              )}
            </div>
          </div>

          {result.warnings?.length > 0 && (
            <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800 space-y-1">
              <div className="font-bold flex items-center space-x-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                <span>Task Warnings</span>
              </div>
              <ul className="list-disc pl-4 space-y-0.5 text-[11px]">
                {result.warnings.map((w: string, i: number) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
          )}

          {postsList.length > 0 && (
            <div className="space-y-3 pt-2">
              <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center space-x-1.5">
                <Flame className="w-4 h-4 text-orange-500 fill-orange-500" />
                <span>Saved Posts ({postsList.length})</span>
              </h4>
              <div className="space-y-3">
                {postsList.map((p, idx) => (
                  <ScoutPostCard key={p.id || idx} post={p} />
                ))}
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-2 pt-1">
            {entity &&
              context.intent === 'content' &&
              context.entityType === 'kol' && (
                <Link
                  className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
                  onClick={() =>
                    dismissForNavigation(
                      `/scout?kolId=${entity.id}&section=audience`
                    )
                  }
                  href={`/scout?kolId=${entity.id}&section=audience`}
                >
                  Review Audience Evidence
                </Link>
              )}
            {context.intent === 'profiles' && (
              <Link
                className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
                onClick={() => dismissForNavigation(collectHref)}
                href={collectHref}
              >
                Collect Posts
              </Link>
            )}
          </div>
        </div>
      </ScoutDialogFrame>
    );
  }

  if (context.mode === 'link') {
    if (context.intent === 'content')
      return (
        <AddPostModal
          isOpen
          onClose={onClose}
          onSuccess={success}
          keepResultOpen
          initialUrl={context.url}
          inspectSessionId={resumeSessionId}
        />
      );
    if (!linkReady)
      return (
        <ScoutDialogFrame
          title="Add a Profile from a Link"
          onClose={onClose}
        >
          <label className="block text-sm">
            Save destination
            <select
              value={linkType}
              onChange={(e) =>
                setLinkType(e.target.value as 'kol' | 'community')
              }
              className={`${scoutInputClass} mt-1`}
            >
              <option value="kol">KOLs Directory</option>
              <option value="community">Community & Clubs</option>
            </select>
          </label>
          <button
            type="button"
            onClick={() => setLinkReady(true)}
            className={`${scoutButtonClass} mt-4`}
          >
            Continue
          </button>
        </ScoutDialogFrame>
      );
    return linkType === 'kol' ? (
      <AddKolModal
        key="kol"
        isOpen
        onClose={onClose}
        onSuccess={success}
        keepResultOpen
        initialUrl={context.url}
        inspectSessionId={resumeSessionId}
      />
    ) : (
      <AddCommunityModal
        key="community"
        isOpen
        onClose={onClose}
        onSuccess={success}
        keepResultOpen
        initialUrl={context.url}
        inspectSessionId={resumeSessionId}
      />
    );
  }

  if (context.intent === 'profiles')
    return (
      <DiscoveryScoutModal
        keepResultOpen
        isOpen
        defaultTargetType={
          context.entityType === 'community'
            ? 'Communities & Clubs'
            : 'Individual KOLs'
        }
        onClose={onClose}
        onSuccess={success}
        resumeSessionId={resumeSessionId}
        initialCriteria={initialCriteria}
        source={context.source}
      />
    );

  if (context.intent === 'content' && context.mode !== 'entity')
    return (
      <MarketTrendScoutModal
        isOpen
        onClose={onClose}
        onSuccess={success}
        initialCriteria={initialCriteria}
        source={context.source}
      />
    );

  const picked = entity
    ? [entity]
    : subjects.filter((s) => selected.includes(s.id));

  if (!selectionReady || !picked.length)
    return (
      <ScoutDialogFrame
        title={context.intent === 'content' ? 'Collect Posts' : 'Refresh Data'}
        onClose={onClose}
      >
        <label className="block text-sm font-semibold">
          {context.intent === 'content'
            ? 'Choose a saved profile'
            : 'Choose accounts to refresh'}
          <select
            multiple={context.intent === 'refresh'}
            value={
              context.intent === 'refresh' ? selected : selected[0] || ''
            }
            onChange={(e) =>
              setSelected(
                Array.from(e.target.selectedOptions, (option) => option.value)
              )
            }
            className={`${scoutInputClass} mt-2`}
          >
            {context.intent === 'content' && (
              <option value="">Choose a profile</option>
            )}
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        {!subjects.length && (
          <p className="mt-3 text-sm">
            No saved profiles available. Add a profile in its directory first.
          </p>
        )}
        {selected.length > 50 && (
          <p role="alert" className="mt-3 text-sm text-amber-800">
            Choose up to 50 accounts per refresh.
          </p>
        )}
        <button
          type="button"
          className={`${scoutButtonClass} mt-4`}
          disabled={!picked.length || selected.length > 50}
          onClick={() => setSelectionReady(true)}
        >
          Continue
        </button>
      </ScoutDialogFrame>
    );

  if (context.intent === 'content')
    return (
      <EntityPostScoutModal
        key={picked[0].id}
        entity={picked[0] as KOL | Community}
        entityType={context.entityType === 'community' ? 'community' : 'kol'}
        initialCriteria={initialCriteria}
        onClose={onClose}
        onSuccess={success}
        source={context.source}
      />
    );

  return (
    <RefreshDataModal
      context={context}
      entities={picked}
      onClose={onClose}
      onSuccess={success}
    />
  );
}

/** Opening a result never submits or retries a task. */
export function ScoutSessionResults({
  session,
  onClose,
  onReview,
  onRetry,
}: {
  session: ScoutSessionSummary;
  onClose: () => void;
  onReview: () => void;
  onRetry: () => void;
}) {
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState('');
  const [reconciling, setReconciling] = useState(false);
  const [reconcileMessage, setReconcileMessage] = useState('');
  const { isEditor } = useCurrentUser();

  async function reconcile() {
    setReconciling(true);
    setReconcileMessage('');
    try {
      const response = await fetch('/api/sport-hub/scout/reconcile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: session.id }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || 'Unable to check provider history.');
      setReconcileMessage(data.message);
      if (data.reconciled) {
        const refreshed = await fetch(
          `/api/sport-hub/scout?sessionId=${encodeURIComponent(session.id)}`
        );
        const outcome = await refreshed.json();
        setResult(outcome);
        setError(outcome.error || '');
        window.dispatchEvent(
          new CustomEvent('scout-finished', {
            detail: { sessionId: session.id, success: false },
          })
        );
      }
    } catch (err: any) {
      setReconcileMessage(err.message || 'Unable to check provider history.');
    } finally {
      setReconciling(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    async function read() {
      try {
        const response = await fetch(
          `/api/sport-hub/scout?sessionId=${encodeURIComponent(session.id)}`
        );
        const data = await response.json();
        if (!cancelled) {
          setResult(data);
          setError(!response.ok ? data.error || 'Task failed.' : '');
        }
      } catch {
        if (!cancelled)
          setError(
            'Unable to read results. The task has not been restarted.'
          );
      }
    }
    void read();
    const timer = setInterval(read, 10000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [session.id]);

  const destination =
    session.kind === 'tracked'
      ? '/analytics/tracked'
      : ['trends', 'kol-posts', 'community-posts'].includes(session.kind)
      ? '/trending'
      : session.params.entityType === 'community' ||
        session.params.targetType === 'Communities & Clubs'
      ? '/community'
      : '/kols';

  // Compute status presentation
  const isFailed =
    error || session.status === 'failed' || result?.success === false;
  const isRunning = result?.pending || session.status === 'running';
  const isNeedsReconciliation = result?.code === 'START_UNKNOWN';
  const isPartial = !!result?.partial || session.partial;
  const isNoResults =
    result &&
    ['trends', 'kol-posts', 'community-posts'].includes(session.kind) &&
    !result.posts?.length &&
    !result.counts?.refreshed &&
    !result.counts?.duplicate;

  const statusLabel = isNeedsReconciliation
    ? 'Needs Reconciliation'
    : isRunning
    ? result?.status === 'pending'
      ? 'Queued in Cloud'
      : 'Scanning Providers…'
    : isPartial
    ? 'Completed with Warnings'
    : isFailed
    ? 'Task Failed'
    : isNoResults
    ? 'No Posts Found'
    : result
    ? 'Completed'
    : 'Connecting…';

  const statusBadgeClass = isNeedsReconciliation
    ? 'bg-amber-50 text-amber-800 border-amber-300'
    : isRunning
    ? 'bg-blue-50 text-blue-700 border-blue-200'
    : isPartial
    ? 'bg-amber-50 text-amber-800 border-amber-300'
    : isFailed
    ? 'bg-rose-50 text-rose-700 border-rose-300'
    : 'bg-emerald-50 text-emerald-800 border-emerald-300';

  // Counts & metrics breakdown
  const counts = result?.counts || {};
  const postsList: any[] = result?.posts || [];
  const skippedList: any[] = result?.skippedPosts || [];
  const candidatesList: any[] = result?.candidates || [];

  const savedCount = postsList.length || counts.inserted || 0;
  const refreshedCount = counts.refreshed ?? 0;
  const unverifiedCount = counts.unverified ?? 0;
  const excludedCount = counts.excluded ?? 0;

  const modalFooter = (
    <div className="flex items-center justify-between w-full gap-2">
      <div className="flex items-center space-x-2">
        {session.kind === 'preview' &&
          result?.success &&
          !result?.pending &&
          !error &&
          isEditor &&
          candidatesList.some(
            (c: any) => !result.importedCandidateIds?.includes(c.candidateId)
          ) && (
            <button
              type="button"
              className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-xs transition cursor-pointer"
              onClick={onReview}
            >
              Review Profiles ({session.remainingCandidates})
            </button>
          )}

        {isNeedsReconciliation && isEditor && (
          <button
            type="button"
            disabled={reconciling}
            className="px-3.5 py-2 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 text-xs font-bold rounded-xl transition disabled:opacity-50 cursor-pointer"
            onClick={reconcile}
          >
            {reconciling ? 'Checking Provider History…' : 'Check Provider Status'}
          </button>
        )}

        {(isFailed || session.status === 'failed') &&
          !isNeedsReconciliation &&
          isEditor && (
            <button
              type="button"
              className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition cursor-pointer"
              onClick={onRetry}
            >
              Retry Task
            </button>
          )}

        {session.kind === 'kol-posts' &&
          result?.success &&
          postsList.length > 0 &&
          !result?.pending &&
          !error && (
            <Link
              className="px-3.5 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-xs font-bold rounded-xl transition"
              href={`/scout?kolId=${session.params.kolId}&section=audience`}
            >
              Collect Comments / Refresh Audit
            </Link>
          )}
      </div>

      <div className="flex items-center space-x-2 ml-auto">
        <button
          type="button"
          onClick={onClose}
          className="px-3.5 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 transition cursor-pointer"
        >
          Close
        </button>

        <Link
          href={destination}
          onClick={onClose}
          className="px-4 py-2 bg-gradient-to-r from-rose-600 via-orange-600 to-amber-600 hover:from-rose-500 hover:to-amber-500 text-white text-xs font-bold rounded-xl shadow-xs flex items-center space-x-1.5 transition active:scale-95 cursor-pointer whitespace-nowrap"
        >
          <span>
            Open{' '}
            {destination === '/trending'
              ? 'Trending Posts'
              : destination === '/analytics/tracked'
              ? 'Analytics'
              : 'Directory'}
          </span>
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>
    </div>
  );

  return (
    <ScoutDialogFrame
      title={session.title}
      description={session.subject}
      onClose={onClose}
      wide
      footer={modalFooter}
    >
      <div className="space-y-4">
        {/* ─── STATUS & TIMESTAMP BAR ─── */}
        <div className="flex flex-wrap items-center justify-between gap-2 p-3 bg-slate-50/80 rounded-xl border border-slate-200">
          <div className="flex items-center space-x-2">
            <span
              className={`px-2.5 py-1 rounded-full text-xs font-bold inline-flex items-center space-x-1.5 border ${statusBadgeClass}`}
            >
              {isRunning ? (
                <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
              ) : isFailed ? (
                <AlertCircle className="w-3.5 h-3.5 text-rose-600" />
              ) : isPartial ? (
                <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
              ) : (
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              )}
              <span>{statusLabel}</span>
            </span>

            {session.reviewState === 'needs-review' && (
              <span className="text-xs font-semibold text-amber-800 bg-amber-50 px-2.5 py-1 rounded-full border border-amber-200">
                {session.remainingCandidates} profiles need review
              </span>
            )}
          </div>

          {result?.sourceFreshness?.length > 0 && (
            <div className="text-[11px] text-slate-500 flex items-center space-x-1">
              <Clock className="w-3.5 h-3.5 text-slate-400" />
              <span>
                Observed{' '}
                {new Date(result.sourceFreshness.at(-1)).toLocaleString(
                  'en-US',
                  { timeZone: 'Asia/Ho_Chi_Minh' }
                )}
              </span>
            </div>
          )}
        </div>

        {result?.qualityCriteria && <p className="text-xs text-slate-600" aria-label="Content quality criteria">
          {result.qualityCriteria.mode==='high-engagement'
            ? `High Engagement: last ${result.qualityCriteria.recentDays} days; at least ${Number(result.qualityCriteria.minInteractions).toLocaleString('en-US')} likes / reactions + comments or ${Number(result.qualityCriteria.minViews).toLocaleString('en-US')} views. Ranked by interactions, then views. This is not a measured growth trend.`
            : 'Topic matches: no minimum engagement requirement.'}
        </p>}

        {/* ─── ERROR OR RECONCILE MESSAGES ─── */}
        {error && (
          <div
            role="alert"
            className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 flex items-start space-x-2"
          >
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
            <div className="leading-relaxed">
              <p className="font-semibold">
                {result?.code === 'START_UNKNOWN'
                  ? 'The provider did not confirm whether the task started. Its reserved budget is still held.'
                  : error}
              </p>
              {result?.code && (
                <span className="text-[10px] text-red-500 block mt-0.5 font-mono">
                  Code: {result.code}
                </span>
              )}
            </div>
          </div>
        )}

        {reconcileMessage && (
          <div className="p-3 rounded-xl bg-blue-50 border border-blue-200 text-xs text-blue-800 flex items-start space-x-2">
            <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
            <p className="font-medium">{reconcileMessage}</p>
          </div>
        )}

        {result?.message && !error && (
          <p className="text-xs text-slate-600 font-medium px-1">
            {result.message}
          </p>
        )}

        {/* ─── STRUCTURED KPI SUMMARY STRIP ─── */}
        {result && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-2">
            <div className="p-3 rounded-xl bg-emerald-50/80 border border-emerald-200 text-emerald-950 shadow-2xs flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider block">
                  Saved Posts
                </span>
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              </div>
              <div className="mt-1">
                <span className="text-xl sm:text-2xl font-black text-emerald-900 block leading-tight">
                  {savedCount.toLocaleString('en-US')}
                </span>
                <span className="text-[10px] text-emerald-600 mt-0.5 block truncate">
                  Stored in database
                </span>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-blue-50/80 border border-blue-200 text-blue-950 shadow-2xs flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-blue-700 uppercase tracking-wider block">
                  Refreshed
                </span>
                <RefreshCw className="w-3.5 h-3.5 text-blue-600" />
              </div>
              <div className="mt-1">
                <span className="text-xl sm:text-2xl font-black text-blue-900 block leading-tight">
                  {refreshedCount.toLocaleString('en-US')}
                </span>
                <span className="text-[10px] text-blue-600 mt-0.5 block truncate">
                  Updated existing
                </span>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-amber-50/80 border border-amber-200 text-amber-950 shadow-2xs flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-amber-700 uppercase tracking-wider block">
                  Needs Verification
                </span>
                <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
              </div>
              <div className="mt-1">
                <span className="text-xl sm:text-2xl font-black text-amber-900 block leading-tight">
                  {unverifiedCount.toLocaleString('en-US')}
                </span>
                <span className="text-[10px] text-amber-600 mt-0.5 block truncate">
                  Location unconfirmed
                </span>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 shadow-2xs flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                  Excluded
                </span>
                <ShieldAlert className="w-3.5 h-3.5 text-slate-400" />
              </div>
              <div className="mt-1">
                <span className="text-xl sm:text-2xl font-black text-slate-800 block leading-tight">
                  {excludedCount.toLocaleString('en-US')}
                </span>
                <span className="text-[10px] text-slate-500 mt-0.5 block truncate">
                  Outside window / scope
                </span>
              </div>
            </div>
          </div>
        )}

        {/* ─── WARNINGS CALLOUT ─── */}
        {(result?.warnings || session.warnings).length > 0 && (
          <div className="p-3 rounded-xl bg-amber-50/80 border border-amber-200 text-xs text-amber-900 space-y-1">
            <div className="font-bold flex items-center space-x-1.5 text-amber-800">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
              <span>Provider Warnings</span>
            </div>
            <ul className="list-disc pl-4 space-y-0.5 text-[11px] text-amber-700">
              {(result?.warnings || session.warnings).map(
                (w: string, i: number) => (
                  <li key={i}>{w}</li>
                )
              )}
            </ul>
          </div>
        )}

        {/* ─── 1. SAVED POSTS (Rich Social Post Cards with Author & Metrics) ─── */}
        {postsList.length > 0 && (
          <section className="mt-4 space-y-3" aria-label="Saved posts">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center space-x-1.5">
                <Flame className="w-4 h-4 text-orange-500 fill-orange-500" />
                <span>Saved Posts ({postsList.length.toLocaleString('en-US')})</span>
              </h3>
              <span className="text-[11px] text-emerald-600 font-semibold bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                Ready in Trending Feed
              </span>
            </div>

            <div className="space-y-3">
              {postsList.map((p: any, i: number) => (
                <ScoutPostCard key={p.id || i} post={p} />
              ))}
            </div>
          </section>
        )}

        {/* ─── 2. POSTS NOT SAVED (Audited Skipped List with Author & Metrics) ─── */}
        {skippedList.length > 0 && (
          <section className="mt-5 space-y-2.5" aria-label="Posts not saved">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center space-x-1.5">
                <ShieldAlert className="w-4 h-4 text-slate-400" />
                <span>
                  Posts Not Saved ({skippedList.length.toLocaleString('en-US')})
                </span>
              </h3>
              <span className="text-[11px] text-slate-400">
                Retained for inspection
              </span>
            </div>

            <p className="text-xs text-slate-500 leading-relaxed">
              These provider results were retained for inspection. Unverified or
              outside-scope items have not been added to Trending Posts.
            </p>

            <div className="max-h-64 overflow-y-auto space-y-2 rounded-xl border border-slate-200 bg-slate-50/50 p-2.5">
              {skippedList.map((post: any, idx: number) => (
                <ScoutSkippedPostCard
                  key={`${post.platform}:${post.url || idx}`}
                  post={post}
                />
              ))}
            </div>
          </section>
        )}

        {/* ─── 3. DISCOVERED PROFILES (For Preview task) ─── */}
        {session.kind === 'preview' && candidatesList.length > 0 && (
          <section className="mt-5 space-y-2.5" aria-label="Discovered profiles">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center space-x-1.5">
                <Users className="w-4 h-4 text-slate-400" />
                <span>
                  Discovered Profiles (
                  {candidatesList.length.toLocaleString('en-US')})
                </span>
              </h3>
              <span className="text-[11px] text-slate-400">
                Human confirmation required
              </span>
            </div>

            <p className="text-xs text-slate-500">
              All saved candidates are listed below, including imported and
              rejected profiles.
            </p>

            <div className="max-h-72 overflow-y-auto space-y-2 rounded-xl border border-slate-200 bg-slate-50/50 p-2.5">
              {candidatesList.map((candidate: any) => {
                const imported = result.importedCandidateIds?.includes(
                  candidate.candidateId
                );
                const decision =
                  result.reviewDecisions?.[candidate.candidateId]?.decision;
                const status = imported
                  ? 'Imported'
                  : decision === 'approved'
                  ? 'Approved'
                  : decision === 'rejected'
                  ? 'Rejected'
                  : 'Pending Review';

                return (
                  <div
                    key={candidate.candidateId}
                    className="p-3 rounded-lg bg-white border border-slate-200/80 shadow-2xs flex items-center justify-between gap-3 hover:border-slate-300 transition"
                  >
                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center space-x-2">
                        <PlatformIcon platform={candidate.platform} size="xs" />
                        <a
                          href={
                            typeof candidate.url === 'string' &&
                            /^https?:\/\//.test(candidate.url)
                              ? candidate.url
                              : undefined
                          }
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-bold text-xs text-slate-900 hover:text-indigo-600 transition truncate flex items-center space-x-1"
                        >
                          <span>
                            {candidate.name ||
                              candidate.username ||
                              'Unnamed Profile'}
                          </span>
                          <ExternalLink className="w-3 h-3 text-slate-400" />
                        </a>
                      </div>
                      <p className="text-[11px] text-slate-500">
                        {t(candidate.platform)} · Followers / Members:{' '}
                        {candidate.followers == null
                          ? 'Unknown'
                          : formatNumber(candidate.followers)}
                      </p>
                    </div>

                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold border shrink-0 ${
                        status === 'Imported'
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : status === 'Approved'
                          ? 'bg-blue-50 text-blue-700 border-blue-200'
                          : status === 'Rejected'
                          ? 'bg-rose-50 text-rose-700 border-rose-200'
                          : 'bg-amber-50 text-amber-700 border-amber-200'
                      }`}
                    >
                      {status}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* ─── 4. INSPECTED DETAILS ─── */}
        {result?.data && session.kind === 'inspect' && (
          <dl className="mt-4 grid grid-cols-2 gap-2 text-xs">
            {['name', 'url', 'followers', 'avgViews', 'er'].map((k) => (
              <div
                key={k}
                className="p-3 bg-slate-50 rounded-xl border border-slate-200"
              >
                <dt className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  {
                    {
                      name: 'Name',
                      url: 'Profile URL',
                      followers: 'Followers',
                      avgViews: 'Average Views',
                      er: 'Engagement Rate (%)',
                    }[k]
                  }
                </dt>
                <dd className="font-bold text-slate-900 mt-0.5 text-xs truncate">
                  {result.data[k] == null
                    ? 'Unknown'
                    : typeof result.data[k] === 'number'
                    ? formatNumber(result.data[k])
                    : String(result.data[k])}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </ScoutDialogFrame>
  );
}
