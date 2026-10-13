# Scout Post workspaces: implementation and verification

Date: 2026-10-13

## Delivered

- Backend batch planning/start with saved KOL/community channel snapshots, one session budget, per-account checkpoints/progress, partial failures and reload recovery.
- Shared post storage with row-locked source union, normalized author identity, separate author/group links and account/topic/legacy projections.
- Saved-evidence Suggested Account previews with manual edits, explicit approval/import, concurrent existing-account checks and independent idempotent post-link retry.
- Antigravity's two-tab frontend integrated with the API. Codex corrected batch launch/polling, Activity reopening, supported quality rule, local dates, optional batch budget, unsaved review edits, partial-link reporting, empty responses, suggestion access, viewer launch controls and mobile header wrapping.
- API request handoff and browser-safe DTO types, plus mock response fixtures.

## Evidence

- `npm test`: 76 files, 599 tests passed. Includes account batch selection/planning/execution, exact secondary-channel identity, group/author separation, unknown metrics, approval/import/link retry and account-isolated Top Post round checkpoints.
- `npm run scout:typecheck`: passed after removing the temporary browser QA route.
- `node tooling/scout/verify-production-build.mjs --artifact-dir=artifacts/scout-post-workspaces`: frozen-source production build; receipt and source hashes recorded in the artifact directory.
- `node tooling/scout/verify-post-workspace-migration.mjs`: passed on a temporary isolated PostgreSQL 18 container. Checks migration reruns, provenance backfill, legacy preservation, concurrent row-locked writes retaining both sources, duplicate-source idempotency, author conflicts and denied authenticated direct RPC access. The temporary container was removed.
- `node tooling/scout/verify-post-workspaces-ui.mjs`: mounted actual React components in Chromium with intercepted APIs. Verified selecting 21 accounts across two pages, one POST for launch/reload, immediate 202 progress, failed-session termination, Asia/Ho_Chi_Minh custom dates, saved edits before approval, partial import and independent link retry, successful empty response clearing stale posts, mobile render and disabled viewer launch controls. No JavaScript page errors, provider starts or application database writes.
- UI receipt: `artifacts/scout-post-workspaces/ui-receipt.json`. Screenshots: `posts-mobile.png`, `batch-failed-desktop.png` in the same directory. QA-only controls visible at the screenshot top are not production UI.
- `git diff --check`: passed. Temporary routes, QA server/cache and the QA-added TypeScript include were removed after verification.

## Required before live use

Apply `supabase/migrations/20261013030000_scout_post_workspaces.sql` to the target database before serving the new content collection paths. The new endpoints fail with `POST_WORKSPACE_SCHEMA_UNAVAILABLE` when their schema is missing. Earlier content settings/Top Posts migrations are prerequisites.

This work did not apply the migration to the application's live database, deploy code, or start paid providers. Authenticated end-to-end verification against the migrated target database and fresh provider execution remain unverified. Browser fixtures prove UI/API behavior under the stated responses, not live provider coverage or production persistence.

The repository changed concurrently during implementation; unrelated frontend and pre-existing changes were preserved. No commit, push or deployment was performed by Codex for this task.

## Reproduce browser QA

Start a separate dev server on port 3049 with an isolated `NEXT_DIST_DIR`, then run `node tooling/scout/verify-post-workspaces-ui.mjs`. Set `SCOUT_QA_PORT` for another port and `SCOUT_PLAYWRIGHT_MODULE` if the bundled Playwright package lives elsewhere. The script creates and removes a temporary route under `src/app/templates`. Do not run typecheck concurrently with temporary route creation/removal. Next may add the QA build directory to `tsconfig.json`; remove only that generated include when stopping the QA server.
