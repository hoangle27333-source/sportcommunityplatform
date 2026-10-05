"use client";
import {useState} from 'react';
import {scoutFetch} from '@/lib/apify/scout-client';
export function VerifiedDetailsButton({url,onDetails}:{url:string;onDetails?:(data:any)=>void}) {
 const [busy,setBusy]=useState(false);const [message,setMessage]=useState('');
 async function fetchDetails(){setBusy(true);try {const res=await scoutFetch('/api/sport-hub/scout/inspect-url',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url,action:'verify'})});const value=await res.json();if(!value.success || !value.data)throw new Error(value.error || 'No verified details returned.');onDetails?.(value.data);const observed=value.data.provenance?.fetchedAt;setMessage(`${value.data.provenance?.cached ? 'Cached evidence' : 'Verified details'}${observed ? ` observed ${new Date(observed).toLocaleString('en-US')}` : ''}. Review before saving.`);}catch(e:any){setMessage(e.message);}finally{setBusy(false);}}
 return <div className="text-xs"><button type="button" disabled={busy || !url} onClick={fetchDetails} className="underline">{busy?'Fetching Verified Details...':'Fetch Verified Details'}</button>{message && <p role="status">{message}</p>}</div>;
}
