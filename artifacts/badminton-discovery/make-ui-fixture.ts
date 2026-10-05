import {parseProfile} from '../../src/lib/apify/providers';
import {assessProfile} from '../../src/lib/apify/discovery-quality';
import {readFileSync,writeFileSync} from 'node:fs';
const rows=JSON.parse(readFileSync('src/lib/apify/fixtures/facebook-badminton-search.json','utf8'));
const candidates=rows.slice(0,5).map((r:any,i:number)=>{const p=parseProfile(r,'Facebook')!;return {...p,...assessProfile(p,'badminton','Nationwide','Individual KOLs'),candidateId:`00000000-0000-0000-0000-00000000000${i+1}`,accountKey:`Facebook:${p.url}`,isExisting:i===0,existingId:i===0?'069ecaf0-4aa4-4f97-9e09-352bf0c192af':undefined,provenance:{platform:'Facebook',fetchedAt:'2026-10-05T10:22:51Z',profileUrl:p.url}}});
writeFileSync('artifacts/badminton-discovery/ui-preview.json',JSON.stringify({success:true,sessionId:'00000000-0000-0000-0000-000000000006',criteria:{keyword:'badminton',platform:'Facebook',targetType:'Individual KOLs',geography:'Nationwide',limit:5},candidates,diagnostics:{providerCount:15,requestedCount:5,excludedCount:0,returnedCount:5},newCount:4,partial:false,warnings:[]},null,2)+'\n');
