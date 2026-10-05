'use client';
import { KolsPageView } from '@/components/sport-hub/pages/kols-page-view';
export default function QA() {
 return <KolsPageView initialData={{ kpis: { totalKols:1,totalReach:1000,avgScore:0,totalCommunities:0,totalCommunityMembers:0,totalPosts:0 }, kols:[{ id:'00000000-0000-0000-0000-000000000004',name:'QA Runner',sport:['Chạy bộ / Marathon'],tier:'Micro (10k - 50k)',platform:'Instagram',geography:'Hanoi',followers:1000,avgViews:0,er:0,quotation:0,status:'New Scout (Unverified)',info:'',profileUrl:'https://instagram.com/qa_runner',gmv:{amount:0,month:'2026-10',source:'QA Report'} }],communities:[],projects:[],reports:[],posts:[] }} />;
}
