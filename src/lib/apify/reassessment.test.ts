import {afterEach,beforeEach,it,expect,vi} from 'vitest';
const state=vi.hoisted(()=>({tables:{} as Record<string,any[]>,owner:'00000000-0000-0000-0000-000000000001',role:'editor',paid:vi.fn(),dispatch:vi.fn()}));
vi.mock('@/lib/auth/financial-sanitizer',()=>({getServerUserRole:async()=>({userId:state.owner,role:state.role})}));
vi.mock('./workflow-dispatch',()=>({dispatchScoutSession:state.dispatch}));
vi.mock('./runtime',async()=>({...await vi.importActual<any>('./runtime'),executePlan:state.paid}));
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:()=>({from(table:string){let operation='read',value:any,lo=0,hi=Infinity;const filters:((r:any)=>boolean)[]=[];const field=(r:any,k:string)=>k.startsWith('params->>')?String(r.params?.[k.slice(9)]):r[k];const result=()=>{const rows=state.tables[table] ||= [];if(operation==='insert'){if(rows.some(r=>r.id===value.id))return {data:null,error:{code:'23505'}};const entry={status:'pending',created_at:'2026-10-11T00:00:00Z',...value};rows.push(entry);return {data:[structuredClone(entry)],error:null};}const matched=rows.filter(r=>filters.every(f=>f(r)));if(operation==='update')matched.forEach(r=>Object.assign(r,value));return {data:structuredClone(matched.slice(lo,hi+1)),error:null};};const q:any={select:()=>q,order:()=>q,range:(a:number,b:number)=>{lo=a;hi=b;return q;},limit:(n:number)=>{hi=n-1;return q;},eq:(k:string,v:any)=>{filters.push(r=>k==='params'?JSON.stringify(r.params)===v:field(r,k)===v);return q;},in:(k:string,v:any[])=>{filters.push(r=>v.includes(field(r,k)));return q;},insert:(v:any)=>{operation='insert';value=v;return q;},update:(v:any)=>{operation='update';value=v;return q;},single:async()=>{const r=result();return {...r,data:r.data?.[0]};},maybeSingle:async()=>{const r=result();return {...r,data:r.data?.[0] || null};},then:(resolve:any,reject:any)=>Promise.resolve(result()).then(resolve,reject)};return q;}})}));
import {reassessSession,executeStoredReassessment} from './reassessment';
import {parseProfile} from './providers';
import {contextKey} from './discovery-quality';
const source='00000000-0000-0000-0000-000000000002';
it('replays the latest saved manual review rather than the original collection result',async()=>{
 const parent=state.tables.scout_sessions[0];
 parent.kind='preview';parent.params={keyword:'badminton',platform:'Instagram',geography:'Ho Chi Minh City',limit:1,assessmentRevision:7,accountPolicyVersion:5,searchStrategy:'seed_content_v1',keywordsApproved:true,approvedKeywords:['badminton']};
 const p={...parseProfile({profileUrl:'https://instagram.com/alex',followers:1200},'Instagram')!,entityAssessment:{suggestedType:'Individual',reviewedType:'Individual',status:'supported',source:'review',evidence:[],missingInformation:[],modelVersion:'review'}};
 parent.result={success:true,candidates:[structuredClone(p)]};
 parent.candidates=[{...p,manualAttributeReview:{contextKey:contextKey('badminton','Ho Chi Minh City'),topic:'passed',geography:'passed',actorId:state.owner,confirmedAt:'2026-10-13T00:00:00Z'}}];
 parent.progress={reviewRevision:'latest-review'};
 const original=structuredClone(parent);
 const first=await (await reassessSession(source)).json();
 const child=state.tables.scout_sessions.find(s=>s.id===first.sessionId);
 const result=await executeStoredReassessment(child);
 expect(result.candidates).toHaveLength(1);expect(result.candidates[0]).toMatchObject({resultGroup:'Qualified',entityAssessment:{reviewedType:'Individual'}});
 expect(result.providerStarts).toBe(0);expect(state.paid).not.toHaveBeenCalled();
 expect(state.tables.scout_sessions[0]).toEqual(original);
 expect((await (await reassessSession(source)).json()).sessionId).toBe(first.sessionId);
 parent.progress.reviewRevision='new-review';
 expect((await (await reassessSession(source)).json()).sessionId).not.toBe(first.sessionId);
});
beforeEach(()=>{state.role='editor';state.paid.mockReset();state.dispatch.mockReset();state.tables={scout_sessions:[{id:source,owner_id:state.owner,kind:'trends',status:'complete',created_at:'2026-10-11T00:00:00Z',params:{keyword:'#running',platform:'Facebook',geography:'Toàn quốc',limit:10,recentDays:7,qualityMode:'high-engagement'},result:{success:true,posts:[]},review_decisions:{old:{decision:'approved'}}}],scout_provider_runs:[{id:'receipt',session_id:source,state:'succeeded',platform:'Facebook',task:'hashtag',normalized_rows:[{url:'https://facebook.com/posts/123',text:'Race day',time:'2026-10-10T00:00:00Z',likes:200,comments:0,textReferences:[{url:'https://facebook.com/hashtag/running'}]}]}],kols:[],communities:[],scout_feedback:[]};});
it('creates one child for repeated requests and replays saved content without paid runs or CRM writes',async()=>{
 const original=structuredClone(state.tables.scout_sessions[0]),ledger=structuredClone(state.tables.scout_provider_runs);
 const first=await (await reassessSession(source)).json();const again=await (await reassessSession(source)).json();
 expect(first.sessionId).toBe(again.sessionId);expect(state.tables.scout_sessions).toHaveLength(2);expect(state.dispatch).toHaveBeenCalledTimes(1);
 const child=state.tables.scout_sessions[1];expect(child.params).toMatchObject({parentSessionId:source,geography:'Nationwide',executionMode:'stored-evidence',evidenceCreatedAt:original.created_at});
 const result=await executeStoredReassessment(child);expect(result).toMatchObject({providerStarts:0,parentSessionId:source,totalScouted:1,counts:{inserted:0}});expect(result.posts[0].hashtags).toContain('running');
 expect(state.paid).not.toHaveBeenCalled();expect(state.tables.scouted_posts).toBeUndefined();expect(state.tables.scout_watermarks).toBeUndefined();expect(state.tables.scout_sessions[0]).toEqual(original);expect(state.tables.scout_provider_runs).toEqual(ledger);
});
it('keeps unrelated HCMC profiles excluded with inspectable diagnostics',async()=>{
 const parent=state.tables.scout_sessions[0];Object.assign(parent,{kind:'preview',params:{keyword:'Running',platform:'Facebook',geography:'Ho Chi Minh City',limit:5}});
 Object.assign(state.tables.scout_provider_runs[0],{task:'profiles',normalized_rows:[{url:'https://facebook.com/irrelevant',name:'Hồ Chí Minh',description:'Ho Chi Minh City',followersCount:100}]});
 await reassessSession(source);const result=await executeStoredReassessment(state.tables.scout_sessions[1]);expect(result.candidates).toHaveLength(1);expect(result.candidates[0].reviewState).toBe('Excluded');expect(result.diagnostics).toMatchObject({providerCount:1,excludedCount:1});expect(Object.values(result.diagnostics.reasonCounts)).toContain(1);expect(state.paid).not.toHaveBeenCalled();
});
it('enforces editor and ownership checks and rejects failed sources',async()=>{
 state.role='viewer';await expect(reassessSession(source)).rejects.toMatchObject({code:'FORBIDDEN'});
 state.role='editor';state.tables.scout_sessions[0].owner_id='other';await expect(reassessSession(source)).rejects.toMatchObject({code:'NOT_FOUND'});
 state.tables.scout_sessions[0].owner_id=state.owner;state.tables.scout_sessions[0].status='failed';await expect(reassessSession(source)).rejects.toMatchObject({code:'INVALID_REASSESSMENT'});expect(state.dispatch).not.toHaveBeenCalled();
});
it('does not dispatch when saved evidence is missing',async()=>{state.tables.scout_provider_runs=[];await expect(reassessSession(source)).rejects.toMatchObject({code:'EVIDENCE_UNAVAILABLE'});expect(state.tables.scout_sessions).toHaveLength(1);});
it('does not reuse a completed profile assessment from before the scope correction',async()=>{
 const parent=state.tables.scout_sessions[0];parent.kind='preview';parent.params={keyword:'HYROX',platform:'Facebook',geography:'Ho Chi Minh City',limit:5};
 state.tables.scout_sessions.push({id:'old-assessment',owner_id:state.owner,kind:'preview',status:'complete',params:{parentSessionId:source,executionMode:'stored-evidence',assessmentVersion:4}});
 const first=await (await reassessSession(source)).json();const again=await (await reassessSession(source)).json();
 expect(first.sessionId).not.toBe('old-assessment');expect(again.sessionId).toBe(first.sessionId);
 expect(state.tables.scout_sessions.find(s=>s.id===first.sessionId)?.params.profileScopeRevision).toBe(5);expect(state.dispatch).toHaveBeenCalledTimes(1);
});

it('merges saved hydration only into its matching profile identity during replay',async()=>{
 const parent=state.tables.scout_sessions[0];Object.assign(parent,{kind:'preview',params:{keyword:'Pickleball',platform:'TikTok',geography:'Vietnam',limit:5}});
 state.tables.scout_provider_runs=[{session_id:source,state:'succeeded',platform:'TikTok',task:'profiles',normalized_rows:[{authorMeta:{name:'coach'},profileUrl:'https://tiktok.com/@coach',name:'Coach'}]},{session_id:source,state:'succeeded',platform:'TikTok',task:'profile-details',normalized_rows:[{profileUrl:'https://tiktok.com/@coach',username:'coach',bio:'Pickleball coach Hanoi Vietnam',followers:1200},{profileUrl:'https://tiktok.com/@other',username:'other',bio:'Unrelated',followers:99999}]}];
 await reassessSession(source);const child=state.tables.scout_sessions[1];delete child.params.assessmentVersion;child.params.searchPlan={version:4};const result=await executeStoredReassessment(child);
 expect(result.groups).toBeDefined();expect(result.candidates).toHaveLength(1);expect(result.candidates[0]).toMatchObject({bio:'Pickleball coach Hanoi Vietnam',followers:1200});expect(state.paid).not.toHaveBeenCalled();
});

afterEach(()=>{delete process.env.SCOUT_ACCOUNT_MODEL_MODE;delete process.env.SCOUT_ACCOUNT_MODEL_REVISION;});
it('creates a separate evidence-only assessment per model revision and mode, preserving accepted sources',async()=>{
 const parent=state.tables.scout_sessions[0];parent.kind='preview';parent.params={keyword:'Running',platform:'Facebook',geography:'Nationwide',limit:5};
 const original=structuredClone(parent),ledger=structuredClone(state.tables.scout_provider_runs);
 const first=await (await reassessSession(source)).json();
 process.env.SCOUT_ACCOUNT_MODEL_REVISION='model-1';process.env.SCOUT_ACCOUNT_MODEL_MODE='shadow';
 const shadow=await (await reassessSession(source)).json();
 expect(shadow.sessionId).not.toBe(first.sessionId);expect((await (await reassessSession(source)).json()).sessionId).toBe(shadow.sessionId);
 process.env.SCOUT_ACCOUNT_MODEL_MODE='active';const active=await (await reassessSession(source)).json();expect(active.sessionId).not.toBe(shadow.sessionId);
 const child=state.tables.scout_sessions.find(s=>s.id===active.sessionId);expect(child.params.accountModelPolicy).toEqual({version:5,revision:'model-1',mode:'active'});
 expect(state.tables.scout_sessions[0]).toEqual(original);expect(state.tables.scout_provider_runs).toEqual(ledger);expect(state.paid).not.toHaveBeenCalled();
});
it('fails a stale queued assessment before invoking provider replay or changing source/import records',async()=>{
 const parent=state.tables.scout_sessions[0];parent.kind='preview';parent.params={keyword:'Running',platform:'Facebook',geography:'Nationwide',limit:5};
 await reassessSession(source);const child=state.tables.scout_sessions[1];process.env.SCOUT_ACCOUNT_MODEL_MODE='shadow';
 await expect(executeStoredReassessment(child)).rejects.toMatchObject({code:'MODEL_POLICY_STALE'});expect(state.paid).not.toHaveBeenCalled();expect(state.tables.kols).toEqual([]);
});
it('keys strict account reassessment by criteria and preserves profile-only geography',async()=>{
 const parent=state.tables.scout_sessions[0];parent.kind='preview';parent.params={keyword:'Running',platform:'Facebook',geography:'Vietnam',assessmentRevision:6,accountPolicyVersion:5,geographyMode:'profile',sizeMetric:'members',minMembers:100,maxMembers:1000};
 const first=await (await reassessSession(source)).json();const repeated=await (await reassessSession(source)).json();
 expect(repeated.sessionId).toBe(first.sessionId);
 const child=state.tables.scout_sessions[1];expect(child.params).toMatchObject({assessmentRevision:6,geographyMode:'profile',sizeMetric:'members',minMembers:100,maxMembers:1000});
 expect(child.params.criteriaHash).toHaveLength(64);
 parent.params.maxMembers=2000;const changed=await (await reassessSession(source)).json();expect(changed.sessionId).not.toBe(first.sessionId);
 expect(state.paid).not.toHaveBeenCalled();
});

it('replays author-only discovery and topic post evidence without collecting again',async()=>{
 const parent=state.tables.scout_sessions[0];parent.kind='preview';parent.params={keyword:'Badminton',platform:'TikTok',geography:'Any location',limit:1,assessmentRevision:6,accountPolicyVersion:5};
 state.tables.scout_provider_runs=[{session_id:source,state:'succeeded',platform:'TikTok',task:'keyword',normalized_rows:[{webVideoUrl:'https://tiktok.com/@alex/video/1',authorMeta:{name:'alex'},text:'Cầu lông'}]},{session_id:source,state:'succeeded',platform:'TikTok',task:'profile-details',normalized_rows:[{profileUrl:'https://tiktok.com/@alex',name:'Alex',bio:'Athlete',followers:1200},{profileUrl:'https://tiktok.com/@other',name:'Other',bio:'Badminton athlete',followers:9999}]}];
 const original=structuredClone(parent),ledger=structuredClone(state.tables.scout_provider_runs);
 await reassessSession(source);const result=await executeStoredReassessment(state.tables.scout_sessions[1]);
 expect(result).toMatchObject({providerStarts:0,assessmentVersion:6,counts:{qualifiedNew:1}});expect(result.candidates).toHaveLength(1);expect(result.candidates[0]).toMatchObject({url:'https://tiktok.com/@alex',reviewState:'Matched'});
 expect(result.candidates[0].assessment.topic.evidence).toContain('https://tiktok.com/@alex/video/1');expect(state.paid).not.toHaveBeenCalled();expect(state.tables.scout_sessions[0]).toEqual(original);expect(state.tables.scout_provider_runs).toEqual(ledger);
});

it('replays top posts idempotently without paid starts, watermark changes or CRM writes',async()=>{
 const parent=state.tables.scout_sessions[0];parent.params={...parent.params,selectionMode:'top',rankingMode:'views-first',thresholdsEnabled:false,searchPlan:{version:4,kind:'trends',hash:'a'.repeat(64),criteria:{selectionMode:'top'},maxSearchRows:60,maxSessionUsd:1,maxHydratedProfiles:0,maxPostsPerProfile:5,rounds:[{label:'Search',queries:['#running']}],sources:[{platform:'Facebook',task:'hashtag',keys:[],builds:{},options:{},warnings:[],authorSearch:false,rounds:[{task:'hashtag',queries:['#running']}]}]},retrievalWindows:{'top-window':JSON.stringify({from:'2026-10-04T00:00:00.000Z',to:'2026-10-11T00:00:00.000Z'})}};
 const original=structuredClone(parent),ledger=structuredClone(state.tables.scout_provider_runs);
 const first=await (await reassessSession(source)).json();const second=await (await reassessSession(source)).json();expect(first.sessionId).toBe(second.sessionId);
 const child=state.tables.scout_sessions.find(s=>s.id===first.sessionId);const result=await executeStoredReassessment(child);
 expect(result).toMatchObject({providerStarts:0,selectionMode:'top',counts:{qualified:1,inserted:0},stopReason:'stored-evidence'});
 expect(result.groups.viewsUnavailable).toHaveLength(1);expect(result.posts[0].saveState).toBe('evidence-only');
 expect(state.paid).not.toHaveBeenCalled();expect(state.tables.scout_sessions[0]).toEqual(original);expect(state.tables.scout_provider_runs).toEqual(ledger);expect(state.tables.scouted_posts).toBeUndefined();expect(state.tables.scout_watermarks).toBeUndefined();
});

it('replays cached top collection from round checkpoints with no paid run or CRM writes',async()=>{
 const parent=state.tables.scout_sessions[0];
 const qualityFilter={enabled:true,minViews:1000,minInteractions:50,metricRule:'views-first',policyVersion:1};
 parent.kind='trends';parent.params={keyword:'Running',searchMode:'keyword',platform:'Facebook',geography:'Any location',limit:1,selectionMode:'top',qualityFilter,searchPlan:{version:4,kind:'trends',sources:[{platform:'Facebook',task:'keyword',rounds:[{queries:['Running']}]}],rounds:[]},retrievalWindows:{'top-window':JSON.stringify({from:'2026-10-04T00:00:00.000Z',to:'2026-10-11T00:00:00.000Z'})}};
 state.tables.scout_provider_runs=[];
 state.tables.scout_task_checkpoints=[{session_id:source,task_key:'top-round:0',result:{observations:[{platform:'Facebook',rows:[{url:'https://facebook.com/posts/cached',text:'Running',time:'2026-10-10T00:00:00Z',likes:100},{url:'https://facebook.com/posts/unknown',text:'Running',time:'2026-10-10T00:00:00Z'}]}]}}];
 const original=structuredClone(parent),checkpoints=structuredClone(state.tables.scout_task_checkpoints);
 const child={id:'child',owner_id:state.owner,kind:'trends',params:{...parent.params,parentSessionId:source,executionMode:'stored-evidence'}};
 state.tables.scout_sessions.push(child);
 const result=await executeStoredReassessment(child);
 expect(result.savedPosts).toHaveLength(2);expect(result.posts).toHaveLength(1);expect(result.providerStarts).toBe(0);expect(result.message).toContain('retained as evidence');
 expect(state.paid).not.toHaveBeenCalled();expect(state.tables.scouted_posts).toBeUndefined();expect(state.tables.scout_sessions[0]).toEqual(original);expect(state.tables.scout_task_checkpoints).toEqual(checkpoints);
});
