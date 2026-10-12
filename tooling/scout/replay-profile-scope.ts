/** Read-only assessment of saved provider rows; never starts a provider or updates a session. */
import { readFileSync, writeFileSync } from 'node:fs';
import { parseProfile, mergeProfileEvidence } from '../../src/lib/apify/providers';
import { assessSearchProfile } from '../../src/lib/apify/search-assessment';
const env=Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>/^[A-Z_]+=/.test(l)).map(l=>{const i=l.indexOf('=');return [l.slice(0,i),l.slice(i+1).trim().replace(/^['"]|['"]$/g,'')]}));
const sessionId=process.argv[2];if(!/^[a-f0-9-]{36}$/.test(sessionId || ''))throw new Error('A session UUID is required');
const headers={apikey:env.SUPABASE_SERVICE_ROLE_KEY,Authorization:`Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`};
async function read(query:string){const response=await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${query}`,{headers});if(!response.ok)throw new Error(`Evidence read failed: ${response.status}`);return response.json();}
const [session]=await read(`scout_sessions?select=params& id=eq.${sessionId}`.replace('& id','&id'));
const runs=await read(`scout_provider_runs?select=platform,task,normalized_rows,raw_rows&session_id=eq.${sessionId}&state=eq.succeeded`);
const profiles=new Map<string,any>();
for(const run of runs.filter((r:any)=>r.task==='profiles'))for(const row of run.normalized_rows ?? run.raw_rows ?? []){const p=parseProfile(row,run.platform);if(p)profiles.set(p.url,p);}
for(const run of runs.filter((r:any)=>r.task==='profile-details'))for(const row of run.normalized_rows ?? run.raw_rows ?? []){const p=parseProfile(row,run.platform);if(p && profiles.has(p.url))profiles.set(p.url,mergeProfileEvidence(profiles.get(p.url),p));}
const items=[...profiles.values()].map(p=>({name:p.name,url:p.url,category:p.category,location:p.location,...assessSearchProfile(p,session.params.keyword,session.params.geography,session.params.targetType)}));
const receipt={checkedAt:new Date().toISOString(),sessionId,mode:'read-only saved evidence; zero provider requests or database writes',criteria:session.params,counts:Object.fromEntries(['Qualified','Needs Verification','Excluded'].map(group=>[group,items.filter(p=>p.resultGroup===group).length])),items};
const output=process.argv[3];if(output)writeFileSync(output,JSON.stringify(receipt,null,2)+'\n');
console.log(JSON.stringify({counts:receipt.counts,items:items.filter(p=>['HYROX Thailand','Bull City CrossFit','WeBorn 薈生','GSR FIT','HYROX Salt Lake City 2026'].includes(p.name)).map(p=>({name:p.name,classification:p.classification,resultGroup:p.resultGroup,location:p.location,reasons:p.reasons}))},null,2));
