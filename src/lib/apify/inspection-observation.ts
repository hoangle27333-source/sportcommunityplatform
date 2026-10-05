import { createAdminClient } from '@/lib/supabase/admin';
import { canonicalUrl } from './discovery-quality';
import { ScoutError } from './errors';
import { z } from 'zod';

/** Never accept a client-supplied provider receipt as proof of verified metrics. */
export async function inspectionObservation(data: Record<string, any>, owner: string, community = false) {
  if (!data.inspectSessionId) return null;
  const id = z.string().uuid().parse(data.inspectSessionId);
  const { data: session, error } = await createAdminClient().from('scout_sessions')
    .select('kind,status,params,result').eq('id', id).eq('owner_id', owner).single();
  if (error || !session || session.kind !== 'inspect' || session.status !== 'complete') throw new ScoutError('Verified inspection not found. Review this link again before saving.', 'INSPECTION_NOT_FOUND', 404);
  const observation = session.result?.data;
  const url = data.profileUrl || data.groupUrl || data.url;
  if (!observation || !canonicalUrl(url) || canonicalUrl(session.params.url) !== canonicalUrl(url)) throw new ScoutError('Verified details belong to a different link.', 'INSPECTION_URL_MISMATCH', 409);
  const fields = community ? [['members','followers']] : [['followers','followers'],['avgViews','avgViews'],['er','er']];
  const unchanged = fields.every(([formField, providerField]) => (data[formField] ?? null) === (observation[providerField] ?? null));
  // Edited metrics are manual observations; they must not inherit an Observed badge.
  return unchanged && observation.provenance ? { ...observation.provenance, source: 'apify', inspectionSessionId: id } : null;
}
