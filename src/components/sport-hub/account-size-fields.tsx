'use client';
import { sizeRange, type AccountSizeCriteria } from '@/lib/apify/account-criteria';
export function AccountSizeFields({value,onChange}:{value:AccountSizeCriteria;onChange:(value:AccountSizeCriteria)=>void}) {
  const {metric,minimum,maximum}=sizeRange(value);
  const label=metric==='members'?'members':'followers';
  const update=(bound:'min'|'max',raw:string)=>onChange({...value,[`${bound}${metric==='members'?'Members':'Followers'}`]:raw===''?undefined:Number(raw)});
  return <fieldset className="space-y-2 rounded-xl border border-slate-200 p-3 text-xs">
    <legend className="font-semibold">Account size</legend>
    <label>Audience metric <select aria-label="Audience metric" value={metric} onChange={event=>onChange({sizeMetric:event.target.value as 'followers'|'members'})} className="rounded border p-1"><option value="followers">Followers</option><option value="members">Members</option></select></label>
    <div className="grid grid-cols-2 gap-3">{(['min','max'] as const).map(bound=><label key={bound} className="block">{bound==='min'?'Minimum':'Maximum'} {label}<input aria-label={`${bound==='min'?'Minimum':'Maximum'} ${label}`} type="number" min={0} max={1000000000} step={1} value={(bound==='min'?minimum:maximum) ?? ''} placeholder={bound==='min'?'No minimum':'No maximum'} onChange={event=>update(bound,event.target.value)} className="mt-1 block w-full rounded-xl border border-slate-200 px-3 py-2"/></label>)}</div>
    <p>Observed {label} only. Missing counts require verification. Followers and members are separate metrics.</p>
  </fieldset>;
}
export function savedSizeCriteria(value:AccountSizeCriteria):AccountSizeCriteria {
  return {sizeMetric:value.sizeMetric || 'followers',minFollowers:value.minFollowers,maxFollowers:value.maxFollowers,minMembers:value.minMembers,maxMembers:value.maxMembers};
}
