'use client';
import { useState, useEffect } from 'react';
import { ENTITY_TYPES, type EntityType } from '@/lib/apify/account-evidence';
import type { DiscoveryCandidate } from '@/lib/apify/scout';
import { t, formatNumber } from '@/lib/i18n';

export function AccountEvidencePanel({candidate,disabled,onCorrect,onDraftChange}:{candidate:DiscoveryCandidate;disabled:boolean;onCorrect:(type:EntityType)=>void;onDraftChange?:(type:EntityType)=>void}) {
  const entity=candidate.entityAssessment,geo=candidate.geographyAssessment;
  const [type,setType]=useState<EntityType>(entity?.reviewedType || entity?.suggestedType || 'Unknown');
  useEffect(()=>{
    setType(entity?.reviewedType || entity?.suggestedType || 'Unknown');
  },[entity?.reviewedType,entity?.suggestedType]);
  if(!entity)return null;
  const groups=new Map<string,{label:string;source:string;posts:Set<string>;url?:string}>();
  for(const observation of geo?.observations || []) {
    const label=observation.canonical || observation.raw,key=`${observation.source}:${label}`;
    const group=groups.get(key) || {label,source:observation.source,posts:new Set<string>(),url:observation.postUrl};
    if(observation.postId)group.posts.add(observation.postId);groups.set(key,group);
  }
  return <section className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs space-y-2" aria-label="Account evidence">
    <p><strong>Suggested type:</strong> {t(entity.suggestedType)} · {t(entity.status)} · {t(entity.source)}</p>
    <p><strong>Reviewed type:</strong> {t(entity.reviewedType || 'Not reviewed')}</p>
    <label className="flex flex-wrap items-center gap-2">Correct account type
      <select aria-label={`Correct account type for ${candidate.name}`} value={type} onChange={event=>{const value=event.target.value as EntityType;setType(value);onDraftChange?.(value);}} disabled={disabled} className="rounded border border-slate-300 p-1">
        {ENTITY_TYPES.map(value=><option key={value} value={value}>{t(value)}</option>)}
      </select>
      <button type="button" disabled={disabled} onClick={()=>onCorrect(type)} className="rounded border border-indigo-300 px-2 py-1 text-indigo-700">Save type correction</button>
    </label>
    {type!==(entity.reviewedType || entity.suggestedType) && <p className="text-amber-700">Unsaved account type. Save the correction before approving.</p>}
    {entity.status!=='supported' && !entity.reviewedType && <p className="text-slate-500">Account type requires confirmation before CRM import.</p>}
    {candidate.assessment?.followers && <p><strong>Followers range:</strong> {candidate.assessment.followers.reason}</p>}
    {candidate.assessment?.members && <p><strong>Members range:</strong> {candidate.assessment.members.reason}</p>}
    {candidate.assessment?.topic && <div><p><strong>Topic evidence:</strong> {candidate.assessment.topic.reason}</p><ul>{candidate.assessment.topic.evidence.map((value,index)=><li key={index}>{/^https?:\/\//.test(value)?<a href={value} target="_blank" rel="noreferrer" className="underline">View topic evidence</a>:value}</li>)}</ul></div>}
    {candidate.manualAttributeReview && <p><strong>Location review:</strong> {candidate.assessment?.geography?.reason}</p>}
    {candidate.contentEvidence && <details><summary>Content analysis and discovery sources</summary>
      <p>{candidate.contentEvidence.model} · {candidate.contentEvidence.observedAt}</p>
      {candidate.contentEvidence.commercialActivity && <p>Commercial activity</p>}
      {candidate.contentEvidence.posts.map(post=><p key={post.url}><a className="underline" href={post.url} target="_blank" rel="noreferrer">{post.modality} evidence{post.timestamp!==undefined?` at ${post.timestamp.toLocaleString('en-US')}s`:''}</a>: {post.excerpt}</p>)}
      {candidate.discoveryPaths?.map((path,index)=><p key={index}>{path.method} · <a href={path.sourceUrl} className="underline" target="_blank" rel="noreferrer">Discovery source</a>{path.query?` · ${path.query}`:''}</p>)}
      <p>Media samples: {Object.keys(candidate.contentEvidence.mediaHashes || {}).length.toLocaleString('en-US')}. Content similarity prioritizes collection; it does not verify eligibility.</p>
    </details>}
    <p>Metrics observed: {candidate.provenance.fetchedAt || 'Unknown'}</p>
    {geo && <><p><strong>Profile location:</strong> {t(geo.profileLocation || 'Unknown')}</p>
      <p><strong>Recent-post coverage:</strong> {formatNumber(geo.coverage.collected)} / 10 posts · {formatNumber(geo.coverage.dated)} dated · {geo.coverage.partial?'Partial sample':'Latest sample verified'}</p>
      <p>{geo.reason}</p>
      <ul className="space-y-1">{[...groups].map(([key,group])=><li key={key}>{t(group.label)} · {group.source==='geotag'?'Recent post location':group.source==='profile'?'Profile location':'Mentioned location — needs verification'}{group.posts.size?` · ${formatNumber(group.posts.size)} of ${formatNumber(geo.coverage.collected)} posts`:''}{group.url && <> · <a href={group.url} target="_blank" rel="noreferrer" className="underline">View evidence</a></>}</li>)}</ul>
    </>}
    <details><summary className="cursor-pointer">Evidence and missing information</summary>
      <ul>{entity.evidence.map((value,index)=><li key={index}>{/^https?:\/\//.test(value)?<a href={value} target="_blank" rel="noreferrer" className="underline">{value}</a>:value}</li>)}</ul>
      {entity.missingInformation.map(value=><p key={value}>{value}</p>)}
      <p>Assessment: {entity.modelVersion}. Model scores are suggestions, not verified accuracy.</p>
    </details>
    {!['Individual','Community','Club','Unknown'].includes(entity.suggestedType) && <p>This type is retained for Scout review and cannot be imported into the current CRM.</p>}
  </section>;
}
