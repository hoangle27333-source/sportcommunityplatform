import {getStoredEntityChannels} from '@/lib/sport-hub/channel-store';
import { createHash } from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { scrape, parseProfile, parsePost, ScoutError, PendingScout, type SocialProfile } from './providers';
import { canonicalUrl, platformMatches } from './discovery-quality';
import { scrapeProfile } from '@/lib/scraper/scraper-adapter';
export function channelUrl(entity:any, platform:string) {
  const urls=[...(entity.channels || []).filter((c:any)=>c.isPrimary).map((c:any)=>c.url || c.profileUrl || c.profile_url),entity.profile_url,entity.group_url,...(entity.channels || []).map((c:any)=>c.url || c.profileUrl || c.profile_url),entity.profile_url,entity.group_url];
  return urls.map(u=>canonicalUrl(u || '')).find(u=>u && platformMatches(platform,u));
}
export function observedMetrics(profile:SocialProfile, posts=profile.posts) {
  const views=posts.filter(p=>p.views!==null); const interactions=posts.filter(p=>p.likes!==null && p.comments!==null);
  return {followers:profile.followers,avgViews:views.length ? Math.round(views.reduce((sum,p)=>sum+p.views!,0)/views.length) : null,
    er:profile.followers!==null && profile.followers>0 && interactions.length ? Number((interactions.reduce((sum,p)=>sum+p.likes!+p.comments!,0)/interactions.length/profile.followers*100).toFixed(2)) : null,
    viewsSample:views.length,erSample:interactions.length,formula:'mean(likes + comments) / followers * 100'};
}
export async function syncEntity(sessionId:string,id:string,kind:'kol'|'community'|'tracked') {
  const db=createAdminClient(); const table=kind==='kol' ? 'kols' : kind==='community' ? 'communities' : 'tracked_accounts';
  const {data:entity,error}=await db.from(table).select('*').eq('id',id).single(); if(error) throw error;
  if(kind!=='tracked' && !entity.channels?.length) entity.channels=getStoredEntityChannels(kind,id,entity.name) || entity.channels;
  const primaryUrl=[(entity.channels || []).find((c:any)=>c.isPrimary)?.url,entity.profile_url,entity.group_url,...(entity.channels || []).map((c:any)=>c.url)].map(u=>canonicalUrl(u || '')).find(u=>['Instagram','Facebook','TikTok'].some(p=>platformMatches(p,u))) || '';
  const platform=kind==='tracked' ? entity.platform==='facebook' ? 'Facebook' : 'Instagram' : platformMatches('Instagram',primaryUrl) ? 'Instagram' : platformMatches('TikTok',primaryUrl) ? 'TikTok' : platformMatches('Facebook',primaryUrl) ? 'Facebook' : (entity.platform || '').includes('Instagram') ? 'Instagram' : (entity.platform || '').includes('TikTok') ? 'TikTok' : 'Facebook';
  const url=channelUrl(entity,platform); if(!url) throw new ScoutError(`A verified ${platform} URL is required.`,'PROFILE_URL_REQUIRED',400);
  let profile:SocialProfile | null=null; let posts:any[]=[]; let fallback=false;
  let fallbackReceipt=entity.scrape_metadata?.fallbackReceipt;
  try {
    const rows=await scrape(sessionId,platform,'profile-details',url,1); profile=rows.map(r=>parseProfile(r,platform)).find(p=>canonicalUrl(p?.url || '')===url) || null;
    if(!profile) throw new ScoutError('Provider could not access this profile.','ACCESS_UNAVAILABLE');
    if(kind!=='community' || !url.includes('/groups/')) posts=(await scrape(sessionId,platform,'profile-posts',url,10)).map(r=>parsePost(r,platform)).filter(p=>canonicalUrl(p?.authorUrl || '')===url);
  } catch(e:any) {
    if(e instanceof PendingScout) throw e;
    if(kind!=='tracked' || !['ACCESS_UNAVAILABLE','PROVIDER_UNAVAILABLE','FAILED','TIMED-OUT'].includes(e.code)) throw e;
    let p:any;
    if(fallbackReceipt?.sessionId===sessionId) {
      if(fallbackReceipt.state!=='complete') throw new ScoutError('The public fallback was already attempted. Start a new session to retry.','FALLBACK_ALREADY_ATTEMPTED');
      p=fallbackReceipt.observation;
    } else {
      fallbackReceipt={sessionId,state:'started',observedAt:new Date().toISOString()};
      const {error:mark}=await db.from(table).update({scrape_metadata:{...entity.scrape_metadata,fallbackReceipt}}).eq('id',id);if(mark)throw mark;
      p=await scrapeProfile(platform==='Facebook' ? 'facebook' : 'instagram',url);
      fallbackReceipt={...fallbackReceipt,state:'complete',observation:p};
      const {error:receipt}=await db.from(table).update({scrape_metadata:{...entity.scrape_metadata,fallbackReceipt}}).eq('id',id);if(receipt)throw receipt;
    }
    fallback=true;
    profile={username:p.username,name:p.displayName,bio:p.bio || '',url,platform,followers:p.followersCount ?? null,avgViews:null,likes:null,comments:null,er:null,avatarUrl:p.avatarUrl || '',category:'',entityType:'',location:'',posts:[]};
    posts=(p.recentPosts || []).map((post:any)=>({...post,views:post.views ?? null,likes:post.likes ?? null,comments:post.comments ?? null}));
  }
  const metrics=observedMetrics(profile!,posts);
  const provenance={...profile!.provenance,source:fallback ? 'public-playwright' : 'apify',fetchedAt:profile!.provenance?.fetchedAt || (fallback ? fallbackReceipt.observedAt : new Date().toISOString()),derived:metrics};
  const locked=new Set(entity.user_locked_fields || []); const update:any={};
  const fields=kind==='tracked' ? {followers:'followers_count',avgViews:null,er:'engagement_rate'} : kind==='community' ? {followers:'members_count',avgViews:null,er:null} : {followers:'followers',avgViews:'avg_views',er:'er'};
  for(const [key,column] of Object.entries(fields)) if(column && (metrics as any)[key]!==null && !locked.has(key) && !locked.has(column)) update[column]=(metrics as any)[key];
  const missing=Object.keys(fields).filter(k=>(fields as any)[k] && (metrics as any)[k]===null);
  if(kind==='tracked') Object.assign(update,{status:'active',last_scraped_at:provenance.fetchedAt,scrape_metadata:{provenance,missingMetrics:missing,...(fallback ? {fallbackReceipt} : {})},error_message:null});
  else Object.assign(update,{scout_provenance:provenance,scout_missing_metrics:missing.map(k=>kind==='community' && k==='followers' ? 'members' : k),...(kind==='kol' ? {last_scouted_at:provenance.fetchedAt} : {})});
  if(kind==='kol' && profile!.bio && profile!.bio!==entity.bio && !locked.has('bio')) update.pending_scout_diff={scoutedAt:provenance.fetchedAt,changes:{bio:{current:entity.bio,scouted:profile!.bio}}};
  if(kind!=='tracked' && Array.isArray(entity.channels) && !locked.has('channels')) update.channels=entity.channels.map((channel:any)=>{if(canonicalUrl(channel.url || '')!==url)return channel;const observed:any={...channel,scoutProvenance:provenance,missingMetrics:missing};for(const key of ['followers','avgViews','er'])if((metrics as any)[key]!==null && !locked.has(key) && !locked.has((fields as any)[key]))observed[kind==='community' && key==='followers' ? 'members' : key]=(metrics as any)[key];return observed;});
  const {error:save}=await db.from(table).update(update).eq('id',id); if(save) throw save;
  const observationKey=profile!.provenance?.runId || `${sessionId}:fallback`;
  if(kind==='tracked') { const {error}=await db.from('tracked_account_snapshots').upsert({tracked_account_id:id,observation_key:observationKey,followers_count:metrics.followers,avg_views:metrics.avgViews,engagement_rate:metrics.er,recent_posts:posts,captured_at:provenance.fetchedAt},{onConflict:'tracked_account_id,observation_key'}); if(error) throw error; }
  if(kind==='kol' && metrics.followers!==null && metrics.avgViews!==null && metrics.er!==null) { const {error}=await db.from('kol_metric_snapshots').upsert({kol_id:id,scout_session_id:sessionId,followers:metrics.followers,avg_views:metrics.avgViews,er:metrics.er,scout_provenance:provenance},{onConflict:'kol_id,scout_session_id',ignoreDuplicates:true}); if(error) throw error; }
  return {id,missingMetrics:missing,provenance};
}
export async function commentPreview(kolId:string) {
  const db=createAdminClient();
  const {data:posts,error}=await db.from('scouted_posts').select('id,post_url,platform,title,published_at,comments').eq('kol_id',kolId).gt('comments',0).order('published_at',{ascending:false,nullsFirst:false}).limit(5); if(error) throw error;
  const ids=(posts || []).map(p=>p.id); const {data:evidence,error:ee}=ids.length ? await db.from('scout_comment_evidence').select('post_id,collected_at').in('post_id',ids) : {data:[],error:null}; if(ee) throw ee;
  const {data:policy,error:policyError}=await db.from('scout_budget_settings').select('session_usd,daily_usd,run_usd,tiktok_run_usd,enabled').single();if(policyError)throw policyError;
  const budgetCeilingUsd=policy?.enabled ? Math.min(Number(policy.session_usd),Number(policy.daily_usd),(posts || []).reduce((sum,post)=>sum+Number(post.platform?.includes('TikTok') ? policy.tiktok_run_usd : policy.run_usd),0)) : 0;
  return {success:true,posts:posts || [],commentsPerPost:20,maxComments:100,budgetCeilingUsd,cachedPosts:ids.filter(id=>evidence?.some(e=>e.post_id===id && Date.now()-Date.parse(e.collected_at)<86400000)).length};
}
async function collectComments(session:any) {
  const db=createAdminClient();
  const {data:selected,error:selectionError}=await db.from('scouted_posts').select('id,post_url,platform,title').eq('kol_id',session.params.kolId).in('id',session.params.selectedPostIds || []); if(selectionError) throw selectionError;
  const preview={posts:selected || []}; let count=0; let completedPosts=0; const warnings:string[]=[]; const failures:any[]=[];
  for(const post of preview.posts) {
    const platform=post.platform.includes('Instagram') ? 'Instagram' : post.platform.includes('TikTok') ? 'TikTok' : 'Facebook';
    let rows:any[];
    try { rows=await scrape(session.id,platform,'comments',post.post_url,20); } catch(e:any) { if(e instanceof PendingScout) throw e; warnings.push(e.message); failures.push({postId:post.id,code:e.code || 'PROVIDER_ERROR',error:e.message}); continue; }
    for(const row of rows.slice(0,20)) {
      const text=row.text ?? row.commentText ?? row.comment ?? row.content; if(typeof text!=='string' || !text.trim()) continue;
      const commentKey=String(row.id || row.cid || row.commentId || createHash('sha256').update(text).digest('hex'));
      const rawDate=row.timestamp || row.createTimeISO || row.createTime;
      const date=typeof rawDate==='number' ? new Date(rawDate<1e12 ? rawDate*1000 : rawDate).toISOString() : rawDate;
      const {error}=await db.from('scout_comment_evidence').upsert({post_id:post.id,comment_key:commentKey,text,published_at:date && Number.isFinite(Date.parse(date)) ? new Date(date).toISOString() : null,provenance:{...row._provenance,sampling:'Provider default ordering; bounded sample'},collected_at:row._provenance?.fetchedAt || new Date().toISOString()},{onConflict:'post_id,comment_key'}); if(error) throw error; count++;
    }
    const {data:evidence,error}=await db.from('scout_comment_evidence').select('id,text').eq('post_id',post.id).order('collected_at',{ascending:false}).limit(20); if(error) throw error;
    const {error:save}=await db.from('scouted_posts').update({comments_sample:(evidence || []).map(e=>({id:e.id,text:e.text}))}).eq('id',post.id); if(save) throw save; completedPosts++;
  }
  if(failures.length && !completedPosts) return {success:false,error:failures[0].error,code:failures[0].code,httpStatus:502,counts:{comments:0,failed:failures.length},failed:failures,warnings};
  return {success:true,counts:{comments:count,completedPosts,failed:failures.length},partial:warnings.length>0,warnings,message:`Collected ${count} comment observations.`};
}
export async function executeExtendedSession(s:any):Promise<any> {
  if(s.kind==='comments') return collectComments(s);
  if(s.kind==='inspect') {
    const platform=s.params.platform; const rows=await scrape(s.id,platform,'profile-details',s.params.url,1);
    const profile=rows.map(r=>parseProfile(r,platform)).find(Boolean);
    if(!profile) throw new ScoutError('No verified profile details were returned.','EMPTY_PROFILE');
    return {success:true,data:profile,counts:{found:1}};
  }
  if(s.kind==='verification') { const rows=await scrape(s.id,s.params.platform,s.params.task,s.params.query,s.params.limit || 1); return {success:true,rows}; }
  if(s.kind==='sync' || s.kind==='tracked') {
    const ids=s.kind==='tracked' ? [s.params.trackedAccountId] : s.params.ids; const results:any[]=[]; const failed:any[]=[];
    for(const id of ids) { try {results.push(await syncEntity(s.id,id,s.kind==='tracked' ? 'tracked' : s.params.entityType));} catch(e:any) {if(e instanceof PendingScout) throw e; failed.push({id,error:e.message,code:e.code});} }
    if(s.kind==='tracked' && failed.length) { const {error}=await createAdminClient().from('tracked_accounts').update({status:'error',error_message:failed[0].error}).eq('id',ids[0]); if(error) throw error; }
    return {success:results.length>0,partial:failed.length>0,counts:{refreshed:results.length,failed:failed.length},syncedCount:results.length,updatedRecords:results,failed,message:`Refreshed ${results.length}; failed ${failed.length}.`};
  }
  throw new ScoutError('Unknown scout task.','INVALID_TASK',400);
}
