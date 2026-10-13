import { expect, it } from 'vitest';
import { parseProfile, type SocialProfile } from '../apify/providers';
import { hasDiscoveryLead } from './retrieval-admission';
import { hasTopicEvidence } from '../apify/content-quality';
const profile=(name:string,caption:string):SocialProfile=>({...parseProfile({profileUrl:'https://tiktok.com/@fixture',name},'TikTok')!,discoveryPaths:[{method:'profile',query:'cầu lông Ho Chi Minh City',sourceUrl:'https://tiktok.com/@fixture',depth:0}],posts:[{id:'1',url:'https://tiktok.com/@fixture/video/1',authorUrl:'https://tiktok.com/@fixture',caption,author:name,username:'fixture',views:null,likes:null,comments:null,hashtags:[],contentType:'video',thumbnailUrl:''}]});
it.each([
 ['Cô Thoa Phù Thủy','Tự nhiên cô vui #giaoviencap3 #giaovienlichsu'],
 ['Thuý ở Mỹ','HPNY 2026 #atlanta #cuocsongmy'],
 ['Thú Vui Texas','Cua Bò Đầy Bãi Biển, Nhưng Người Mỹ Không Ai Bắt'],
 ['thiết kế nhà Vibhome','Căn villa đẹp #xaynha #nhadep'],
])('discards %s despite a badminton provider query', (name,caption)=>{
 expect(hasDiscoveryLead(profile(name,caption),'cầu lông')).toBe(false);
});
it('admits owned badminton content without a sport keyword in name or bio',()=>{
 expect(hasDiscoveryLead(profile('Công','Badminton training'),'cầu lông')).toBe(true);
});
it('recognizes compact Vietnamese sport hashtags without recognizing tennis as badminton',()=>{
 expect(hasTopicEvidence('#giaicaulonghocsinhtphcm2026 #caulongtieuhoc','cầu lông')).toBe(true);
 expect(hasTopicEvidence('#tennis #giaoviencap3','cầu lông')).toBe(false);
});
it('does not treat the content-author method itself as supporting content',()=>{
 const p=profile('Unknown','HPNY');p.discoveryPaths![0].method='content-author';
 expect(hasDiscoveryLead(p,'badminton')).toBe(false);
});
it('admits accessible owned media without captions for further analysis',()=>{
 const p=profile('Unknown','');p.discoveryPaths![0].method='content-author';p.posts[0].videoUrl='https://example.com/video.mp4';
 expect(hasDiscoveryLead(p,'badminton')).toBe(true);
});
