import {it,expect} from 'vitest';
import {buildBraveRequest,normalizeBraveResponse,braveIdentity} from './brave';
import {hasDiscoveryLead} from './retrieval-admission';
import {assessReviewedProfile} from '../apify/search-assessment';
const request=buildBraveRequest('Facebook','cầu lông huấn luyện viên Hồ Chí Minh');
const response=(results:any[],extra:any={})=>({type:'search',query:{original:request.params.q,...extra},web:{results}});
it('preserves approved Unicode and pins every outgoing parameter',()=>{
 expect(request.params).toEqual({q:'site:facebook.com cầu lông huấn luyện viên Hồ Chí Minh',count:'15',search_lang:'vi',ui_lang:'en-US',spellcheck:'false',result_filter:'web',text_decorations:'false',offset:'0'});
 for(const query of ['site:tiktok.com badminton','-site:facebook.com badminton','badminton OR running','site:'])expect(()=>buildBraveRequest('Facebook',query)).toThrow();
 expect(()=>buildBraveRequest('Facebook','x'.repeat(600))).toThrow();expect(()=>buildBraveRequest('Facebook',Array(76).fill('x').join(' '))).toThrow();expect(()=>buildBraveRequest('Facebook','badminton',21)).toThrow();
});
it('validates schemas, records query metadata and detects altered requests',()=>{
 expect(normalizeBraveResponse(response([]),request)).toEqual([]);
 expect(normalizeBraveResponse({type:'search',query:{original:request.params.q}},request)).toEqual([]);
 for(const raw of [{},response([{url:123,title:'Invalid'}]),{type:'search',query:{original:request.params.q},web:{results:{}}},response([],{altered:'a different query'})])expect(()=>normalizeBraveResponse(raw,request)).toThrow();
});
it('deduplicates canonical identities, rejects foreign hosts and keeps unresolved posts',()=>{
 const rows=normalizeBraveResponse(response([{url:'https://www.facebook.com/coach/?tracking=x',title:'Coach',description:'Badminton'},{url:'https://facebook.com/coach',title:'Duplicate'},{url:'https://evilfacebook.com/coach',title:'Wrong'},{url:'https://facebook.com/coach/posts/123',title:'Post'},{url:'https://facebook.com/groups/42',title:'Group'}]),request);
 expect(rows.map(r=>r.kind)).toEqual(['profile','post','group']);expect(braveIdentity(rows[1],'Facebook')).toBeNull();expect(braveIdentity(rows[0],'TikTok')).toBeNull();
});
it('admits a search hint for enrichment without treating the snippet as profile or qualifying evidence',()=>{
 const row=normalizeBraveResponse(response([{url:'https://facebook.com/unknown',title:'Badminton champion',description:'Coach in Ho Chi Minh City, 100K followers'}]),request)[0];
 const p=braveIdentity(row,'Facebook')!;
 expect(p.name).not.toBe(row.title);expect(p.bio).toBe('');expect(p.followers).toBeNull();expect(p.location).toBe('');expect(p.posts).toEqual([]);
 expect(hasDiscoveryLead(p,'badminton')).toBe(true);
 expect(assessReviewedProfile(p,'badminton','Ho Chi Minh City','Individual KOLs',{version:7,minFollowers:1000},[]).resultGroup).not.toBe('Qualified');
 expect(p.searchHints?.[0].query.requested).toBe(request.params.q);
});

it('replays all six captured live result sets through the same identity and admission adapters',async()=>{
 const {default:fixture}=await import('./fixtures/brave-live-web.json');
 const usable:Record<string,Set<string>>={};
 for(const sample of fixture){
  const request=buildBraveRequest(sample.request.platform,sample.request.approvedQuery);
  expect(request).toEqual(sample.request);
  for(const row of sample.rows){const p=braveIdentity(row as any,sample.request.platform);if(!p)continue;expect(p.bio).toBe('');expect(p.followers).toBeNull();if(hasDiscoveryLead(p,'badminton'))(usable[p.platform] ||= new Set()).add(p.url);}
 }
 expect(Object.fromEntries(Object.entries(usable).map(([p,urls])=>[p,urls.size]))).toEqual({Facebook:19,TikTok:9,Instagram:12});
});
