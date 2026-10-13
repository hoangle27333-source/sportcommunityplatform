# Top post collection

`selectionMode: "top"` adds a bounded views-first search to topic discovery and saved KOL/community channels. Legacy requests retain their existing incremental, high-engagement and latest-30 behavior.

## Request and execution

Use the existing `/api/sport-hub/scout/plan` endpoint with `kind: trends | kol-posts | community-posts`, then send its `planHash` to the existing content endpoint. Top fields are `rankingMode: views-first`, `recentDays: 1 | 7 | 30`, or both `publishedFrom` and `publishedTo` as UTC ISO timestamps. Custom intervals must be in the past and no longer than 30 days. `thresholdsEnabled` defaults to false; enabling it requires observed minimum views OR minimum likes + comments. The historical threshold defaults remain 10,000 and 100.

Top plans and execution check the shares schema before starting any provider work. The publication window and provider date-filter reference are snapshotted at session creation. Top search never reads or advances incremental watermarks.

The row request budget is `min(120, max(60, 6 * N))`, including repeated prefixes, duplicates and unparseable results. At most 40 rows are requested in each round, across reviewed sources and query variants. Actors without pagination cursors expand their prefix; larger requests count in full. Native sorting is applied only with a verified receipt on the pinned build. The current generic TikTok filter receipt establishes MOST_LIKED and MOST_RELEVANT; LATEST additionally needs `tiktokVideoSortings` containing LATEST. Unsupported providers use provider default retrieval with explicit local ranking. No provider is described as a native MOST_VIEWED source.

Collection continues after N matches. It stops at the candidate budget, exhausted sources, two rounds with no new identities, the session budget, or the existing 15-minute task deadline. Completed round checkpoints and provider input receipts are reused after retries. Uncertain starts retain the existing fail-closed behavior.

## Results and persistence

Ordering is views, likes/reactions, comments, shares, publication date descending, then URL ascending. Unknown metrics remain null and observed zero remains zero. Results without views fill only the remaining slots after observed-view posts and appear in `groups.viewsUnavailable`, separate from `groups.topByViews`. Their combined length is at most N. Posts without any observed engagement metric remain Needs Verification.

Topic search checks observed caption/hashtags with sport aliases; exact hashtag search preserves exact matching. Entity collection verifies author ownership or group membership. Both date boundaries are checked locally. The selected query, sport and location never count as observations. Nationwide retains its historical unrestricted behavior; Vietnam is an explicit evidence requirement.

Qualified results are saved automatically. New inserts, refreshed records and existing records are all returned with rank and saveState. Missing metrics never overwrite observed persisted values. Stored-evidence reassessment is preview-only, uses the parent's frozen window and search plan, creates an idempotent child, and starts zero providers. Live deadline fallback saves eligible collected evidence after leaving the replay context.

UI and history expose sample size, publication interval, metric observations, stop reason and source failures. Results represent top within the collected sample, not global platform coverage or measured growth.

## Migration and verification

Apply `supabase/migrations/20261013000000_scout_top_posts.sql` before using top collection. The nullable shares column preserves unknown historical values. Legacy collection does not write shares until this new mode is used, so it remains compatible with the previous schema.

This change is local and has not been deployed. Current runtime inspection found pinned verified provider builds, but no enhanced TikTok sorting/date receipts. The shares migration was applied through the existing Supabase SQL Editor in Chrome Hoang (hoangle27333-source), in project xfqwxehetbjofoaygeqj. SQL Editor and PostgREST read-back verified bigint/nullable shares. Configured SQL credentials still return authentication error 28P01, but this no longer blocks top collection. The schema gate remains in place for environments without the migration.

Local verification includes focused retrieval/ranking/schema tests, saved-evidence replay checks, the full suite, TypeScript checks and a frozen production build. Browser fixture acceptance exercises the actual topic/account forms, custom dates, threshold controls, two result groups, zero versus unknown metrics, original-language captions, mobile layout and reload. Fixture acceptance is not authenticated production acceptance.

Final local results: 545 tests across 66 files passed; full typecheck and Scout typecheck passed; frozen production build passed with no temporary QA route included. The shares migration passed embedded PostgreSQL idempotency/null/zero/negative checks. Evidence is saved in `artifacts/scout-top-posts/`.

Live acceptance after migration: authenticated local Chrome topic request created workflow session d5991f70-d799-40d9-8136-5ee52c8a5695; Instagram returned 17 observations and 4 qualified posts persisted (views unknown), actual cost $0.0243 within $0.25. Facebook topic session 6fe73fca-6365-47f8-b0df-73ad4948feca persisted 5 qualified posts with shares observed as 41, 0, 2, 23, 0; views were unknown; actual cost $0.249 within $0.25. TikTok KOL session 7c2fa551-0f5b-4d7e-a9fa-ef4c8e138b50 returned NOT_FOUND for the saved dokimphuc.football handle, failed transparently, persisted no posts, and cost $0. No replacement paid session was started for that handle. These samples prove persistence and honest missing-view grouping; they do not establish native top-views provider yield. Hosting has not been deployed.

A separate TikTok global-topic ranking probe (b6a64cb0-80d8-407b-a022-5cbb72dfc33a) was rejected by Apify with HTTP 402 / BILLING_REQUIRED before any paid run ID was issued, actual cost $0. Top collection now stops immediately on BILLING_REQUIRED, APPROVAL_REQUIRED or NOT_CONFIGURED for a platform, preserves the actionable code, and continues only other available platforms. No billing/subscription changes were made. The Facebook result was reopened in authenticated Chrome Hoang with all five original ranks and share counts visible; screenshot: artifacts/scout-top-posts/live-facebook-ui.png.

After the provider-restriction fix: 546 tests across 66 files passed, full typecheck and Scout typecheck passed, and git diff --check passed. Total actual cost of the four live acceptance sessions: $0.2733 (Instagram $0.0243, Facebook $0.249, both TikTok checks $0).
