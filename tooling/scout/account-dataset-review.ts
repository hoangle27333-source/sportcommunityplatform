import { evidenceHash } from '../../src/lib/apify/account-model';
import { ENTITY_TYPES } from '../../src/lib/apify/account-evidence';
import { canonicalUrl,platformMatches,urlKind } from '../../src/lib/apify/discovery-quality';
export function inspectAccountDataset(records:any[]){
 const issues:{index:number;code:string;detail:string}[]=[],seen=new Set<string>();
 const platforms=['Instagram','TikTok','Facebook'],classes=ENTITY_TYPES.filter(type=>type!=='Unknown');
 const counts=Object.fromEntries(platforms.map(platform=>[platform,Object.fromEntries(classes.map(type=>[type,0]))]));
 let reviewed=0,pending=0,unknown=0,twoReviewers=0;
 records.forEach((record,index)=>{
  const {profile,annotation}=record || {};
  if(!profile || !platforms.includes(profile.platform) || !platformMatches(profile.platform,canonicalUrl(profile.url || '')) || !['profile','group'].includes(urlKind(canonicalUrl(profile.url || ''))) || typeof profile.name!=='string' || typeof profile.bio!=='string' || !Array.isArray(profile.posts)){issues.push({index,code:'INVALID_PROFILE',detail:'Saved normalized profile evidence is required.'});return;}
  const key=`${profile.platform}:${canonicalUrl(profile.url)}`;
  if(seen.has(key))issues.push({index,code:'DUPLICATE_ACCOUNT',detail:'Duplicate account identity; preserve and reconcile evidence before training.'});seen.add(key);
  if(!annotation?.label){pending++;return;}
  if(!ENTITY_TYPES.includes(annotation.label)){issues.push({index,code:'INVALID_LABEL',detail:'Reviewer label is outside the account taxonomy.'});return;}
  const reviewers=Array.isArray(annotation.reviewers)?[...new Set<string>(annotation.reviewers.filter((id:unknown)=>typeof id==='string' && id.trim()))]:[];
  if(typeof annotation.subjectKey!=='string' || !annotation.subjectKey.trim() || !reviewers.length || !Number.isFinite(Date.parse(annotation.confirmedAt)) || !Array.isArray(annotation.evidenceUrls) || !annotation.evidenceUrls.length || annotation.evidenceUrls.some((url:unknown)=>typeof url!=='string' || !/^https?:\/\//.test(url))){issues.push({index,code:'REVIEW_INCOMPLETE',detail:'Explicit subject link, reviewer, confirmation date and checked evidence references are required.'});return;}
  if(annotation.evidenceHash!==evidenceHash(profile)){issues.push({index,code:'EVIDENCE_CHANGED',detail:'Evidence changed since reviewer confirmation; obtain a new review.'});return;}
  if(annotation.label==='Unknown'){unknown++;return;}
  reviewed++;if(reviewers.length>=2)twoReviewers++;counts[profile.platform][annotation.label]++;
 });
 const missing=platforms.flatMap(platform=>classes.filter(type=>counts[platform][type]<50).map(type=>({platform,type,reviewed:counts[platform][type],needed:50-counts[platform][type]})));
 return {total:records.length,reviewed,pending,unknown,twoReviewers,counts,missing,issues,trainingInputReady:reviewed>=900 && pending===0 && unknown===0 && issues.length===0 && missing.length===0,qualityGate:false,runtimeGate:false};
}
