import { createAdminClient } from '@/lib/supabase/admin';
import { inputKey } from './runtime';
import {sessionSnapshot} from './session-snapshot';
export function quotas(platforms:string[],limit:number) { const names=[...new Set(platforms)].sort(); return names.map((platform,i)=>({platform,limit:Math.floor(limit/names.length)+(i<limit%names.length ? 1 : 0)})); }
export function roundRobin<T>(groups:T[][],limit:number) { const result:T[]=[]; for(let i=0;result.length<limit && groups.some(g=>i<g.length);i++) for(const g of groups) if(i<g.length && result.length<limit) result.push(g[i]); return result; }
export async function retrievalWindow(platform:string,task:string,query:string,sessionId:string) {
 const scopeKey=inputKey(platform,'watermark',task,{query}); const db=createAdminClient();
 const newerThan=await sessionSnapshot(sessionId,'retrievalWindows',scopeKey,async createdAt=>{
  const {data,error}=await db.from('scout_watermarks').select('*').eq('scope_key',scopeKey).maybeSingle(); if(error)throw error;
  return new Date(data ? Date.parse(data.published_at)-86400000 : Date.parse(createdAt)-30*86400000).toISOString();
 });
 return {scopeKey,newerThan};
}

export async function advanceWatermark(scopeKey:string,posts:{publishedAt?:string}[],complete:boolean) {
 if(!complete) return; const dates=posts.map(p=>p.publishedAt).filter(Boolean).sort() as string[]; if(!dates.length) return;
 const {error}=await createAdminClient().rpc('advance_scout_watermark',{p_scope:scopeKey,p_published:dates[dates.length-1]}); if(error) throw error;
}
