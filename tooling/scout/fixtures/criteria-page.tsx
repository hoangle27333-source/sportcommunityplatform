'use client';
/** Browser fixture only. All Scout requests are intercepted locally; no provider or CRM calls. */
import {useEffect,useState} from 'react';
import {DiscoveryScoutModal} from '@/components/sport-hub/discovery-scout-modal';
import {AuthContext} from '@/lib/auth/auth-context';
const id='00000000-0000-0000-0000-000000000001';
const storageKey='scout-criteria-browser-fixture';
export default function CriteriaFixture(){
 const [ready,setReady]=useState(false),[open,setOpen]=useState(false),[target,setTarget]=useState<'Individual KOLs'|'Communities & Clubs'>('Individual KOLs'),[resume,setResume]=useState(false),[receipt,setReceipt]=useState('');
 useEffect(()=>{const original=window.fetch;
  window.fetch=async(input,init)=>{
   const path=typeof input==='string'?input:input instanceof URL?input.pathname:input.url;
   if(!path.includes('/api/'))return original(input,init);
   const body=JSON.parse(String(init?.body || '{}'));const saved=JSON.parse(localStorage.getItem(storageKey) || 'null');
   let data:any={success:true};
   if(path.includes('/capabilities'))data={success:true,capabilities:Object.fromEntries(['Instagram','TikTok','Facebook'].map(p=>[p,Object.fromEntries(['profiles','communities'].map(task=>[task,{available:true}]))]))};
   else if(path.includes('/plan')){if(body.maxSessionUsd>1)return Response.json({success:false,error:'Session budget exceeds the allowed maximum of $1.00.'},{status:400});data={success:true,plan:{version:5,hash:'a'.repeat(64),criteria:body,maxSessionUsd:body.maxSessionUsd || 1,allowedMaxSessionUsd:1,maxSearchRows:120,maxHydratedProfiles:10,rounds:['Scoped profile search','Broader profile search','Topic content and authors','Additional queries'].map(label=>({label,queries:['Badminton']})),sources:[{platform:'TikTok',task:'profiles',warnings:[]}],appliedFilters:[{platform:'TikTok',setting:body.sizeMetric==='members'?'Members range':'Followers range',mode:'Local verification',detail:'Observed counts only; no substitution.'}]}};}
   else if(path.endsWith('/review')){if(!saved)throw new Error('Fixture session missing');const decision={decision:body.decision,classification:body.classification,entityType:body.entityType,relevant:true,locationConfirmed:true};saved.reviewDecisions[body.candidateId]=decision;localStorage.setItem(storageKey,JSON.stringify(saved));data={success:true,decision};setReceipt(`Review saved: ${body.decision}`);}
   else if(path.split('?')[0]==='/api/sport-hub/scout'){
    if(!init?.method || init.method==='GET')data=saved || {success:false,error:'No saved fixture'};
    else if(body.action==='confirm'){saved.importedCandidateIds=body.selected.map((item:any)=>item.candidateId);localStorage.setItem(storageKey,JSON.stringify(saved));data={success:true,sessionId:id,summary:'Fixture import saved locally; zero provider or CRM calls.',importedCandidateIds:saved.importedCandidateIds,insertedKols:body.targetType==='Individual KOLs'?body.selected.length:0,insertedCommunities:body.targetType==='Communities & Clubs'?body.selected.length:0};setReceipt(data.summary);}
    else {
     const community=body.targetType==='Communities & Clubs';const platform=body.platform[0];const url=community?'https://facebook.com/groups/fixture':platform==='TikTok'?'https://tiktok.com/@fixture':'https://instagram.com/fixture';const entityType=community?'Community':'Individual';
     const candidates=['Qualified','Needs Verification','Excluded'].map((group,i)=>({candidateId:`00000000-0000-0000-0000-00000000000${i+2}`,accountKey:`${platform}:${url}${i}`,name:community?`CLB Cầu Lông ${i+1}`:`Badminton Athlete ${i+1}`,username:`fixture${i}`,platform,url:`${url}${i}`,bio:'Badminton athlete Ho Chi Minh City',category:community?'Community':'Athlete',entityType:community?'group':'person',location:'Ho Chi Minh City',followers:community?25:1500,members:community?1500:null,avgViews:null,er:null,likes:null,comments:null,avatarUrl:'',posts:[],classification:community?'Community':'Individual',reviewState:group==='Qualified'?'Matched':group==='Excluded'?'Excluded':'Needs Review',relevant:true,locationMatch:true,verifiedGeography:'Ho Chi Minh City',isExisting:false,reasons:[group],evidence:['Badminton athlete'],provenance:{fetchedAt:'2026-10-11T00:00:00Z'},entityAssessment:{suggestedType:entityType,status:'supported',source:'rules',evidence:['Badminton athlete'],missingInformation:[],modelVersion:'account-rules-5'},assessment:{[body.sizeMetric || 'followers']:{state:i===0?'passed':i===1?'unknown':'failed',reason:i===0?'Observed size meets the selected range.':i===1?'Audience count requires verification.':'Outside selected range.',evidence:[]},topic:{state:'passed',reason:'Biography supports Badminton.',evidence:['Badminton athlete']}},geographyAssessment:{state:'passed',reason:'Profile location meets the selected scope.',profileLocation:'Ho Chi Minh City',coverage:{requested:10,collected:0,dated:0,partial:true,latestVerified:false},observations:[]}}));
     data={success:true,sessionId:id,criteria:body,candidates,reviewDecisions:{},importedCandidateIds:[],partial:true,counts:{qualifiedNew:1,unverified:1,excluded:1},diagnostics:{providerCount:3,excludedCount:1,requestedCount:5,qualifiedNew:1,shortfall:4,stopReason:'budget-exhausted'},warnings:['Found 1/5 qualified new accounts; 4 still needed.']};localStorage.setItem(storageKey,JSON.stringify(data));setReceipt(JSON.stringify({assessmentRevision:body.assessmentRevision,sizeMetric:body.sizeMetric,minFollowers:body.minFollowers,maxFollowers:body.maxFollowers,minMembers:body.minMembers,maxMembers:body.maxMembers}));
    }
   }else if(path.includes('/sessions'))data={success:true,sessions:[]};
   return Response.json(data);
  };
  setReady(true);return()=>{window.fetch=original;};
 },[]);
 const auth:any={user:{id:'fixture'},profile:{role:'editor'},role:'editor',isEditor:true,isAdmin:false,isViewer:false,loading:false,refreshUser:async()=>{},signOut:async()=>{}};
 function launch(community:boolean){setTarget(community?'Communities & Clubs':'Individual KOLs');setResume(false);setOpen(true);}
 return <AuthContext.Provider value={auth}><main className="p-6 space-y-4"><h1>Scout criteria browser fixture</h1><p>Local intercepted APIs. No live collection or CRM mutation.</p><button disabled={!ready} onClick={()=>launch(false)}>Open KOL fixture</button><button disabled={!ready} onClick={()=>launch(true)}>Open community fixture</button><button disabled={!ready} onClick={()=>{setResume(true);setOpen(true);}}>Resume saved fixture</button><output aria-label="Fixture receipt">{receipt}</output>{open && <DiscoveryScoutModal isOpen defaultTargetType={target} initialCriteria={{keyword:'Badminton',platform:['TikTok'],geography:'Ho Chi Minh City',targetType:target,limit:5,sizeMetric:target==='Communities & Clubs'?'members':'followers'}} resumeSessionId={resume?id:undefined} keepResultOpen onClose={()=>setOpen(false)} onSuccess={()=>setReceipt('Fixture import complete')}/>}</main></AuthContext.Provider>;
}
