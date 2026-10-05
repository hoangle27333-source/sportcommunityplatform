# Facebook badminton discovery regression — 2026-10-05

## Confirmed cause

The reported session `aff513a2-6943-4141-a6de-ab85cc444799` requested five Facebook individual profiles for `badminton`, Nationwide. Apify run `5z3PuMs6V7wohOjF3`, dataset `f2HBmLM6guXWIL5Gb`, returned fifteen results. Each result carried the same `facebookUrl` search context (`https://www.facebook.com/search/top?q=badminton%20Vietnam`) and a distinct `url` pointing to its actual profile. The adapter prioritized `facebookUrl`, canonicalized it to `https://facebook.com/search/top`, and deduplication collapsed all fifteen accounts to the first result, Henry Badminton. The same invalid URL was persisted as the CRM profile link and scout identity.

## Changes

- Select an actual profile or group URL from provider output, rejecting search/navigation/root/post URLs. Facebook display names and handles cannot manufacture URLs.
- Validate profile URL and account identity again before import, including stale server snapshots.
- Preserve distinct account identities. Preview diagnostics expose requested, provider, unique, excluded and returned counts; shortfalls carry warnings instead of a misleading complete result.
- UI explains the maximum profile count, displays shortfalls including zero, and clears stale candidates. Import failures preserve review/selection; successful import closes/reset the modal.
- Constrain long Facebook IDs, URLs and native feedback selects on mobile; stack the footer actions.
- Preserve concurrent runtime work from the authorized Apify implementation chat. That chat owns adaptive retrieval, runtime migration, provider capability rollout and production build verification.

## Live data repair

Only KOL `069ecaf0-4aa4-4f97-9e09-352bf0c192af` was repaired. A guarded write changed its profile URL and scout identity from the invalid search page to the exact Henry profile URL in the original provider dataset. No other profile fields, manual locks, metrics, posts or review decisions were changed. The original row was backed up in `artifacts/badminton-discovery/henry-before.json` and the repair receipt in `henry-repaired.json`.

The updated dossier's header and channel links were verified in the real local application, again after reload. Opening the recorded URL on Facebook visibly showed Henry Badminton; its own links identified public account ID `61594904153618`. Historical discovery snapshots remain historical; invalid snapshots are blocked at import. The other four candidates must still undergo human review before CRM import.

## Verification and limits

- 51 tests passed across `src/lib/apify/discovery-quality.test.ts` and `src/lib/apify/scout.test.ts`. The fifteen-row fixture retains the reported provider's public names, URLs and bios. Regression exercises five distinct preview candidates, persisted snapshot, five explicit review imports, repeat import deduplication, invalid historical snapshot rejection and shortfall diagnostics. Database persistence in these tests is mocked.
- Browser replay uses the production modal with the recorded provider dataset and explicitly mocked API/database operations. Five different links were shown; selection requires explicit review; failed import kept five selections; successful import closed the modal; one/zero results displayed correct shortfall notices. Temporary fixture route was removed after QA; source retained as `artifacts/badminton-discovery/ui-fixture-page.txt`.
- Final mobile check at 390 × 844: document width 390; no overflowing divs. Desktop and mobile screenshots retained in `artifacts/badminton-discovery/`.
- `npm run typecheck` passed after removing stale generated declarations for the temporary QA route. Focused `git diff --check` passed for scout.ts and discovery-scout-modal.tsx.
- No new paid Apify run or additional CRM import was performed by this fix. Live REST reads and Henry repair succeeded. Direct PostgreSQL failed with ENOTFOUND. Runtime tables `scout_provider_runs` and `scout_provider_capabilities` were absent. User confirmed `20261005000000_apify_runtime.sql` has not been applied.
- Fresh discovery start → worker/provider → preview → human import → reload persistence remains blocked by the runtime migration/provider activation and must be checked after rollout. Browser replay and offline tests are not proof that this live flow passed. Production build belongs to the concurrent runtime task; avoid writing a build into an active dev server's `.next` directory.
