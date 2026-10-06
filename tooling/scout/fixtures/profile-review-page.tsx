'use client';
// Temporary UI fixture: no provider calls or CRM writes.
import { useEffect, useState } from 'react';
import { DiscoveryScoutModal } from '@/components/sport-hub/discovery-scout-modal';
const sessionId='00000000-0000-0000-0000-000000000010';
const candidates=[0,1].map(i=>({candidateId:`00000000-0000-0000-0000-00000000001${i+1}`,accountKey:`Instagram:https://instagram.com/qa${i}`,username:`qa${i}`,name:i?'CLB Test Candidate':'Đỗ Kim Phúc',bio:'Football coach Vietnam',platform:'Instagram',url:`https://instagram.com/qa${i}`,followers:null,avgViews:null,er:null,classification:'Individual',relevant:true,reviewState:i?'Matched':'Needs Review',locationMatch:!!i,reasons:['Fixture evidence'],evidence:['Football coach Vietnam'],isExisting:false,posts:[]}));
const criteria={keyword:'football',platform:'Instagram',targetType:'Individual KOLs',geography:'Nationwide',limit:5};
export default function Page(){
  const [ready,setReady]=useState(false);const [open,setOpen]=useState(true);const [message,setMessage]=useState('');
  useEffect(()=>{const original=window.fetch;window.fetch=async(input,init)=>{
    const url=String(input);if(!url.includes('/api/sport-hub/scout'))return original(input,init);
    const state=JSON.parse(sessionStorage.getItem('profile-review-qa') || '{"decisions":{},"imported":[]}');const body=init?.body?JSON.parse(String(init.body)):{};
    if(url.includes('/capabilities'))return Response.json({success:true,capabilities:Object.fromEntries(['Instagram','Facebook','TikTok'].map(p=>[p,{profiles:{available:true},communities:{available:true}}]))});
    if(url.includes('/review')){if(body.decision==='approved' && candidates.find(c=>c.candidateId===body.candidateId)?.reviewState==='Needs Review' && (!body.typeConfirmed || !body.relevant || !body.locationConfirmed))return Response.json({error:'Verification required'},{status:400});const decision={decision:body.decision,classification:'Individual',relevant:true,locationConfirmed:true};state.decisions[body.candidateId]=decision;sessionStorage.setItem('profile-review-qa',JSON.stringify(state));return Response.json({success:true,decision});}
    if(body.action==='confirm'){state.imported=body.selected.map((c:any)=>c.candidateId);sessionStorage.setItem('profile-review-qa',JSON.stringify(state));return Response.json({success:true,summary:`Fixture imported ${state.imported.length} profile(s).`});}
    return Response.json({success:true,sessionId,criteria,candidates,reviewDecisions:state.decisions,importedCandidateIds:state.imported});
  };setReady(true);return()=>{window.fetch=original;};},[]);
  return <main><h1>Profile Review QA — mocked persistence</h1><p>{message}</p><button onClick={()=>setOpen(true)}>Reopen Review</button>{ready && open && <DiscoveryScoutModal isOpen onClose={()=>setOpen(false)} onSuccess={result=>setMessage(result.summary)} resumeSessionId={sessionId} initialCriteria={criteria}/>}</main>;
}
