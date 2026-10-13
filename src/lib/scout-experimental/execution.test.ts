import { beforeEach,it,expect,vi } from 'vitest';
const state=vi.hoisted(()=>({calls:[] as any[],failFacebook:false,unknownStart:false,junk:false}));
vi.mock('../supabase/admin',()=>({createAdminClient:()=>({from:()=>{const q:any={select:()=>q,in:async()=>({data:[],error:null})};return q;}})}));
vi.mock('../apify/session-snapshot',()=>({sessionSnapshot:async(_id:any,_ns:any,_key:any,create:any)=>create()}));
vi.mock('../apify/task-checkpoint',()=>({checkpointTask:async(_id:any,_key:any,work:any)=>work()}));
vi.mock('./providers',async importOriginal=>{
 const actual:any=await importOriginal();
 return {...actual,fetchExternal:async(_id:string,c:any,input:any)=>{
  state.calls.push({platform:c.platform,operation:c.operation,input});
  if(state.unknownStart){const error:any=new Error('Provider start unresolved');error.code='START_UNKNOWN';throw error;}
  if(c.platform==='Facebook'&&state.failFacebook)throw new Error('Facebook unavailable');
  const prefix=c.platform==='TikTok'?'https://tiktok.com/@':'https://facebook.com/';
  if(c.operation==='discovery'&&state.junk)return [{profileUrl:`${prefix}thu.vui.texas`,name:'Thú Vui Texas',bio:'Life in America',followers:1000}];
  if(c.operation==='discovery')return [{profileUrl:`${prefix}${input.query==='later'?'good':'weak'+input.query}`,bio:'Badminton enthusiast',followers:1000,entityType:'person'}];
  if(c.operation==='profile')return [{profileUrl:input.url,followers:1000,entityType:'person',location:'Ho Chi Minh City'}];
  if(c.operation==='posts')return input.url.endsWith('good')?Array.from({length:3},(_,i)=>({url:`${input.url}/${c.platform==='TikTok'?'video':'posts'}/${i+1}`,authorUrl:input.url,caption:'Badminton training'})):[];
  return [];
 },analyzeContent:async(_id:any,_cap:any,p:any,topic:string)=>{
  const {validateContentEvidence}=await import('./evidence');
  return validateContentEvidence({entityType:'Individual',identityEvidence:[p.url],posts:p.posts.map((post:any)=>({url:post.url,topic:true,excerpt:post.caption}))},p,topic,'fixture');
 }};
});
import { collectExperimental } from './execution';
const plan=(platforms=['Facebook'])=>({version:6,criteria:{keyword:'badminton',geography:'Ho Chi Minh City',targetType:'Individual KOLs',limit:1,minFollowers:1000},sources:platforms.map(platform=>({platform})),experimental:{knownSeedUrls:[],seeds:[],capabilities:platforms.flatMap(platform=>['discovery','profile','posts','analysis'].map(operation=>({platform,operation,provider:'apify'}))),units:['one','two','three','four','later','six'].flatMap(query=>platforms.map(platform=>({query,platform,method:'content-author'})))}});
beforeEach(()=>{state.calls=[];state.failFacebook=false;state.unknownStart=false;state.junk=false;});
it('continues past a weak first round and counts only fully assessed new profiles',async()=>{
 const result=await collectExperimental({sessionId:'fixture',searchPlan:plan()},new Set(),[]);
 expect(result.stopReason).toBe('target-reached');expect(result.profiles.Facebook.some(p=>p.url.endsWith('good'))).toBe(true);
 expect(state.calls.filter(c=>c.operation==='discovery').length).toBeGreaterThan(4);
});
it('does not count a known CRM account, a seed or saved exclusion feedback toward the target',async()=>{
 const p:any=plan();p.experimental.knownSeedUrls=['https://facebook.com/good'];
 const result=await collectExperimental({sessionId:'fixture',searchPlan:p},new Set(['Facebook:https://facebook.com/weakone']),[]);
 expect(result.stopReason).not.toBe('target-reached');expect(result.profiles.Facebook.some(p=>p.url.endsWith('good'))).toBe(false);
 expect(state.calls.some(c=>c.operation==='profile'&&c.input.url==='https://facebook.com/good')).toBe(false);
});
it('retains another platform after a source fails and interleaves discovery requests',async()=>{
 state.failFacebook=true;const result=await collectExperimental({sessionId:'fixture',searchPlan:plan(['Facebook','TikTok'])},new Set(),[]);
 expect(result.profiles.TikTok.length).toBeGreaterThan(0);expect(result.warnings).toContain('Facebook unavailable');
 expect(state.calls.filter(c=>c.operation==='discovery').slice(0,2).map(c=>c.platform)).toEqual(['Facebook','TikTok']);
 expect(state.calls.filter(c=>c.operation==='discovery').length).toBeLessThanOrEqual(12);
});
it('stops unresolved starts and retains a partial result without starting another operation',async()=>{
 state.unknownStart=true;
 const result=await collectExperimental({sessionId:'fixture',searchPlan:plan(['Facebook','TikTok'])},new Set(),[]);
 expect(result.stopReason).toBe('provider-start-unresolved');expect(state.calls).toHaveLength(1);expect(result.warnings).toContain('Provider start unresolved');
});

it('audits unrelated provider hits without enriching or counting them as new accounts',async()=>{
 state.junk=true;
 const result=await collectExperimental({sessionId:'fixture',searchPlan:plan()},new Set(),[]);
 expect(Object.values(result.profiles).flat()).toHaveLength(0);
 expect(result.discardedDiscovery?.map(p=>p.name)).toEqual(['Thú Vui Texas']);
 expect(state.calls.every(c=>c.operation==='discovery')).toBe(true);
 expect(result.rounds.every(r=>r.newCandidates===0&&r.qualifiedNew===0)).toBe(true);
});
