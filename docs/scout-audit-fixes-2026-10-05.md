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
