# Scout search v4

The user flow is Request → Start Scout → Review. The forms prepare a server plan inline; no extra approval screen is introduced. New searches default to Vietnam and topic mode. Exact hashtags remain exact, including when reopening legacy criteria.

## Retrieval and assessment

- Role-specific bilingual running queries replace generic name searches. Instagram topic discovery uses a hashtag set. Facebook retains the existing profiles/pages and Page/Group actors.
- Adaptive searches use at most three rounds and 120 requested search rows across branches, ten unique profile enrichment attempts, and five owned posts per enriched account. Qualified new identities drive early stopping; existing results, duplicates and unverified candidates do not fulfil the target. Two consecutive rounds without new identities stop further search.
- A round and its existing-record snapshot are checkpointed. Provider task hashes, pinned builds, reservations and unresolved-start fencing remain authoritative. A retry after saving its own posts cannot reinterpret those posts as pre-existing and launch extra queries.
- Incomplete profiles are hydrated before assessment. Details merge by exact platform/account identity, including bio, category, location, metrics and observed owned posts. Invalid author URLs do not become enrichment targets.
- Qualified, Needs Verification, Below Target and Excluded are persisted in the session result with dimension-specific evidence. Below Target and unverified content never enter Trending. Qualified content uses the existing persistence path, prioritizing new records over existing matches. Profile import requires an explicit persisted approval.
- Missing metrics remain unknown; zero observations are preserved. Search terms, language and provider query context are not geography evidence. Search v4 does not advance account collection watermarks. Existing entity/incremental collection is unchanged.

## Deployment prerequisites

Apply `supabase/migrations/20261011010000_scout_search_budget.sql` after the existing runtime migrations. It replaces the reservation RPC while preserving its role checks, shared receipt/cache behavior, advisory lock and platform/system caps. It adds the user-approved session cap to the atomic reservation. The service-only `scout_search_budget_policy()` probe blocks new adaptive plans until this migration is present. No new table is needed; plans and build snapshots live in session params.

Optional Facebook location inputs and TikTok paid video sort/date filters remain disabled unless the exact pinned capability has `receipt.verifiedSearchOptions`. Actor success alone does not enable them. Date filters already verified on Instagram continue to use their existing receipt. Filter capability flags are retained only for the same immutable build.

After a specific paid budget is approved, use:

```sh
npx tsx --env-file=.env.local tooling/scout/verify-search-options.ts --allow-paid --option=facebook-locations --budget-usd=0.25
npx tsx --env-file=.env.local tooling/scout/verify-search-options.ts --allow-paid --option=tiktok-video-filters --budget-usd=0.5
npx tsx --env-file=.env.local tooling/scout/verify-search-options.ts --allow-paid --option=instagram-date-filter --budget-usd=0.25
npx tsx --env-file=.env.local tooling/scout/search-ab.ts --allow-paid --total-budget-usd=2
```

These are examples of caps, not an authorization to spend. Verification uses the existing pinned build and does not import content/profiles. A/B creates four durable preview sessions: Running and HYROX, baseline and planned, each capped at one quarter of the approved total. Existing daily/platform limits still apply. Sessions and provider receipts remain available for human precision review. Compare Qualified new, reviewed precision, reviewable yield and cost per Qualified new before production rollout. Do not enable optional filters or deploy the new workflow as validated solely because excluded counts decrease.

## Verification

- Focused and full Vitest suite; Scout and application TypeScript checks; frozen-source production build.
- `tooling/scout/verify-search-ui.mjs` uses actual form/result components with all API calls intercepted. It checks inline planning, plan hash submission, Vietnam/topic defaults and grouped results without a No Results label. It creates and removes an isolated temporary fixture route; it requires a local Next dev server and Playwright (`SCOUT_PLAYWRIGHT_PATH` can point to a bundled module).
- Disposable PostgreSQL fixture: create a fresh database with `tooling/scout/search-budget-schema.sql`, apply the new migration, then run `tooling/scout/search-budget-fixture.sql`. Never use fixture SQL on a shared database. The assertions cover reviewed cap, platform cap, repeated reservation, exhaustion and service-only access.
- Stored evidence replay uses assessment version 4 and deterministic child IDs; source sessions, their review decisions and provider ledgers are retained. Replay never starts/polls a provider, writes Trending or advances watermarks.

No production migration, deployment, paid filter probe, paid A/B run or real import was performed during implementation. New inputs are implementation-ready; fresh-provider precision remains to be measured.

Implementation checks: 39 files / 319 tests passed; application and Scout typecheck passed; frozen production build passed. Actual-component browser fixtures passed and the disposable PostgreSQL budget assertions passed. Receipts and UI screenshot are in `artifacts/scout-search-v4/`. These checks do not establish live provider precision or hosted rollout.

## Production deployment — 2026-10-11

The user authorized deployment. Applied `20261011010000_scout_search_budget.sql` transactionally in the Sport Platform production Supabase SQL Editor. Independently read policy v4 through the service API; SQL assertions confirmed anon/authenticated cannot execute the probe and service_role can.

Vercel deployment `dpl_fhDA9bbqmpKMr9n4N7cM8XGWbTYH` is Ready and aliased to [production](https://sportcommunityplatform.vercel.app/scout). Cloud compilation/type validation passed. Uploaded a frozen snapshot whose source hashes match the tested build; no real environment files, docs or QA artifacts were uploaded. Existing dirty workspace work was preserved.

Authenticated production form previews passed for Running and HYROX: target 5 qualified new results, reviewed cap $1.00, role-specific English/Vietnamese queries, 3-round/120-row/10-profile limits, Advanced editing and enabled Start Scout after planning. No Start action was submitted. Existing HYROX results reopened successfully. Anonymous plan requests return 401; login returns 200; production Workflow fixture returns 404. Provider reservation count remained 73 and session count 65 across smoke checks. No paid runs, approvals or imports were created.

Evidence: `artifacts/scout-search-v4/production-rollout.json`, `deploy-source-receipt.json`, `vercel-production-inspect.txt`, `production-plan.png`, `production-migration.png` and `production-existing-review.png`.

The deployment proves hosting/schema and read-only form/review behavior. It does not establish fresh-provider precision. Optional-filter paid probes and Running/HYROX A/B remain pending a separate approved budget; unverified optional flags remain disabled. Historical sessions retain historical assessments until explicit reassessment. Supabase still displays a quota/grace-period warning, although its API was available throughout deployment.

## Settled failure starvation repair — 2026-10-11

Production session `e521ae13-4d62-4234-8afe-f1d72fe0a157` (Pickleball Vietnam, Instagram + TikTok, $1 cap) stalled after Instagram run `Ny6GCphloRQuktO2M` timed out at 180 seconds. Logs show Instagram block/retry responses, 19/20 crawled requests; actual charge $0.0459. The Workflow was still active, but each retry re-polled and re-settled the immutable failed run, consuming the one-provider-unit step budget before TikTok could start.

Runtime now fails fast from settled failed/aborted/timed-out receipts. Three regression cases prove these terminal receipts do not make another network request or settlement and allow a subsequent provider unit in the same bounded step. Runtime/planned-search tests: 35 passed; application typecheck and hosted production build passed.

Patch deployed as `dpl_FqgGhkDVDC8PS8chRicenDmHxWJ4`, Ready on the production alias. Canceled only the stalled orchestration `wrun_41M4MV5GA60GY67DAYC4Z883ME` and used the authenticated existing Recover Task control to resume the same session with `wrun_41M4MVHVX10GSJ5RPXVVDY2751`. TikTok run `BBbtpNmM2YgudeBlJ` started under the original approved cap. The old Instagram run identity/charge remain unchanged; no second session, duplicate Instagram start or import was created. The resumed collection is still running; this proves forward progress, not completed search quality. Evidence: `terminal-failure-recovery.json` and `terminal-failure-recovery.png`.

Separate observed UX issues remain: the discovery form uses a generic waiting message, and location suffix generation can repeat Vietnam when it already appears in the topic. Neither causes this Workflow stall.

## Adaptive deadline and saved-result recovery — 2026-10-11

The same Pickleball session was later incorrectly failed with `PENDING` / HTTP 202 when its original processing age crossed 15 minutes. Six provider receipts succeeded (20 search profiles and five detail runs), but no complete round checkpoint had yet been produced. The old exception path discarded the available result presentation.

Expired adaptive searches now assess completed receipts under the paid-replay guard, complete with a time-limit warning when evidence exists, and report `SEARCH_TIME_LIMIT` when none exists. Saved hydration is merged only into its matching account. Existing v4 search plans preserve result groups during stored replay. Explicit admin recovery reopens only adaptive failures whose recorded error was PENDING and preserves the original deadline; it never restarts provider collection. Permanent failures remain excluded. Result UI shows stored error details and uses current response status/counts after recovery instead of stale session props.

245 Scout tests, application typecheck, and the final hosted build passed. Deployment `dpl_oLCRDEdaXPkt3toWDFFTPawNDgG5` is Ready on the production alias. Used Recover Saved Results on the existing session. It completed with 20 Needs Verification candidates, 0 Qualified, 0 Excluded and 1 existing account. Result group/count metadata was reconciled from the saved assessment decisions for this repaired session. All seven provider receipt IDs, run IDs and charges remained unchanged (total $0.1444); zero new paid runs or imports occurred. Human approval is still required.

## Production CSS packaging incident — 2026-10-11

The ad hoc release snapshots copied `postcss.config.mjs`, which this repository does not have, and omitted the actual `postcss.config.cjs`. Next.js builds still passed while emitting uncompiled Tailwind directives. This left the dashboard and Scout without utility styling. Source-build/type checks did not prove the deployed CSS was correct.

Use `node tooling/scout/prepare-production-snapshot.mjs` to prepare subsequent release snapshots. It requires PostCSS and Tailwind configuration, copies only the Vercel project identity, and excludes local environment credentials/build caches. The frozen local build verifier now requires these configurations and checks generated flex/grid utilities. After deployment, run `node tooling/scout/verify-production-css.mjs https://sportcommunityplatform.vercel.app artifacts/scout-search-v4/ui-css-recovery.json`; a missing stylesheet, uncompiled directive, or absent utilities fails verification. Verify the authenticated dashboard visually as well.

The first repair build reused stale build cache and the CSS verification still failed. Rebuild without cache using `vercel deploy --prod --yes --force --scope hoang-le2` from the prepared snapshot. A Ready deployment alone is insufficient release evidence.

Final deployment `dpl_xLnTv1Xx1hLoEXaQVnSoKi364sUQ` is Ready and aliased to production. Hosted compilation/type validation passed. The production CSS probe passed: both stylesheets returned 200, generated Tailwind utilities were present, and no raw directives remained. Authenticated Chrome screenshots confirmed the restored dashboard navigation, KPI/card grid, fonts/buttons and Scout modal. Evidence: `ui-css-recovery.json`, `ui-css-recovery-dashboard.png` and `ui-css-recovery-scout.png` under `artifacts/scout-search-v4/`. These observations verify styling, not the completion of the user’s independently running reassessment.

## Profile type and geography correction — 2026-10-11

The reported HYROX session `4cc9de34-2d4d-4ae7-96a2-6e39cc79ac2c` requested Individual KOLs in Ho Chi Minh City. Its saved results mixed unverified pages with individuals. Facebook detail addresses represented as strings were dropped; biography keywords such as coach could classify a gym as a person. Broad non-running primary queries omitted role/city context.

Profile parsing now preserves string addresses, address country, category arrays and additionalProperties fallbacks. Explicit groups/communities and business identities take precedence over generic coaching copy. Structured foreign addresses and conflicting cities exclude candidates even when biographies mention the requested city; explicit foreign country names on accounts also conflict with Vietnam/city scope. Owned posts can support topic relevance but cannot establish person identity or residence. This is conservative rules-based assessment; unsupported identities/geography remain unknown rather than guessed. Existing creator Pages remain eligible with individual evidence.

Non-running preview queries now include athlete/coach/creator or club/community variants plus the selected city from the first round. No Actor or immutable build was changed, and no unverified provider filter was enabled. Legacy hydration also considers missing classification/geography evidence, bounded to ten identities. Results show profile-specific KPI copy, Needs Verification status, classification, location and assessment reasons. A profile-scope revision gives explicit saved reassessment a fresh, idempotent child instead of returning a cached older assessment; original sessions and human decisions are preserved.

250 Scout tests and application typecheck passed. Read-only replay of all 30 saved HYROX search identities produced 0 Qualified, 9 Needs Verification and 21 Excluded. HYROX Thailand, Bull City CrossFit, WeBorn, GSR FIT and Salt Lake City were all Excluded using saved evidence. Receipt: `artifacts/scout-search-v4/hyrox-profile-scope-replay.json`. No provider requests, paid A/B, CRM import or production assessment writes were performed for this replay. Replay proves assessment behavior, not improved retrieval precision.

Final release `dpl_8nSTGt1Wg8Bjgz93vyKJzPtRW1A2` is Ready on production; hosted build/type validation passed. Production CSS verification is recorded separately. The previously authenticated Hoang Chrome window was unavailable for this turn, so the authenticated new review/reassessment flow was not visually verified in production.

Evidence: `artifacts/scout-search-v4/deadline-recovery.json` and `deadline-recovery.png`.
