# Scout audit fixes — 2026-10-05

## Fixed findings

- **Paid input stability:** retrieval windows are persisted in server-owned session parameters using compare-and-set. The first window uses the session creation timestamp, and later watermark/clock changes cannot alter it. Each provider capability's immutable build is also pinned for the session. Client request schemas do not accept these snapshots. Regression tests cover clock movement, later watermarks, concurrent scopes and build changes while a run is pending.
- **Worker availability:** local `REDIS_URL` now points to the running local Redis. `npm run worker:scout` starts only the normal Scout worker and its recovery/billing reconciler, without other queue processors or new schedules. The normal UI producer/worker path was verified. Deployed environments must supply an external Redis URL; the silent hardcoded external fallback was removed.
- **Failure truthfulness:** entity-post and topic collection preserve typed all-platform failures. The executor saves Failed rather than Complete and returns the original HTTP/error code. Successful empty datasets remain valid zero results and are labeled No Results. Old single-platform all-failed receipts are normalized on reads without rewriting their evidence. Retry restores the original platform and limit; it requires an explicit new start. Failed/empty results do not suggest collecting comments.
- **Independent task choices:** Find Profiles, Collect Content and Refresh Data now each retain their own entity-type selection.
- **Resolved queue warnings:** worker claims and terminal outcomes remove the temporary queue-recovery warning. History hides that obsolete warning for historical tasks that are no longer queued, retaining real result warnings.
- **Metadata identity:** platform/login boilerplate is rejected as an entity name. The original name remains blank and the inspector explicitly asks for it. Original entity names remain unchanged; URL handles are only suggestions.
- **Typecheck:** the previously failing benchmark script already has its explicit MemorySample type from concurrent work; final validation uses that current source.

## Real Chrome verification

Chrome profile `hoangle27333`, authenticated Super Admin:

1. The original failed audit session now displays Failed, BUDGET_EXHAUSTED and Retry with These Criteria. Its stored original evidence remains intact.
2. Explicit retry restored Đỗ Kim Phúc, Instagram only and limit five.
3. The new task used the normal queue, survived closing the form and reload, and completed without the old queue warning.
4. Session `36ac56fd-290e-4f61-9d35-2dd74730183f` has exactly one provider run `ix884iPfs0mmFYQlF`, succeeded, observed cost USD 0, and a persisted fixed retrieval window/build. The dataset was empty, so counts are zero and Activity displays No Results. This is not proof of positive-result persistence.
5. Changing Find Profiles to Communities left the other two task choices at KOLs.
6. Inspecting the Nike Instagram link no longer filled the entity name with Instagram. The warning asks the user to enter the original name; metrics remain Unknown and no new profile was saved.

Receipt: `artifacts/scout-workspace/chrome-fixed-session.json`. The normal Scout worker remains running locally. No migration, commit, push or deployment was performed.

## Validation and limits

Full Vitest suite: 23 files / 250 tests passed. Production build and typecheck passed. Browser fixture suite passed with no page errors: independent card scopes, desktop/mobile, review/import, read-only results/reload, entity A/B reset, focus/Escape, unavailable provider, original names, Unknown metric saves and viewer gating.

Authenticated live checks above are scoped to the reported defects. The new provider returned no posts; successful nonempty CRM persistence, real viewer/editor account coverage, live mobile, two simultaneous real collections, tracked refresh and comments/audit chaining are not claimed as newly verified here. Existing targeted persistence/permission tests remain green. The previous four provider runs were not rerun or deleted; the normal billing reconciler settles their known charges.

## Completion button navigation repair

The completion dialog linked manual profile saves back to the same `/scout` URL, so View Results had no result destination. Session navigation also left the previous launcher mounted alongside the results dialog, causing competing modal focus and overlays.

- Completion links dismiss the previous dialog without replacing their destination URL.
- View Results uses the created record ID to open its KOL/community dossier; session tasks open their own persisted session results.
- Collect Posts carries the created profile ID and opens the configuration form without submitting a collection.
- Workspace URL changes clear incompatible dialog state; launcher identity includes subject IDs and URL. Session result components reset when the selected session changes. View Results also reopens the same session after review/import when the URL is unchanged.
- The browser fixture covers all three completion buttons, the saved dossier, a single dialog after session/next-task navigation, keyboard focus, reload without starting a task, desktop/mobile and viewer gating. Passed 16 browser checks with no page errors and mocked writes only. Three focused regression files / 12 tests passed.
- Native Chrome Hoang currently displays the signed-in profile as VIEWER; start/import controls are correctly disabled for that role. Live click verification was interrupted by concurrent changes to the browser window, so the completion click proof above is from the isolated browser fixture, not a new live save/provider run.

Final completion-button verification: production build passed after the final same-session fix; isolated QA server and generated build/type folders were cleaned up.

## Live Chrome verification after role correction

Chrome profile Hoang now loads ADMIN. An additional runtime failure was reproduced: `/_next/static/chunks/main-app.js`, layout JS and layout CSS returned 404, leaving SSR controls inert and Auth/Activity loading indefinitely. Restarted the local dev server with a fresh generated `.next` cache; retained the previous cache at `/tmp/sport-hub-next-before-scout-recovery-1791209389`. Main app JS now returns 200.

Verified with native Chrome UI against signed-in live data:
- Activity View Results opens the stored Collect Posts session `36ac56fd-290e-4f61-9d35-2dd74730183f` and shows No Results with zero persisted counts.
- Fetch Verified Details session `96e91e8a-7678-44b0-86ea-643657609e17` opens Nike observations. Reload restores the same results; Open Directory reaches `/kols` and removes the results dialog.
- Search Profiles, Add from Link, Collect Posts and Choose Accounts open the correct forms. Selecting Đỗ Kim Phúc enables Continue and fills the collection form with connected Instagram, Facebook and TikTok channels; provider checks finish and the collection button becomes enabled.
- The manual-save destination `/kols?recordId=afe0f2d8-f6ac-4d2c-9b1f-785ff44a28d1` opens Đỗ Kim Phúc's dossier. Its Collect Posts shortcut opens the same form; Escape returns to the dossier.
- No CRM save/import or provider collection was submitted during this verification. The completion-after-save buttons remain covered by the previous fixture checks; live verification exercised their real destinations and existing results.

Screenshot: `artifacts/scout-workspace/chrome-admin-results.png`.

## Multi-platform discovery and metric priority

Find Profiles uses platform checkboxes. The request accepts both legacy single-platform strings and unique platform arrays; one owned session holds the combined preview. Its profile limit applies across all selected platforms.

Discovery retrieves a bounded pool before truncating: three times the requested limit, capped at 60 per platform where the adapter supports expansion. It keeps relevance/type/exclusion checks, then orders observed followers or community members descending, followed by average views and engagement rate for ties. Missing values stay Unknown and follow known values, including observed zero. This ranking covers the retrieved pool, not the entire platform. No automatic collection follows import.

Partial platform failure retains successful results with platform warnings; all-platform failure preserves the failure code. Legacy preview reload and review/import remain compatible.

Validation: 143 Apify tests passed; production build passed in an isolated output directory. The fixture browser verified submitting Instagram and Facebook together and passed the existing completion/review/navigation checks without page errors. Native Chrome Hoang confirmed both checkboxes selected simultaneously; screenshot `artifacts/scout-workspace/chrome-multiplatform.png`. No paid live discovery or import was submitted in this validation.

## Stale worker repair after multi-platform rollout

Session `8757c06e-4d06-4ec1-838d-d1f8d22d88cc` persisted platform `["Instagram", "Facebook"]` but failed with `UNSUPPORTED / This platform is unavailable for scouting`. It created no provider runs. The dedicated worker had been running since 19:38, before the multi-platform implementation, with `tsx` in non-watch mode.

Stopped that worker gracefully and started the current implementation. `npm run worker:scout` now uses `tsx watch` for local development; `npm run worker:scout:start` retains non-watch execution for a fixed deployment. Verified Worker ready and automatic restart after a Scout module change. Failed sessions are preserved and are not automatically retried.

Added worker-executor regression coverage using persisted platform arrays, real discovery/adapters and mocked provider responses: per-platform execution, ranked result persistence and read-only reopening without new runs. All 144 Apify tests and typecheck passed. No new paid discovery or reset of the failed session was performed.

## Unconfirmed provider starts

Session `61868fc8-abdd-4ff9-b865-8e45e13b436e` has three `start-unknown` reservations with no provider IDs. Read-only Apify run lists for Instagram, Facebook and TikTok returned no corresponding new run. The historical transport exception was not saved, so its exact cause cannot be reconstructed. Reservations remain held; neither absence from a recent-run list nor a missing response proves a zero charge.

Start requests now wait up to 60 seconds; read requests retain the 15-second timeout. A returned run ID is persisted independently of initial dataset availability, and identity persistence gets a recovery write before polling. Unknown starts retain diagnostic warnings and stop additional platform starts. New sessions with the same Actor/input cannot bypass an unresolved reservation, even after a build change. Known provider rejections still retain their typed failures and settlement behavior.

Results show Needs Reconciliation and pause Retry for START_UNKNOWN, including historical sessions. Expected discovery failures show a toast rather than a developer-console overlay. 146 Apify tests passed; the browser fixture passed without page errors and verified unknown-start results cannot retry or launch another task. Native Chrome Hoang also showed the corrected reconciliation copy with Retry absent. No new paid run, budget release or fabricated provider identity was used to repair the historical session.

## Reconciliation implementation and live recovery

The preceding fix left the old reservation unresolved. Added owner/editor-gated `POST /api/sport-hub/scout/reconcile` and Check Provider Status. It reads Apify's descending Actor-run list, requires a complete start-time window, a five-minute grace period and history less than one day old, and releases a reservation only if no run of that Actor exists in the window. Any possible run, incomplete pagination or provider error leaves the hold intact; it never adopts a run by name/input or starts another run. Zero settlement includes a persisted reconciliation receipt. Blocked retry sessions with no own runs can recover after the original reservation is resolved.

Live reconciliation of `61868fc8-abdd-4ff9-b865-8e45e13b436e` confirmed no corresponding Actor launches for all three platforms; settled the three reservations at zero as `rejected:START_NOT_CREATED`. Receipt: `artifacts/scout-workspace/start-reconciliation-receipt.json`. Chrome was showing blocked retry `cfce2c9a-ceb0-4ba0-8e85-de379f6ffbcb`, not the original session. Check Provider Status cleared that dependent blockage and restored Retry.

Retry now preserves all selected platforms while capabilities load. A new explicit Chrome submission using the original query, three platforms and five-result limit created session `bf1ea6ee-e654-473b-adef-9c96b79aa2ed`. Its Instagram start returned provider ID `cn997EqBQpf2eb2ZU` and succeeded. Remaining runtime verification is recorded below once all selected adapters finish.

154 Apify tests passed, including ownership, grace/retention bounds, incomplete history, possible-run holds, unavailable provider, budget release and dependent retry recovery. The browser fixture passed reconciliation → Retry → restored multi-platform form without auto-starting a collection, alongside existing workspace checks, with no page errors.

Live closure: the new session completed, returned and persisted five candidates from 59 provider results (15 excluded), with follower counts 300,000, 290,800, 269,500, 81,300 and 74,400. All four underlying runs (Instagram, two Facebook adapters, TikTok) succeeded. One Instagram item was unavailable, so the result correctly remains Completed with Warnings. Native Chrome reload reopened the same stored result and Review Profiles recovered all five candidates; the ledger still had four provider runs afterward. No profile import/approval was performed. Evidence: `artifacts/scout-workspace/recovered-discovery-receipt.json` and `chrome-recovered-discovery.png`. Production build and typecheck passed.

## Discovery minimum target — 2026-10-06

- `limit` remains the compatible request field, now interpreted as a minimum target for discovery. Return and persist every unique eligible profile from the bounded provider pool, ordered by observed metrics; do not truncate the combined preview. Existing relevance, identity, feedback and entity-type exclusions remain. Shortfalls are reported, not guaranteed away by unbounded paid collection.
- UI uses Minimum Candidate Profiles and explains that results may exceed the target or fall short under provider/budget constraints.
- Read-only inspection of existing Facebook runs `iqtoGFhFB2Yu9XgRo` and `uTVrmVGDNcomkbZkV` confirmed 15 rows each and no audience metrics fields: profile search exposes bio, page search exposes description. Missing followers/views/ER remain Unknown. No automatic paid enrichment added.
- Existing completed previews retain their saved snapshots; this change applies to new discovery previews.
- Validation: 154 Apify tests, typecheck, production build passed (initial transient Google font failure, retry succeeded). Chrome Hoang authenticated form verified minimum target and multiple platform selection; screenshot `artifacts/scout-workspace/chrome-minimum-profiles.png`. No new paid provider collection or CRM imports performed for this change.

## Unavailable item warning — 2026-10-06

- Existing Instagram run `cn997EqBQpf2eb2ZU` contains one error row for `ym.badminton`: `not_found`, `Profile does not exist`. This is a skipped provider item, not a failed session.
- New runtime warnings include platform, validated handle and a controlled English reason; arbitrary upstream descriptions are not shown. Valid items remain available.
- Legacy result reads derive an explanation from saved provider rows after session ownership checks. They preserve candidate IDs, review/import state and snapshots, and start no provider runs. Activity uses a clear fallback for historic generic warnings.
- Chrome Hoang verified View Results shows the contextual warning, Found 5 and Excluded 15 for the existing snapshot. Screenshot: `artifacts/scout-workspace/chrome-provider-warning-explained.png`.
- Regression: 159 Apify tests and typecheck passed; frozen production build receipt stored under `artifacts/scout-warning-fix`.

## Result list and imported history — 2026-10-06

- Latest persisted non-verification session remains `bf1ea6ee-e654-473b-adef-9c96b79aa2ed`: 5 found, 15 excluded by discovery checks, all 5 imported. Excluded count is not an approval queue.
- View Results now lists every saved candidate with original name, profile link, platform, observed audience or Unknown and explicit Pending Review / Approved / Rejected / Imported state. Imported history remains visible. All-imported sessions explain completion and do not open an empty review form.
- Authenticated Chrome Hoang verified all five imported rows and corrected Excluded by Checks label; screenshot `artifacts/scout-workspace/chrome-saved-profile-list.png`.
- Fixture browser verified 15 visible rows, Pending (15) review, all 15 imported rows surviving reload, original approval/import boundaries, viewer gating and no read-triggered provider starts. No page errors. This 15-profile case is fixture proof, not a new paid run.

## Facebook followers collection — 2026-10-06

- Root cause: Facebook discovery only fetched search results, whose observed output lacks audience counts. Details parsing also omitted pageUrl/pageName/intro; the runtime numeric contract omitted followers and pageUrl identity support.
- Discovery now fetches detail observations for eligible non-group Facebook profiles missing followers in batches of up to 10, governed by the existing verified-batch capability, durable provider runs and budget reservation policy. Observed counts are matched to the requested identity, used for ordering and persisted in preview/import. Existing follower observations, including zero, need no extra detail run.
- Details budget/access failures retain the search profile and report Unknown. Pending and ambiguous-start outcomes stop/resume through existing session semantics; never silently start another paid run. Likes are never substituted for followers. Existing snapshots are not automatically enriched on read.
- New live verification session `fe5d1fba-feae-452f-ad39-9d9b1134785a` collected `https://facebook.com/oneba.vn`: 3,396 followers, matching raw provider output; run `63YUVsKvqZa48WJVf`, succeeded, actual USD 0.012. Result persisted with provenance; no CRM import. Receipt: `artifacts/facebook-followers/live-receipt.json`. Preliminary build-check session `05784a15-c8f9-4a28-82e8-e53b9b8716ac` failed before any provider reservation because verificationBuild was missing; it made no paid start.
- Validation: 169 Apify tests, including audience identity matching, unknown vs likes/zero, budget preservation, ambiguous-start stop and preview-to-CRM followers persistence. Typecheck and frozen production build receipts under `artifacts/facebook-followers`.
- Provider schema reference: https://apify.com/apify/facebook-pages-scraper (observed October 6, 2026).

## Content task 377e209d recovery — 2026-10-06

- Session `377e209d-7798-48ec-92b7-29706e40c077` searched Badminton Vietnam, selected Ho Chi Minh City and returned zero saved posts despite provider evidence. Root causes: Group permalink URLs rejected, Facebook time/epoch fields not normalized, all English query tokens required verbatim, caption location ignored, TikTok locationMeta ignored, skipped results not visible.
- Content matching now recognizes Vietnamese badminton topic evidence, separates query geography from topic words, uses observed caption/provider city evidence, normalizes publication time and recognizes Facebook Group post identities. Missing location/date remain unverified; conflicting city/old dates remain excluded. No event-date inference.
- Saved-evidence replay bypasses provider dispatch, preserving the session retrieval window. Reprocessed this exact session from two stored succeeded runs with compare-and-set session persistence: inserted 1, excluded 2, unverified 2, failed 0. The saved Facebook Vietnam Open post has observed publication date September 8, 2026 and explicit Ho Chi Minh City caption. No new provider runs; original two run IDs remain.
- UI lists Saved Posts first and all Posts Not Saved with original captions, links, platform and controlled exclusion/verification reason. Unverified items are not silently inserted into Trending Posts.
- Authenticated Chrome Hoang verified result and reload; screenshot `artifacts/scout-content-recovery/chrome-recovered-content.png`. Before snapshot and recovery receipt in the same artifact directory.
- Validation: 174 Apify tests, typecheck and frozen production build passed. Tests cover real-shaped Group URLs, epoch/time fields, localized topic/location matching, missing evidence, date cutoff and saved replay with zero provider calls.

## High engagement content selection — 2026-10-06

Audit of the latest real topic session `377e209d-7798-48ec-92b7-29706e40c077` found the saved Facebook post had 12 reactions; the two TikTok observations had 64 likes/659 views and 43 likes/2,474 views. The old path checked topic, geography and dates but did not qualify engagement, and selected in provider/round-robin order. Evidence: `artifacts/scout-engagement/current-task-audit.json` (read-only provider receipts, no new paid runs).

New API tasks and Find Content default to High Engagement: publication within seven days, at least 100 observed likes/reactions + comments OR 10,000 views. These are editable selection thresholds, not measured growth or universal virality standards. Rank by observed interactions, views, then publication time, across platforms. Request a bounded candidate pool of three times the requested saved count, capped at 60 total, with existing provider budget safeguards. Never substitute weak posts to fill the requested count; report shortfall and retain skipped observations with reasons. Unknown counts do not become zero. All Topic Matches remains an explicit option; legacy persisted tasks without qualityMode retain their original behavior. Saved tasks display their applied quality criteria. Existing CRM posts and historical sessions were not rewritten or deleted.

Regression coverage includes threshold boundaries, custom criteria, missing versus zero metrics, ranking, rejected old/weak posts, shortfalls, bounded pool size and stable resume cutoff. Live fresh-provider quality is not yet accepted by this audit: reusing a stored dataset verifies the evidence filters without claiming that the provider will return enough strong candidates.

Validation for this change: 179 Apify tests, typecheck, and frozen-source production build passed. A focused browser fixture passed engagement/recency defaults, topic-mode switching, desktop/mobile layout and Escape, with zero provider starts and no page errors. The broader workspace fixture stopped at its stale `Pending (1)` selector after the separately changed profile-review UI; it is not counted as a full regression pass. Screenshots are under `artifacts/scout-engagement/`.
