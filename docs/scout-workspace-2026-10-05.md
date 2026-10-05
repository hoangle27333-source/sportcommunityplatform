# Scout workspace implementation — 2026-10-05

## Delivered source

`/scout` presents three user needs: Find Profiles, Collect Content and Refresh Data. Activity is the server-owned task history. Directory, dossier, Dashboard, Trending and Analytics shortcuts use the same task launcher with their entity or batch context. Existing task endpoints remain behind adapters.

KOL and community post collection share one form. Connected channel URLs and verified provider capabilities determine platform availability. Advanced contains collection limits and additional options. Shared URL inspection fills add/edit/channel/post drafts, identifies destination conflicts, distinguishes public metadata from provider observations, and keeps missing metrics Unknown. New profile and channel provider provenance is validated against an owned completed inspection session before persistence.

Activity has ownership filtering, pagination, status filtering, readable subjects, warnings, counts and View Results. Discovery execution completion and remaining review/import are separate states. Stored candidates and imported IDs restore review. Polling, reopening results and reload use GET; only an explicit new start or retry creates a session. Local storage no longer determines which server tasks can be reopened. The progress panel links to Activity after navigation.

Tracked Accounts retain their Analytics destination and storage. Account creation no longer starts collection automatically. Refresh is explicit; batch failures report partial results. Comment collection has an explicit bounded sample and remains separate from the stored-evidence audience audit. Result screens offer appropriate next actions without triggering further collection. Project Recalculate Metrics remains outside Scout.

## Verification

- Full Vitest suite: 18 files / 230 tests passed, including session ownership, history fallback, import invariants, concurrent client sessions and inspection provenance.
- Production build passed with an isolated `NEXT_DIST_DIR=.next-scout-build` directory. Temporary build outputs were removed afterward.
- Typecheck passed after temporary fixture/type cleanup.
- Browser fixture suite passed: desktop/mobile layout, explicit discovery review/import, read-only result reload/review, KOL A/B platform reset, dialog keyboard focus/Escape, unavailable provider, original entity names, Unknown metric payloads and viewer gating. These tests mock API/auth/provider responses and do not establish live provider or CRM persistence behavior.
- Reproduction: start an isolated dev server; run `SCOUT_QA_PORT=<port> node --env-file=.env.local tooling/scout/verify-workspace-ui.mjs`. The script creates a unique temporary fixture route and removes it after testing. Screenshots are in `artifacts/scout-workspace/`.
- A final read-only REST check confirmed the target now has `scout_provider_capabilities`, `scout_budget_settings` with collections enabled, and session `progress`, `warnings`, `verification` columns. Multiple provider capabilities have immutable verified receipts. This supersedes the earlier missing-runtime observation during this implementation.
- Scoped source whitespace checks passed. Five pre-existing root page EOF whitespace warnings were preserved with unrelated changes.

## Remaining live acceptance

The later Chrome audit in profile `hoangle27333` reached authenticated Admin UI. It reproduced a blocking runtime defect: a changing retrieval window spawned four provider runs for one session, followed by budget exhaustion and zero persisted posts. Normal queue recovery also failed. See `docs/scout-chrome-audit-2026-10-05.md` and the live readback receipt; these reported defects are now fixed and retested in `docs/scout-audit-fixes-2026-10-05.md`; full all-flow acceptance remains incomplete.

Remaining live checks include concurrent tasks across close/reload, repeated discovery import, locked-field diffs, all failure states and budget exhaustion, comment evidence followed by audit refresh, and real admin/editor/viewer ownership behavior. No paid provider collection, production migration, commit, push or deploy was initiated by this workspace implementation. No UX or cost improvement is claimed as measured.
