import { randomUUID } from 'node:crypto';

/** Scout sessions have no updated_at column. Keep a small revision in the existing JSON. */
export function nextReviewProgress(session: { progress?: Record<string, any> }) {
  return { ...session.progress, reviewRevision: randomUUID() };
}

export function guardReviewSnapshot(query: any, session: { progress?: Record<string, any> }) {
  const revision = session.progress?.reviewRevision;
  return revision ? query.eq('progress->>reviewRevision', revision) : query.is('progress->>reviewRevision', null);
}
