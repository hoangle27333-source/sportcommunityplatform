import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
export const gmvSchema = z.object({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  amount: z.number().finite().nonnegative().max(9999999999999999),
  source: z.string().trim().min(1).max(2000),
  notes: z.string().max(5000).default(''),
});
export type GMV = z.infer<typeof gmvSchema>;
export function latestGMV(rows: any[]) {
  return [...rows].sort((a, b) => b.month.localeCompare(a.month))[0] ?? null;
}
export async function saveGMV(kolId: string, value: unknown, actorId: string) {
  const input = gmvSchema.parse(value);
  const { data, error } = await createAdminClient().from('kol_gmv_monthly').upsert({
    kol_id: kolId, ...input, updated_by: actorId, updated_at: new Date().toISOString(),
  }, { onConflict: 'kol_id,month' }).select().single();
  if (error) throw error;
  return data;
}
export async function importGMV(records: Record<string, any>[], actorId: string) {
  const db = createAdminClient();
  const { data: kols, error } = await db.from('kols').select('id,name'); if (error) throw error;
  const payloads = records.map((row, i) => {
    const id = row['KOL ID']; const name = row['KOL Name'] || row['Name'];
    const matches = (kols || []).filter(k => id ? k.id === id : name && k.name.trim().toLowerCase() === String(name).trim().toLowerCase());
    if (matches.length !== 1) throw Object.assign(new Error(`Row ${i + 1}: provide a unique KOL ID or exact KOL Name`), { status: 400 });
    const raw = row['GMV (VND)'];
    if (raw === '' || raw === undefined || raw === null || (typeof raw !== 'number' && !/^\d+(,\d{3})*(\.\d{1,2})?$/.test(String(raw).trim()))) throw Object.assign(new Error(`Row ${i + 1}: invalid GMV (VND)`), { status: 400 });
    const input = gmvSchema.parse({ amount: Number(String(raw).replace(/,/g, '')), month: row['GMV Month'], source: row['GMV Source'], notes: row['GMV Notes'] || '' });
    return { ...input, kol_id: matches[0].id, updated_by: actorId, updated_at: new Date().toISOString() };
  });
  if (new Set(payloads.map(p => `${p.kol_id}:${p.month}`)).size !== payloads.length) throw Object.assign(new Error('Duplicate KOL/month rows in import'), { status: 400 });
  const { data, error: writeError } = await db.from('kol_gmv_monthly').upsert(payloads, { onConflict: 'kol_id,month' }).select('id'); if (writeError) throw writeError;
  return data?.length || 0;
}
