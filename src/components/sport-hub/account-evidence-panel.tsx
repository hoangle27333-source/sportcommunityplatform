'use client';
import { useState, useEffect } from 'react';
import { ENTITY_TYPES, type EntityType } from '@/lib/apify/account-evidence';
import type { DiscoveryCandidate } from '@/lib/apify/scout';
import { t, formatNumber } from '@/lib/i18n';
import { ShieldCheck, MapPin, Users, FileText, ChevronDown } from 'lucide-react';

export function AccountEvidencePanel({
  candidate,
  disabled,
  onCorrect,
  onDraftChange,
}: {
  candidate: DiscoveryCandidate;
  disabled: boolean;
  onCorrect: (type: EntityType) => void;
  onDraftChange?: (type: EntityType) => void;
}) {
  const entity = candidate.entityAssessment;
  const geo = candidate.geographyAssessment;
  const [type, setType] = useState<EntityType>(
    entity?.reviewedType || entity?.suggestedType || 'Unknown'
  );

  useEffect(() => {
    setType(entity?.reviewedType || entity?.suggestedType || 'Unknown');
  }, [entity?.reviewedType, entity?.suggestedType]);

  if (!entity) return null;

  const groups = new Map<string, { label: string; source: string; posts: Set<string>; url?: string }>();
  for (const observation of geo?.observations || []) {
    const label = observation.canonical || observation.raw;
    const key = `${observation.source}:${label}`;
    const group = groups.get(key) || { label, source: observation.source, posts: new Set<string>(), url: observation.postUrl };
    if (observation.postId) group.posts.add(observation.postId);
    groups.set(key, group);
  }

  const isTypeModified = type !== (entity.reviewedType || entity.suggestedType);

  return (
    <section
      className="rounded-xl border border-slate-200/90 bg-slate-50/60 p-3 text-xs space-y-2.5"
      aria-label="Account evidence"
    >
      {/* ─── ROW 1: TYPE CLASSIFICATION & CORRECTION TOOLBAR ─── */}
      <div className="bg-white rounded-lg border border-slate-200 p-2.5 shadow-2xs space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          {/* Correction selector + button */}
          <label className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-bold text-slate-700">Correct account type</span>
            <select
              aria-label={`Correct account type for ${candidate.name}`}
              value={type}
              onChange={(event) => {
                const value = event.target.value as EntityType;
                setType(value);
                onDraftChange?.(value);
              }}
              disabled={disabled}
              className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-800 shadow-2xs focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:bg-slate-100"
            >
              {ENTITY_TYPES.map((value) => (
                <option key={value} value={value}>
                  {t(value)}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={disabled}
              onClick={() => onCorrect(type)}
              className="rounded-lg bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 px-2.5 py-1 text-xs font-bold text-indigo-700 transition cursor-pointer disabled:opacity-40"
            >
              Save type correction
            </button>
          </label>

          {/* Type Status Badges */}
          <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
            <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-600 font-medium">
              Suggested type: <strong className="text-slate-800">{t(entity.suggestedType)}</strong> · {t(entity.status)} · {t(entity.source)}
            </span>
            <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-600 font-medium">
              Reviewed type: <strong className="text-slate-800">{t(entity.reviewedType || 'Not reviewed')}</strong>
            </span>
          </div>
        </div>

        {/* Status Alerts */}
        {isTypeModified && (
          <p className="text-[11px] font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2 py-1">
            Unsaved account type. Save the correction before approving.
          </p>
        )}
        {entity.status !== 'supported' && !entity.reviewedType && (
          <p className="text-[11px] text-slate-500">
            Account type requires confirmation before CRM import.
          </p>
        )}
        {!['Individual', 'Community', 'Club', 'Unknown'].includes(entity.suggestedType) && (
          <p className="text-[11px] font-semibold text-red-600 bg-red-50 border border-red-200 rounded-md px-2 py-1">
            This type is retained for Scout review and cannot be imported into the current CRM.
          </p>
        )}
      </div>

      {/* ─── ROW 2: COMPACT EVIDENCE CARDS GRID ─── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
        {/* Followers / Audience Size */}
        {(candidate.assessment?.followers || candidate.assessment?.members) && (
          <div className="rounded-lg border border-slate-200/80 bg-white p-2.5 space-y-1">
            <div className="font-bold text-slate-700 flex items-center gap-1">
              <Users className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span>{candidate.assessment.followers ? 'Followers range:' : 'Members range:'}</span>
            </div>
            <p className="text-slate-600 leading-snug">
              {candidate.assessment.followers?.reason || candidate.assessment.members?.reason}
            </p>
          </div>
        )}

        {/* Location & Post Sampling */}
        {geo && (
          <div className="rounded-lg border border-slate-200/80 bg-white p-2.5 space-y-1">
            <div className="flex flex-wrap items-center justify-between gap-1">
              <span className="font-bold text-slate-700 flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                <span>Profile location: <span className="font-normal text-slate-600">{t(geo.profileLocation || 'Unknown')}</span></span>
              </span>
              <span className="text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.2 rounded font-medium">
                Recent-post coverage: {formatNumber(geo.coverage.collected)} / 10 posts · {formatNumber(geo.coverage.dated)} dated · {geo.coverage.partial ? 'Partial sample' : 'Latest sample verified'}
              </span>
            </div>
            <p className="text-slate-600 leading-snug">{geo.reason}</p>
            {groups.size > 0 && (
              <ul className="space-y-0.5 pt-0.5">
                {[...groups].map(([key, group]) => (
                  <li key={key} className="text-[10px] text-slate-600 flex flex-wrap items-center gap-1">
                    <span className="inline-block w-1 h-1 rounded-full bg-slate-400"></span>
                    <span>
                      {t(group.label)} · {group.source === 'geotag' ? 'Recent post location' : group.source === 'profile' ? 'Profile location' : 'Mentioned location — needs verification'}
                      {group.posts.size ? ` · ${formatNumber(group.posts.size)} of ${formatNumber(geo.coverage.collected)} posts` : ''}
                    </span>
                    {group.url && (
                      <a href={group.url} target="_blank" rel="noreferrer" className="text-indigo-600 underline hover:text-indigo-800">
                        View evidence
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {/* ─── ROW 3: COLLAPSIBLE AUDIT DETAILS & SOURCES ─── */}
      <details className="text-[11px] text-slate-600 rounded-lg border border-slate-200/80 bg-white p-2 group">
        <summary className="font-semibold text-slate-700 cursor-pointer select-none hover:text-indigo-600 transition flex items-center justify-between">
          <span className="flex items-center gap-1.5">
            <FileText className="w-3.5 h-3.5 text-slate-400" />
            <span>Evidence and missing information</span>
          </span>
          <span className="text-[10px] text-slate-400 font-normal">
            {entity.evidence.length} signals · Click to expand
          </span>
        </summary>
        <div className="mt-2 space-y-2 pt-2 border-t border-slate-100">
          {candidate.assessment?.topic && (
            <div className="space-y-0.5">
              <p className="font-semibold text-slate-700">
                Topic evidence: <span className="font-normal text-slate-600">{candidate.assessment.topic.reason}</span>
              </p>
              {candidate.assessment.topic.evidence.length > 0 && (
                <ul className="list-disc pl-4 space-y-0.5 text-slate-600 mt-0.5">
                  {candidate.assessment.topic.evidence.map((value, index) => (
                    <li key={index}>
                      {/^https?:\/\//.test(value) ? (
                        <a href={value} target="_blank" rel="noreferrer" className="text-indigo-600 underline">
                          View topic evidence
                        </a>
                      ) : (
                        value
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {candidate.manualAttributeReview && (
            <p className="font-semibold text-slate-700">
              Location review: <span className="font-normal text-slate-600">{candidate.assessment?.geography?.reason}</span>
            </p>
          )}

          <p className="text-slate-400 text-[10px]">
            Metrics observed: {candidate.provenance.fetchedAt || 'Unknown'}
          </p>

          {entity.evidence.length > 0 && (
            <ul className="list-disc pl-4 space-y-0.5 text-slate-600">
              {entity.evidence.map((value, index) => (
                <li key={index}>
                  {/^https?:\/\//.test(value) ? (
                    <a href={value} target="_blank" rel="noreferrer" className="text-indigo-600 underline">
                      {value}
                    </a>
                  ) : (
                    value
                  )}
                </li>
              ))}
            </ul>
          )}

          {entity.missingInformation.length > 0 && (
            <div className="space-y-0.5">
              <span className="font-semibold text-slate-700">Missing information:</span>
              {entity.missingInformation.map((value) => (
                <p key={value} className="text-slate-600">• {value}</p>
              ))}
            </div>
          )}

          <p className="text-slate-400 text-[10px]">
            Assessment: {entity.modelVersion}. Model scores are suggestions, not verified accuracy.
          </p>

          {candidate.contentEvidence && (
            <details className="mt-1 pt-1.5 border-t border-slate-100">
              <summary className="font-medium text-slate-700 cursor-pointer">
                Content analysis and discovery sources
              </summary>
              <div className="mt-1 space-y-1 pl-2">
                <p className="text-slate-600">
                  {candidate.contentEvidence.model} · {candidate.contentEvidence.observedAt}
                </p>
                {candidate.contentEvidence.commercialActivity && (
                  <p className="text-emerald-700 font-medium">Commercial activity</p>
                )}
                {candidate.contentEvidence.posts.map((post) => (
                  <p key={post.url} className="text-slate-600">
                    <a className="text-indigo-600 underline" href={post.url} target="_blank" rel="noreferrer">
                      {post.modality} evidence{post.timestamp !== undefined ? ` at ${post.timestamp.toLocaleString('en-US')}s` : ''}
                    </a>: {post.excerpt}
                  </p>
                ))}
                {candidate.discoveryPaths?.map((path, index) => (
                  <p key={index} className="text-slate-500">
                    {path.method} · <a href={path.sourceUrl} className="text-indigo-600 underline" target="_blank" rel="noreferrer">Discovery source</a>{path.query ? ` · ${path.query}` : ''}
                  </p>
                ))}
                <p className="text-slate-400 text-[10px]">
                  Media samples: {Object.keys(candidate.contentEvidence.mediaHashes || {}).length.toLocaleString('en-US')}. Content similarity prioritizes collection; it does not verify eligibility.
                </p>
              </div>
            </details>
          )}
        </div>
      </details>
    </section>
  );
}
