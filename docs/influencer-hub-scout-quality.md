# Influencer Hub: scouting quality and monthly GMV

Implemented on 2026-10-04. All UI copy is English; entity names, post captions, sources and reviewer notes preserve their original language.

## Discovery and provider contracts

`POST /api/sport-hub/scout` with `action: preview` starts a server-owned session. Responses may be HTTP 202 (`pending`, `sessionId`); poll `GET /api/sport-hub/scout?sessionId=...` until completion. Provider run IDs are persisted; polling resumes the existing paid run under an atomic database lease. The browser retains a pending session and reuses it when the same criteria are submitted after reload.

Completed previews contain `candidateId`, `classification`, `reviewState`, evidence, profile provenance, nullable observed metrics, and existing CRM identity. Only matched candidates are preselected. Needs Review requires explicit confirmation of entity type, relevance and location. Confirm accepts session/candidate IDs and review decisions, never profile metrics from the client. Feedback is checked again before import, invalidating stale previews. Canonical account/post URLs are platform-scoped identities; Facebook story/watch IDs are retained.

Instagram profile discovery requests details; exact hashtag search requests posts from a direct tag URL. Instagram free-text post search is unavailable and the UI changes to Facebook/TikTok for keyword searches. Facebook combines profile/Page searches for individual creators and Page/Group searches for communities. Group search uses `parseforge/facebook-groups-search-scraper`; enable `APIFY_FACEBOOK_GROUP_SEARCH_VERIFIED=true` only after a successful contract check. YouTube discovery is unavailable.

There are no fabricated fallback accounts or randomly assigned metrics. Missing provider data displays Unknown. Zero remains zero. Quotes, partnership status, activity, privacy and geography are not manufactured from follower counts. Profiles are assessed using names, biography/category and location evidence, not third-party mentions in captions. Sports are assigned from profile evidence rather than the requested keyword. Metric snapshots are written only when all snapshot metrics were actually observed, with a unique session key to avoid duplicate snapshots on retries.

`npm run scout:worker` prepares durable previews for owned, authorized requests; profiles require human import confirmation. The discovery form can load saved worker previews. Queued post searches use the same trending pipeline. Legacy ownerless requests require a fresh authenticated preview.

## Review feedback

`POST /api/sport-hub/scout/feedback` accepts the session ID, candidate ID, reason, and optional corrected classification. Editor/admin authorization is required. Classification corrections apply to the account. Not Relevant and Wrong Location are scoped to the normalized topic/geography context. Deselecting a candidate does not create feedback. This is deterministic reuse of human corrections, not model fine-tuning.

## GMV

Monthly GMV is stored in `kol_gmv_monthly`, unique by KOL/month, with nonnegative VND amount, required evidence source, notes, updater and timestamp. The directory shows each creator's latest reported month (not the latest edit or largest amount), and supports sorting. Missing is a dash; zero is 0 VND. The dossier provides monthly history and editing.

`GET/PUT /api/sport-hub/kol/:id/gmv` is admin-only. Database RLS independently denies editor/viewer reads and writes. GMV is omitted from non-admin dashboard data and financial values are redacted from audit responses. Generic scout/record writes cannot update GMV. Existing entity merges are blocked when a secondary creator has monthly GMV, preventing cascade deletion of financial history.

The importer accepts `type: gmv` (or rows containing GMV (VND)). Required columns: KOL ID or unique exact KOL Name, GMV (VND), GMV Month (YYYY-MM), GMV Source. GMV Notes is optional. A GMV import updates existing creators only; all rows are validated before a single batch upsert. Duplicate KOL/month rows and ambiguous names are rejected. Template: public/templates/Monthly_GMV.csv.

## Rollout and verification

Apply `supabase/migrations/20261004000000_scout_quality_and_gmv.sql` before deploying the application. It requires the previous sport-hub/profile/metric migrations. It is additive and does not reclassify or delete existing CRM rows. Provider credentials remain server-only (APIFY_TOKEN).

Verification commands:

- `npm run typecheck` and `npm run build`
- `npx vitest run src/lib/apify/*.test.ts src/lib/sport-hub/gmv*.test.ts 'src/app/api/sport-hub/kol/[id]/gmv/route.test.ts'`
- On an isolated PostgreSQL database after the auth shim and sport-hub migrations: `tooling/scout/verify-gmv-rls.sql` (fixtures roll back).
- `npx tsx --env-file=.env.local tooling/scout/verify-providers.ts [instagram|facebook|tiktok]` (bounded paid provider calls, no CRM imports).
- With the local dev server on port 3017: `node --env-file=.env.local tooling/scout/verify-ui.mjs`. This creates and removes a temporary fixture route, uses mocked responses/auth for browser checks, and writes screenshots. It does not prove live Supabase persistence.

Recorded live results are in artifacts/scout-verification/providers*.json. Instagram profiles/direct-tag posts and Facebook profiles/public Groups returned parseable real data. The initial Instagram search-query hashtag response was unrelated tag metadata; the direct tag URL fixed retrieval. TikTok returned HTTP 402 (billing/actor access required). The configured Supabase REST endpoint and direct database host were unreachable; this migration has been tested on isolated PostgreSQL but not applied to that database. Browser checks therefore used explicit fixtures. No claim of complete live UI → Supabase → reload verification is made.

## Live schema verification after manual migration

The project was resumed and the manual SQL migration was applied by the user. Subsequent REST GET checks returned HTTP 200 for scout_sessions, scout_feedback, kol_gmv_monthly, and every added column on kols, communities, scouted_posts, kol_metric_snapshots and scout_requests. Anonymous REST reads of GMV, sessions and feedback returned HTTP 401 / PostgreSQL code 42501. This supersedes the earlier unavailable-REST status above. Direct PostgreSQL connectivity is still blocked by the local DNS/IPv6 path. Live authenticated editor/viewer checks and full UI import/save/reload persistence remain unverified; these schema checks do not claim those flows passed.
