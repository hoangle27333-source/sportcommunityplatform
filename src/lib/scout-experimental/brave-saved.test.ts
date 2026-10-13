import {it,expect,vi} from 'vitest';
const state=vi.hoisted(()=>({rows:[] as any[]}));
vi.mock('../supabase/admin',()=>({createAdminClient:()=>({from:(table:string)=>{
 const q:any={select:()=>q,eq:()=>q,like:()=>q,then:(resolve:any)=>Promise.resolve({data:table==='scout_external_runs'?state.rows:table==='scout_trial_capabilities'?[{id:'brave',provider:'brave',operation:'discovery',platform:'Facebook'}]:[],error:null}).then(resolve)};return q;
}})}));
import {savedExperimentalProfiles} from './saved';
import {buildBraveRequest,normalizeBraveResponse} from './brave';
it('restores typed search hints without turning snippets into profile evidence or starting providers',async()=>{
 const request=buildBraveRequest('Facebook','badminton');
 state.rows=[{capability_id:'brave',response:normalizeBraveResponse({type:'search',query:{original:request.params.q},web:{results:[{url:'https://facebook.com/coach',title:'Badminton champion',description:'100K followers in Hanoi'},{url:'https://facebook.com/coach/posts/1',title:'Unresolved'}]}},request)}];
 const profiles=await savedExperimentalProfiles('saved');expect(profiles).toHaveLength(1);expect(profiles[0].bio).toBe('');expect(profiles[0].followers).toBeNull();expect(profiles[0].searchHints).toHaveLength(1);expect(profiles[0].discoveryPaths?.[0].method).toBe('web-content');
});
