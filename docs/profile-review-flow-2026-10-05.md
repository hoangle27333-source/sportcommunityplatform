# Profile review flow — 2026-10-05

Review Profiles now distinguishes a human decision from provider assessment and CRM import.

1. Open a completed discovery preview from Scout Activity.
2. Pending profiles expose Approve for Import and Reject. Needs Review profiles require separate confirmations for entity type, topic relevance and target location.
3. Approval is saved immediately and selects the profile for import. Pending, Approved and Rejected tabs reflect saved decisions. Return to Review reverses the decision for an unimported profile.
4. A footer outside the scroll region always shows pending/approved counts and Import Approved Profiles. Approval grants permission to import; new CRM profiles still use New Scout (Unverified).
5. Reopening a preview restores saved approval/rejection decisions and excludes imported profiles. Negative Scout feedback remains separate from rejection for the current preview.

## Persistence and access

POST /api/sport-hub/scout/review uses existing scout_sessions.review_decisions. It requires editor/admin access and session ownership, validates candidate membership and completed preview status, blocks already imported candidates, and compares the prior JSON snapshot before updating. Review writes are blocked while an import lease is active. Import reads the current decisions after acquiring its lease and rejects profiles with saved rejected or pending decisions. No schema migration is required.

## Verification

- 219 Vitest tests passed across 28 files, including persisted review, required verification, ownership, viewer gating, conflict/write failure and rejected-profile import prevention.
- Source typecheck passed using an isolated config. The stock broad typecheck encountered stale generated types in the concurrent .next-scout-multiplatform-qa fixture cache. A frozen-source production build passed; the QA build script now copies the actual postcss.config.cjs so Tailwind styling is included.
- CUA browser fixture: approval enables import without another selection click; rejection and approval survive fixture reload; imported candidates are excluded. Styled desktop/mobile checks verified the footer remains visible and mobile has no horizontal overflow. Screenshots: artifacts/profile-review/desktop-approved.jpg and mobile-approved.jpg.
- The browser fixture mocks API persistence. Authenticated database saves/reloads and live provider discovery have not been verified in this pass.

For isolated UI reproduction, temporarily copy tooling/scout/fixtures/profile-review-page.tsx to src/app/templates/profile-review-qa/page.tsx, open /templates/profile-review-qa on the local dev server, then remove the temporary route. This fixture sends no provider or CRM writes.
