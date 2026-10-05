import { describe, expect, it } from 'vitest';
import { gmvSchema, latestGMV } from './gmv';
import { sanitizeFinancialData } from '@/lib/auth/financial-sanitizer';
describe('GMV validation and financial boundary', () => {
  const valid = { month: '2026-10', amount: 0, source: 'Client report' };
  it('preserves zero rather than treating it as missing', () => expect(gmvSchema.parse(valid).amount).toBe(0));
  it.each([-1, NaN, Infinity])('rejects invalid amounts %s', amount => expect(gmvSchema.safeParse({ ...valid, amount }).success).toBe(false));
  it.each(['2026-00','2026-13','2026-1','October'])('rejects invalid month %s', month => expect(gmvSchema.safeParse({ ...valid, month }).success).toBe(false));
  it('requires an evidence source', () => expect(gmvSchema.safeParse({ ...valid, source: '  ' }).success).toBe(false));
  it('selects latest reporting month, not largest value or last edit', () => expect(latestGMV([{ month: '2026-09', amount: 1000 }, { month: '2026-10', amount: 0 }])).toEqual({ month: '2026-10', amount: 0 }));
  it('returns null for missing data', () => expect(latestGMV([])).toBeNull());
  it('omits GMV entirely for non-admin users', () => { const data = { kols: [{ id: 'a', quotation: 100, gmv: { amount: 999, source: 'private' } }] }; expect(sanitizeFinancialData(data, false).kols[0]).not.toHaveProperty('gmv'); expect(sanitizeFinancialData(data, true)).toBe(data); });
});
