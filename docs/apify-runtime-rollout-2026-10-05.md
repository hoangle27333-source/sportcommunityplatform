# Apify runtime rollout — 2026-10-05

## Status

The additive runtime migration was applied in one transaction through the authenticated Supabase SQL Editor in the requested Chrome profile. The remote database has no `supabase_migrations.schema_migrations` table; a read-only prerequisite query confirmed no missing runtime columns, and the source checksum plus visible success receipt are recorded in `artifacts/apify-runtime/migration-remote-receipt.json`. No historical migration versions were invented or replayed. Server-only table access and anonymous RPC denial pass on the target database. Live verification has enabled 15 contract/build capabilities. The verification ledger records 26 actual provider runs, $0.0919 actual charge and $0 held, below the $5 limit. Rollout is not yet complete: the configured Railway Redis resets connections, and several browser/CRM workflows still need dedicated receipts.

The IPv4 Session Pooler endpoint was verified from the project dashboard and configured locally. Official Supabase CA certificate validation passes, but the existing database password is rejected. CLI migration inspection remains unavailable; SQL Editor provides the authenticated transport. Redis Railway did not complete the verification worker connection; the worker fixture uses the existing local Redis on a separate queue.

Existing unrelated working-tree changes, human review, manually locked fields, original captions and entity names remain in place. Historical metrics without provider provenance are labeled Unverified; they are not deleted or rewritten.

## Implementation map

| Area | Implementation |
|---|---|
| Contracts | `src/lib/apify/registry.ts`, `providers.ts`, `runtime.ts`: task inputs, per-Actor validation, immutable build receipts, distinct Facebook Profiles/Pages identity, TikTok user search input, dataset aliases, item-level partial errors. |
| Cost | Shared in-flight claims and atomic reservation/settlement SQL with USD session/day/verification/run caps; owned-run `usageTotalUsd`, pricing, usage and charged events retained; missing billing holds reservations. Known run IDs are reconciled for billing even after a session completes via public fallback. Ambiguous starts remain held for manual reconciliation. |
| Recovery | BullMQ `social-scout`, database leases and heartbeat tokens, import leases, read-only session polling, 5–30 second backoff, reconciler, ambiguous-start holds. Legacy runs only replay when their recorded input can be identified exactly. |
| Discovery | Deduplicated authors, up to three expanding limits capped at 60, feedback replay on cached evidence, person/community regression fixes, query geography conflict rejection. Batch hydration is used only after a batch receipt. |
| Posts | Equal platform quotas, round-robin merge before deduplication/truncation, additional retrieval on expandable providers, publication dates, observed geography checks, insert/refresh/duplicate counts, 30-day first window and 24-hour overlap. Watermarks advance only after persistence and complete retrieval and cannot move backwards. |
| Sync | Real observations replace random rescout metrics. Platform URLs resolve from connected channels; missing values retain old stored values; zero observations are valid. Derived ER excludes incomplete observations and records sample size/formula. CRM bio changes remain pending diffs and locked fields are respected. |
| Tracked Accounts | Same Apify executor/adapter. Public Playwright fallback is limited to identified access/5xx/timeout failures. Billing, permission, budget and schema failures do not trigger fallback. Observation snapshots and compatibility dispatch jobs are idempotent. |
| Inspect URL | Free metadata inspection first; explicit Fetch Verified Details uses a durable paid session. Profile imports reject post/reel/story/watch links. Unsupported Group detail contracts remain unavailable. |
| Comments | Preview/start, selected post IDs fixed at submission, 5 posts × 20 comments, maximum 100. IDs, original text, dates and provenance retained; comment contact/author fields are excluded. No scheduled enrichment. |
| Audit | Dossier and shared audit UI consume stored evidence only. Missing samples yield Unknown rate/risk. Classifications reference evidence IDs, rates use classified sample count, cache fingerprint/analyzer version follows changed evidence. |
| Administration | Settings budget/usage UI and admin-only API; per-platform/Actor/module records, held costs and cost per saved candidate/post/comment used in audit. Regular users do not receive billing payloads or tokens. |
| Retention | Reconciler clears expired provider caches and raw run output after 30 days; retained normalized evidence/provenance supports downstream decisions. |

## Budget policy

Default limits: $1/session, $10/day across the system, $5 lifetime verification, $0.25/run, 180-second Actor timeout. Day boundary is Asia/Ho_Chi_Minh. Verification also consumes the daily budget. Request-body limits cannot override policy. Cached reads do not reserve money. Admin budget edits share the reservation transaction lock.

`maxTotalChargeUsd` and immutable `build` are run query options, not Actor input. `maxItems` is sent only for a confirmed PAY_PER_RESULT pricing model. Current API documentation states that authenticated owner `usageTotalUsd` is the actual total paid, including applicable Actor fees: https://docs.apify.com/api/v2/actors-runs-post

## Migration procedure

1. For future CLI migrations, configure a working Session Pooler credential and retain TLS validation using the official certificate in `tooling/scout/supabase-ca.crt`. The current runtime migration was applied through SQL Editor. Keep credentials in `.env.local`; do not print them in logs.
2. Read `supabase_migrations.schema_migrations` and compare with repository history. The additive runtime migration is `supabase/migrations/20261005000000_apify_runtime.sql`; prerequisites include the previous scout-quality migration, scout sessions, entity/post tables and existing audit/snapshot tables.
3. Apply pending migrations in order on a test environment using the normal Supabase migration tooling. Do not blindly push every pending migration in this dirty checkout to production.
4. Verify new tables, RPC grants, RLS denial for anon/authenticated, atomic limits, import/session leases and monotonic watermarks. Save a migration-history/checksum receipt.
5. Start Redis and the core worker (`npm run worker:core`). Use `npm run scout:worker` to enqueue/reconcile durable sessions. API session creation remains HTTP 202; browser polling never executes Actors.
6. Verify each provider capability before enabling it. Empty capability tables deliberately disable paid capabilities.

Recreate the disposable SQL test service with `docker run --name sport-apify-runtime-qa -e POSTGRES_PASSWORD=apify-qa-only -p 127.0.0.1:55432:5432 -d postgres:16`, wait for PostgreSQL readiness, then run `node tooling/scout/verify-runtime-sql.mjs`. Remove it after the checks with `docker rm -f sport-apify-runtime-qa`. The password is for this disposable fixture only.

The isolated SQL verifier uses only a disposable PostgreSQL instance at localhost:55432. It drops/recreates **that test schema** and must not be retargeted to any real database. It checks duplicate claims, concurrent daily/session limits, settlement, verification caps, role revocation, timezone/day reset, watermark monotonicity and RLS/RPC denial. This is not proof that remote migrations have been applied.

## Capability matrix and live verification

Activation follows persisted receipts in the target runtime. Instagram discovery/details/feed and Facebook Profiles/Pages/search/details/feed passed initial live gates. Group search also passed its contract, but remains subject to the separate Group search feature flag. TikTok Scraper requires a minimum run cap of $0.50, exceeding the approved $0.25 policy, and remains disabled. Instagram/Facebook comments and two-profile batch details passed. Instagram feed date filtering passed; Facebook date filtering returned an empty sample and remains unavailable as an Actor option. Group feed returned no valid output and remains disabled. Only default datasets have receipts. All rows and build IDs are recorded in `artifacts/apify-runtime/live-capability-matrix.json`. Adapter support alone is not a receipt.

| Platform | Actor | Tasks | Additional gate |
|---|---|---|---|
| Instagram | apify/instagram-scraper | profile discovery/details, hashtag/posts, comments | Batch details require `supportsBatch` receipt; comments need an explicit public test post. |
| Facebook | apify/facebook-search-scraper | Profiles and Pages as separate runs; posts/search | Both branches must pass independently. |
| Facebook | apify/facebook-pages-scraper | details | Person/Page behavior needs actual output validation. Group details are unavailable. |
| Facebook | apify/facebook-posts-scraper | profile feed | Publication/date-filter coverage must be checked. |
| Facebook | apify/facebook-groups-scraper | public group feed | Group contract and approval must pass. |
| Facebook | parseforge/facebook-groups-search-scraper | group discovery | Disabled unless Group search verification flag and build receipt both exist. |
| Facebook | apify/facebook-comments-scraper | comments | Explicit public post fixture and sample/ordering receipt. |
| TikTok | clockworks/tiktok-scraper | user search/details, hashtag/keyword/posts | Verify `maxProfilesPerQuery`, feed dates and author identity. |
| TikTok | clockworks/tiktok-comments-scraper | comments | Explicit public post fixture and comment quotas. |

Run `npx tsx --env-file=.env.local tooling/scout/verify-providers.ts --check=<check-name>` after migration. It uses production reservations with `verification=true`, an immutable build number, no CRM import, and stores run/build/input/dataset/cost receipts in `artifacts/apify-runtime/`. Add `--batch` for a profile-details batch check. Supply `APIFY_VERIFY_COMMENT_URLS` as a JSON map of platform to public post URL; no profile URL is inferred as a post. Memory comparisons use `--memory=512` etc. and do not change the production capability receipt. Actor default memory stays unchanged until matched-input coverage and actual cost demonstrate an improvement within the $5 verification ledger.

Before changing builds, rerun the same contracts. Disable `scout_budget_settings.enabled` to stop new paid reservations, or mark an individual capability unverified to roll it back. Retain existing run IDs and reservations; do not reset ambiguous starts or restore random metrics.

## Verification evidence and remaining gates

- Full Vitest suite, focused provider tests, typecheck and isolated production build results are recorded separately in `artifacts/apify-runtime/validation.json`.
- PostgreSQL 16 isolated migration and concurrent budget/RLS tests passed. The remote additive migration and read-only access checks also passed through SQL Editor and Supabase REST respectively.
- Browser inspected the actual KOL dossier, confirmed separate Collect Comment Evidence and stored-evidence audit controls, Unverified historical labels, and unauthenticated collection denial (`Please log in`) on desktop and narrow viewport. No CRM import or paid run resulted from browser checks.
- Full authenticated start → worker → provider → persistence → reload, admin/editor/viewer role tests against the target database, budget exhaustion UI, cache replay runtime, tracked fallback, partial datasets, comments/audit invalidation and benchmark still require dedicated workflow receipts; initial provider verification and worker persistence do not prove every CRM/browser workflow.
- The labeled badminton fixture and identity regression cases pass. They do not establish population precision/recall or a measured cost reduction. Broader labeled samples and matched-input live receipts are required before reporting such outcomes.

## Live continuation receipt

- Remote access and ten concurrent same-task reservation calls passed. The reservation-only fixture started no Actor and settled its hold to zero.
- The isolated BullMQ queue executed a real Inspect session, stored the result on the target database and replayed completion without a second provider run. An authenticated UI also created an Inspect session; that session was explicitly moved into the verification ledger before execution and completed through the isolated worker without saving a CRM profile.
- UI inspection exposed an enqueue readiness hang: the database session existed but the browser did not receive HTTP 202 while Redis was connecting. `enqueueScoutSession` now has a three-second deadline; the persisted warning and HTTP 202 fallback are covered by regression tests. The reconciler uses the same deadline and excludes CLI-managed verification sessions. The complete browser reload loop after this fix remains unverified; simultaneous native Chrome activity interrupted the final UI check.
- Instagram build 0.0.797 was benchmarked with identical input at Actor default (128 MB), 512 MB and 1024 MB. All three returned one profile with followers, average views and ER coverage. Charges differed in this small live sample ($0.0027 / $0 / $0), which is insufficient evidence for a reliable cost reduction. Keep default memory. Timing and memory observations are in `memory-benchmark.json`.
- TikTok minimum run cap $0.50 exceeds the fixed $0.25 policy. Disabled capability receipts explain the policy block in the UI. No higher cap was sent.
- For local worker QA, use `REDIS_URL=redis://127.0.0.1:6379` only for the test command. The existing configured Redis URL was preserved. Restore that connection before deployment, or configure a reachable Redis consistently for both producers and workers.
- Final build used a frozen source snapshot, excluding only the transient `src/app/templates/scout-workspace-qa` fixture. Shared development and QA builds create/remove that route concurrently. The source hashes are recorded in `build-source-receipt.json`; application source typecheck and tests ran separately in the original workspace.

Source gates: `npm run scout:typecheck` passes, full Vitest suite passes (19 files / 232 tests), frozen snapshot production build passes. The scoped typecheck covers application and verification tooling source while avoiding generated transient QA route types.

New KOL and community drafts start with no sport selected, so absent inspection evidence does not silently become Pickleball. Existing edit forms and manually selected sports are preserved.

## Remaining-defect correction receipt (20:05 ICT)

- Dedicated `SOCIAL_SCOUT_REDIS_URL` now configures both the Scout producer and consumer. Local `.env.local` points Scout at the existing local Redis; the general `REDIS_URL` is preserved. Deployed processes reject a localhost Scout URL and still need an available external Redis service. Restart the API/worker after environment changes. Run `npm run worker:scout` for local development with automatic code reload, or `npm run worker:scout:start` for non-watch execution. Restart deployed workers with each code rollout so they execute the same task contracts as the API.
- Sync prefers database channels, using the legacy file store only when persisted channels are absent. Canonical profile and author URLs are compared so `www` and trailing slash differences do not discard valid observations.
- Tracked fallback stores an attempt/observation receipt before and after the public scrape. A repeated execution in the same session reuses the saved observation and snapshot key; a failed or interrupted fallback is not silently attempted again.
- Entirely failed comment collection now returns a typed failure. Partial collection keeps valid evidence. Empty/duplicate post selections are rejected. Preview reads the configured policy, rather than displaying a fixed $1 ceiling. The reservation transaction still enforces actual remaining session/day budget at execution time.
- New profile/community forms default missing tier/geography/privacy/activity to Unknown and partnership status to New Scout (Unverified). Existing edit forms are untouched. Community platform controls now include the observed Facebook Page, Instagram and TikTok platforms. Lark omits Unknown single-select fields instead of creating unsupported choices; original names/text remain unchanged.
- Inspect result labels and numbers use English and `en-US`. Authenticated Chrome Hoang completed inspection, reloaded the app, recovered the result through Activity, and restored evidence into the human review form. The same result renders at 400 × 665. No CRM import was submitted. The UI session was a shared cache hit with zero new provider runs, preserving the original observation timestamp.
- New isolated persistence regressions cover locked fields, missing metrics, valid zero, channel precedence, canonical identity, fallback retry/snapshot deduplication, comment quota/evidence IDs, all-failed outcomes, and policy previews. These use in-memory persistence fixtures; they are not production CRM write evidence.
- `node tooling/scout/verify-production-build.mjs` creates a temporary frozen source build, excludes only the transient concurrent QA route, records source hashes and compiler output, and cleans up its temporary checkout. It preserves the running development cache.

Current live verification: **27 provider runs, $0.0919 actual, $0 held, 15 verified capabilities**. Evidence: `browser-recovery-receipt.json`, `worker-runtime-receipt.json`, `inspect-reload-proof.png`, `inspect-mobile-proof.png`, `inspect-review-proof.png` under `artifacts/apify-runtime/`.

The rollout remains incomplete: browser role/budget denial and production CRM mutation workflows still require full runtime evidence. TikTok minimum charge and unsupported Group/date/multiple-dataset capabilities remain disabled by policy/gate. No policy cap was raised and no credentials were reset.

Final validation after all corrections: **25 files / 265 tests**, application/tooling source typecheck, scoped diff check and latest frozen production build all pass. Queue readiness no longer treats a connecting socket as ready and cleans timeout listeners. Authenticated Inspect recovery is proven; the pending staging request is for full CRM write workflows without production verification fixtures.

## Production CRM and TikTok continuation — 2026-10-05 20:52 ICT

The user explicitly changed the target from unavailable staging to production. The additive `20261005010000_tiktok_run_budget.sql` migration was applied through the authorized Chrome Hoang Supabase SQL Editor. Migration history was checked in the preceding runtime rollout (no remote history table); the new migration only adds `tiktok_run_usd` and replaces the already-verified reservation RPC. TikTok reserves up to USD0.50/run; all other Actors remain USD0.25/run. The USD1/session, USD10/day and USD5 verification caps remain unchanged. Production reservation-only probes claimed two USD0.50 TikTok reservations, denied a third under the shared session cap, and settled both to zero without starting an Actor.

All five TikTok contracts passed live verification: profiles, profile details, hashtag posts and account posts on `clockworks~tiktok-scraper` build `0.0.612`; comments on `clockworks~tiktok-comments-scraper` build `0.0.468`. Their capability rows are enabled with immutable build/run/dataset/cost receipts. Batch/date/multiple-dataset extensions remain disabled where unverified. At the final ledger observation, 20 capabilities were verified, verification actual spend was USD0.15555, and held spend was USD0. No savings percentage is inferred from this small sample.

Existing Hana Giang Anh was used for the authorized CRM flow; no KOL profile was imported. Sync persisted actual Instagram observations, preserved original name and bio through pending review, and reported no missing metrics. The account has no locked fields, so successful lock preservation is covered by regression fixtures rather than claimed as a production lock test. Posts saved 8 items and excluded 2 outside the retrieval window. Explicit comment collection selected one post with observed comments, saved 2 comments with stable evidence IDs/provenance, and audit persisted history `8b2a24e9-5a27-4f66-87ce-7cc05be7cd22` plus cache. The stored-evidence heuristic audit started no provider run. Its rates describe only those 2 comments. Browser reload showed 8 posts/2 comments and the bounded-sample limitation.

A separate existing Đỗ Kim Phúc TikTok sync returned an unavailable provider item. The validator rejected it as SCHEMA_MISMATCH before CRM persistence; session `38010e40-4528-400b-815b-d19c12cb074a` remains failed. No replacement run was started. This does not establish successful live sync for that account. The receipt records the provider rejection and USD0.0047 charge.

Runtime QA exposed and fixed: selecting an unsupported YouTube primary channel as Facebook; querying nonexistent `profiles.avatar_url`, which made an admin render as viewer; email/metadata-based privilege fallback; viewer audit writes; ignored audit history/cache persistence errors; and Audience panel reopening without loading its saved audit. Persisted DB roles are authoritative. Missing profile reads fail closed to viewer. Audit controls are disabled for viewers, and role checks apply to the mutation endpoints and budget administration.

UI validation: the existing production admin identity read/saved unchanged budget policy and saw actual billing data. An actual failed session showed the budget-exhausted warning. Viewer/editor button checks used the real components inside an isolated AuthContext fixture, with server identity unchanged and no paid task submitted; these are UI fixture checks, not real viewer/editor production logins. Server permission regressions and isolated PostgreSQL role/RLS/RPC tests passed. Remote anonymous table/RPC access was denied. The temporary UI fixture was removed. Browser audit reload used a frozen production build on localhost:3002 against production Supabase because a concurrent build overwrote the shared localhost:3000 dev cache. Source changes have not been deployed remotely.

Evidence: `artifacts/apify-runtime/tiktok-rollout-receipt.json`, `tiktok-remote-budget-receipt.json`, `crm-production-receipt.json`, `crm-locks-receipt.json`, `role-ui-receipt.json`, `budget-admin-ui.png`, `budget-exhaustion-ui.png`, `crm-audit-reload-ui.png`, and timestamped provider verification files. Production verification scripts accept explicit authorization; CRM scripts preserve session IDs for resume and do not create replacement runs after unknown starts.

Final checks for this continuation: 289 tests across 29 files passed; scout verification typecheck and frozen-source production build passed. Isolated PostgreSQL concurrency/ledger/role/RLS tests passed after the TikTok migration. UI role flags now share a tested `roleAccess` policy; catch branches also fail closed. Owned PostgreSQL fixture and frozen build QA server were stopped after evidence capture. No remote application deployment or production viewer/editor login verification is claimed.
