# Review and approval audit — 2026-10-12

## Defects corrected

1. Import independently rejected every historical negative feedback row, even when a newer manual topic/location review superseded it. Approval and import now use the same scoped feedback precedence. Newer negative feedback still blocks import.
2. Type correction recomputed automatic evidence and then applied manual attributes without replaying current negative feedback. It now uses the shared reviewed assessment, preserving active exclusions consistently with approval/import.
3. Saving type correction discarded unsaved topic/location edits in the browser. Those drafts now remain until explicitly saved.
4. Import used candidates from the initial session read while using decisions from the later lease claim. It now takes candidates, criteria and decisions from the claimed snapshot, so intervening metric edits are enforced.
5. Live schema verification found that `scout_sessions` has no `updated_at` column, while review/type/attribute writes tried to use it. They now compare an opaque `progress.reviewRevision` value and write a new revision, using only existing JSON storage. This also removes the whole decisions JSON from the review query URL. Active import leases are checked before inserting feedback.

Manual review provenance is also carried into the CRM provenance JSON, with reviewer, time and history. Location review is visible separately from provider location observations.

## Verification

- 511 tests / 64 files passed; Scout typecheck and production build passed.
- Tests invoke the actual attribute-save and review API handlers, then the actual import function against an in-memory database. They cover an account with no topic keyword, manual confirmation, older rejection superseded, newer rejection enforced, CRM provenance read-back, unsaved confirmations blocked, batch approval and atomic failure for a mixed invalid batch, reject/pending/reapprove, and an audience edit between read and lease claim.
- Current and Experimental browser fixtures passed. Additional Experimental checks cover retaining topic/location drafts while saving type, rejecting an approved account, reload of rejection, return to review and reapproval.
- Existing audience range, reviewer access, ownership, imported-candidate, import lease and database-failure tests remain green.

Browser APIs were intercepted and API/import integration tests used a test double. A separate live Supabase storage test creates a temporary QA session, verifies review save/read-back, rejects a stale update, saves the next decision, and deletes the session. A read-only replay of the five latest saved previews found no assessment drift or stale approvals (all five currently have zero approvals). No paid providers/models, live CRM writes or changes to user review sessions were performed. The available Chrome profile was Le Minh Hoang; the requested Hoang profile was unavailable, so authenticated production review/import remains unverified.
