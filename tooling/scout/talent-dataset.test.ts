import { describe, it, expect } from 'vitest';
import { prepareTalentDataset, parseTalentFollowers, talentCrmRecord, type TalentRow } from './talent-dataset';
const source = { filename: 'Talent Database Raw.xlsx', sha256: 'a'.repeat(64) };
const row = (n: number, name: string, url: string, followers: string | null): TalentRow => ({ row:n, values:[n,'Road',name,url,followers,'HCMC','Editorial description'],links:[] });
describe('Talent spreadsheet ingestion', () => {
  it('parses decimal-comma compact counts and preserves missing or invalid values', () => {
    expect(['37,7k','2,2k','5.1K','1,250,000','0',null,'?'].map(parseTalentFollowers)).toEqual([37700,2200,5100,1250000,0,null,null]);
  });
  it('deduplicates account URLs, retains conflicting source rows and leaves training labels blank', () => {
    const d=prepareTalentDataset([row(3,'Vi đi chay','https://www.tiktok.com/@vi.dichay','1k'),row(47,'Chạy vì vui','https://tiktok.com/@vi.dichay?lang=vi','1,5k')],source);
    expect(d.accounts).toHaveLength(1);expect(d.accounts[0].profile.followers).toBeNull();
    expect(d.accounts[0].sourceRows.map(s=>s.name)).toEqual(['Vi đi chay','Chạy vì vui']);
    expect(d.reviewPackets[0].annotation.label).toBeNull();expect(d.reviewPackets[0].profile).toMatchObject({bio:'',location:'',posts:[]});
    expect(talentCrmRecord(d.accounts[0],source,'private/path')).toMatchObject({followers:0,tier:'Unknown',scout_missing_metrics:['followers','avgViews','er']});
  });
  it('keeps same-name distinct accounts and excludes share URLs from account review packets', () => {
    const d=prepareTalentDataset([row(3,'Nguyễn Khánh Ly','https://facebook.com/first',null),row(4,'Nguyễn Khánh Ly','https://facebook.com/second',null),row(5,'Name','https://facebook.com/share/abc',null)],source);
    expect(d.accounts).toHaveLength(3);expect(d.reviewPackets).toHaveLength(2);expect(d.unresolved[0].profile.url).toBe('');
    expect(talentCrmRecord(d.unresolved[0],source,'private/path').contact_info).toContain('https://facebook.com/share/abc');
  });
});
