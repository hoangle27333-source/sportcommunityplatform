# Scout audit in Chrome hoangle27333 — 2026-10-05

## Outcome

This is the original audit receipt. Its reported defects were subsequently fixed; see `scout-audit-fixes-2026-10-05.md` for the new checks and remaining acceptance limits.

Live acceptance fails. Audit used the native Chrome window whose profile menu showed `hoangle27333@gmail.com`; the app was authenticated as Super Admin. The bounded test requested five Instagram posts for Đỗ Kim Phúc through `/scout`.

Session: `0030c099-4b7f-4b65-826e-aeae7ee8d2c7`. Closing the task and reloading retained it in Activity. The configured production queue did not recover automatically. A temporary isolated local Redis worker processed only this supplied session with the actual `executeSession` executor. No new session was created for recovery, and no unrelated sessions were reconciled. The session finished with zero inserted/refreshed posts and one failed platform: `Instagram: Scout budget exhausted.`

Read-only Apify confirmation found four SUCCEEDED runs for this one session, each reporting `usageTotalUsd=0.0027`, total USD 0.0108. The database still marked them running with null actual cost. No further paid collection was initiated after this finding. The queue runner was closed; local Redis and the existing app server were left running.

## Findings

1. **P0 — Polling creates new paid runs.** `src/lib/apify/collection.ts:8` recomputes the first retrieval window from `Date.now()` whenever no watermark exists. `scoutEntityPosts` calls it again during each worker poll (`scout.ts:289`). `runtime.ts:70` hashes the resulting provider input to find the existing run. The four persisted inputs have distinct `onlyPostsNewerThan` timestamps: `12:22:52.888`, `12:23:02.785`, `12:23:17.457`, `12:23:36.428` on 2026-09-05. Consequently each poll misses the prior run and reserves/starts another. Persist the session's retrieval window once, retain its provider input/build, and reuse them on every poll. Regress the no-watermark case across clock movement and concurrent workers.
2. **P1 — Normal queue path is unavailable.** The UI session remained Queued with `Waiting for the worker queue to recover.` No normal social-scout worker was running; the configured Redis path could not enqueue. Only isolated local worker recovery moved the session forward. Validate producer and production worker against the same reachable Redis before acceptance; an isolated worker is not proof of operational recovery.
3. **P1 — All-platform failure is reported as completion.** `scout.ts:318` returns `success:true` even when every requested platform fails. Session status becomes complete, and the UI displays Completed with Warnings with no Retry action because retry is restricted to failed sessions. Distinguish all-failed from partial success and genuine zero results, preserve typed budget/provider errors, and provide deliberate retry after resolution.
4. **P2 — All three cards share entity type.** Changing Find Profiles from KOLs to Communities also changed Collect Content and Refresh Data. This is visible behavior backed by the single `entityType` state in `scout-workspace.ts:19`. Keep a separate choice per need, or expose one clearly labeled global scope if shared scope is intentional.
5. **P2 — Queue warning remains after recovery/completion.** Activity still showed the queue recovery warning after the isolated worker reached Running and Complete. The session's persisted warning was never cleared; `sessionSummary` combines it with result warnings. Treat temporary infrastructure warnings as current execution state, clearing/resolving them when a worker claims or completes the task.
6. **P2 — Metadata can fill platform boilerplate as an entity name.** Inspecting `https://www.instagram.com/nike/` returned the draft name `Instagram`. Metrics and tier stayed Unknown and no save occurred, but the name field looked like a usable identity. Reject generic platform/login boilerplate names and preserve an empty or explicitly provisional handle-based draft requiring review.

## Verified in the real Chrome profile

- Authenticated Admin access to `/scout` and durable owned Activity.
- Open and reload the same saved Discovery session (`aff513a2-6943-4141-a6de-ab85cc444799`), then reopen review without a new collection.
- Explicit candidate checkbox and disabled import until selection/review. The legacy preview includes `facebook.com/search/top`; current source import validation rejects this URL, so it was not imported during audit.
- Saved entity selection preserves the original name Đỗ Kim Phúc and derives connected Instagram/Facebook/TikTok choices. Unsupported TikTok shows a provider-policy reason and stays disabled.
- Advanced collection limit accepts five and one selected platform.
- Close/reload of the running task retains its session and later displays its stored result.
- A post URL in the community form produces a destination mismatch and blocks inspection.
- Free metadata inspection fills only a draft, leaves metrics Unknown, and sets New Scout (Unverified). No profile/community was saved by this audit.

## Checks and evidence

- Rerun Vitest: 19 files / 232 tests passed. The initial typecheck rerun passed. The final rerun is blocked by new errors in the concurrently added `tooling/scout/summarize-memory-verification.ts:6,15` (`samples` implicit any); no errors were reported in the two audit scripts.
- `artifacts/scout-workspace/chrome-live-session.json`: executor receipt; isolated queue limitations explicitly recorded.
- `artifacts/scout-workspace/chrome-live-readback.json`: persisted input hashes/windows, provider run states/costs and session outcome.
- `tooling/scout/audit-owned-session.ts`: exact supplied-session recovery runner; use only deliberately for a bounded audit session, not as a production worker replacement.
- `tooling/scout/read-ui-audit-receipt.ts`: read-only provider/session evidence retrieval.

This is not full acceptance: successful content persistence, two simultaneous tasks, discovery import deduplication, locked-field diffs, real viewer/editor sessions, Tracked Account refresh, comment persistence/audit refresh and live mobile behavior remain unverified. Further paid tests should wait until input stability and failure semantics are fixed. No source fix, migration, push or deployment was performed during this audit.
