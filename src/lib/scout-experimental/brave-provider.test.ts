import {beforeEach,afterEach,it,expect,vi} from 'vitest';
const state=vi.hoisted(()=>({input:null as any,calls:0}));
vi.mock('./trial',()=>({trialRequest:async(_id:any,_c:any,input:any,send:any)=>{state.input=input;state.calls++;return (await send({})).result;}}));
import {fetchExternal} from './providers';
import {buildBraveRequest,BRAVE_ADAPTER_REVISION} from './brave';
const cap:any={provider:'brave',platform:'Facebook',config:{adapterRevision:BRAVE_ADAPTER_REVISION}};
beforeEach(()=>{state.calls=0;vi.stubEnv('BRAVE_SEARCH_API_KEY','private-fixture-token');});
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();});
it('sends exactly the approved request with the token only in the auth header',async()=>{
 const request=buildBraveRequest('Facebook','cầu lông');
 const fetch=vi.fn(async()=>({ok:true,json:async()=>({type:'search',query:{original:request.params.q},web:{results:[]}})}));vi.stubGlobal('fetch',fetch);
 expect(await fetchExternal('s',cap,{query:'cầu lông',limit:15,braveRequest:JSON.parse(JSON.stringify(request))})).toEqual([]);
 const [url,init]=fetch.mock.calls[0] as any;expect(Object.fromEntries(new URL(url).searchParams)).toEqual(request.params);expect(init.headers['X-Subscription-Token']).toBe('private-fixture-token');expect(url).not.toContain('private-fixture-token');
});
it('rejects changed plans before reserving or sending a request',async()=>{
 vi.stubGlobal('fetch',vi.fn());
 await expect(fetchExternal('s',cap,{query:'badminton',limit:15,braveRequest:buildBraveRequest('Facebook','running')})).rejects.toMatchObject({code:'PLAN_STALE'});
 expect(state.calls).toBe(0);expect(fetch).not.toHaveBeenCalled();
});
