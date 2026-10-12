'use client';
import { useState } from 'react';
import { CommunityTableView } from '@/components/sport-hub/tabs/community-table-view';
import { EntityPostScoutModal } from '@/components/sport-hub/entity-post-scout-modal';
import type { Community } from '@/components/sport-hub/types';
import { communityEngagement } from '@/lib/sport-hub/community-engagement';
const club = { id: '00000000-0000-0000-0000-000000000010', name: 'CLB chạy bộ thử nghiệm', sport: ['Running'], platform: 'Instagram', members: 1234, pricePerPin: 0, adminContact: 'Fixture admin', status: 'Potential', activityLevel: 'Very Active', geography: 'Hanoi', groupUrl: 'https://instagram.com/club', channels: [{ id: 'channel', platform: 'Instagram', url: 'https://instagram.com/club' }], engagementSummary: communityEngagement(Array.from({length:30}, (_, index)=>({id:String(index),post_url:`https://instagram.com/p/${index}`,published_at:new Date(Date.UTC(2026,0,index+1)).toISOString(),likes:index===1?null:1000,comments:20})),{channels:[{url:'https://instagram.com/club',platform:'Instagram',status:'collected'}],updatedAt:'2026-10-11T00:00:00Z'}) } as unknown as Community;
export default function Fixture() {
  const [selected,setSelected] = useState<Community|null>(null);
  return <main className="p-8"><CommunityTableView communities={[club,{...club,id:'empty',name:'Empty sample',engagementSummary:undefined}]} loading={false} onAddCommunity={()=>{}} onUploadExcel={()=>{}} onRefresh={()=>{}} onUpdateEngagement={setSelected} />{selected && <EntityPostScoutModal entity={selected} entityType="community" initialCriteria={{collectionMode:'latest-30'}} onClose={()=>setSelected(null)} onSuccess={()=>setSelected(null)}/>}</main>;
}
