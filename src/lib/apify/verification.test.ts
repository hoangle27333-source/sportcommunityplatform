import { describe, expect, it } from 'vitest';
import { verificationGate } from './verification';
const receipt = { provider_run_id: 'run', build_id: 'build', actual_usd: 0, reserved_usd: 0.25, warnings: [] };
const requestedProfiles = ['https://www.instagram.com/nike/', 'https://www.instagram.com/adidas/'];
describe('provider activation receipts', () => {
  it('rejects duplicate output posing as a successful batch', () => {
    expect(verificationGate({ count: 2, requestedProfiles, observedProfiles: [requestedProfiles[0], requestedProfiles[0]], runs: [receipt] }).verified).toBe(false);
  });
  it('requires each requested identity while tolerating URL formatting', () => {
    expect(verificationGate({ count: 2, requestedProfiles, observedProfiles: ['https://instagram.com/Nike?ref=test', 'https://instagram.com/adidas'], runs: [receipt] }).verified).toBe(true);
  });
  it.each([null, undefined, NaN, -1, 0.26])('rejects unresolved or out-of-policy cost %s', actual_usd => {
    expect(verificationGate({ count: 1, runs: [{ ...receipt, actual_usd }] }).verified).toBe(false);
  });
  it('requires all receipts and rejects partial output', () => {
    expect(verificationGate({ count: 1, runs: [] }).verified).toBe(false);
    expect(verificationGate({ count: 1, runs: [receipt, { ...receipt, actual_usd: null }] }).verified).toBe(false);
    expect(verificationGate({ count: 1, runs: [{ ...receipt, warnings: ['Missing dataset'] }] }).verified).toBe(false);
  });
  it('accepts a documented zero charge but requires provenance', () => {
    expect(verificationGate({ count: 1, runs: [receipt] }).verified).toBe(true);
    expect(verificationGate({ count: 1, runs: [{ ...receipt, build_id: null }] }).verified).toBe(false);
  });
});
