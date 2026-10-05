import { beforeEach, describe, expect, it, vi } from 'vitest';
const state=vi.hoisted(()=>({kols:[{id:'a',name:'Alex'}],write:vi.fn()}));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => table === 'kols'
      ? { select: async () => ({ data: state.kols, error: null }) }
      : { upsert: (payload: any) => {
          state.write(payload);
          return { select: async () => ({ data: payload.map((_: any, i: number) => ({ id: String(i) })), error: null }) };
        } },
  }),
}));
import { importGMV } from './gmv';
const row={'KOL ID':'a','GMV (VND)':0,'GMV Month':'2026-10','GMV Source':'Client report'};
beforeEach(()=>{state.kols=[{id:'a',name:'Alex'}];state.write.mockReset();});
describe('Monthly GMV batch import',()=>{
 it('updates existing creator/month and preserves zero',async()=>{expect(await importGMV([row],'admin')).toBe(1);expect(state.write.mock.calls[0][0][0]).toMatchObject({kol_id:'a',month:'2026-10',amount:0,updated_by:'admin'});});
 it('accepts en-US formatted VND',async()=>{await importGMV([{...row,'GMV (VND)':'1,234,567'}],'admin');expect(state.write.mock.calls[0][0][0].amount).toBe(1234567);});
 it('rejects ambiguous names before writing',async()=>{state.kols.push({id:'b',name:'Alex'});await expect(importGMV([{'KOL Name':'Alex','GMV (VND)':0,'GMV Month':'2026-10','GMV Source':'Report'}],'admin')).rejects.toThrow('unique KOL');expect(state.write).not.toHaveBeenCalled();});
 it('does not create missing creators',async()=>{await expect(importGMV([{...row,'KOL ID':'missing'}],'admin')).rejects.toThrow('unique KOL');expect(state.write).not.toHaveBeenCalled();});
 it('validates the entire batch before any write',async()=>{await expect(importGMV([row,{...row,'GMV Month':'2026-13'}],'admin')).rejects.toThrow();expect(state.write).not.toHaveBeenCalled();});
 it('rejects duplicate creator/month rows',async()=>{await expect(importGMV([row,row],'admin')).rejects.toThrow('Duplicate');expect(state.write).not.toHaveBeenCalled();});
 it.each(['-1','','1M','12,34'])('rejects unsupported GMV values %s',async amount=>{await expect(importGMV([{...row,'GMV (VND)':amount}],'admin')).rejects.toThrow();expect(state.write).not.toHaveBeenCalled();});
});
