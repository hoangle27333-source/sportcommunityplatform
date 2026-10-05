# Influencer Hub audit — 2026-10-04

Release assessment: not ready for final client acceptance. The implementation and migration exist, but two authorization issues and seven functional issues remain. This audit did not change product behavior or write test records to the live CRM.

## Confirmed findings

### F1 — P1: generic record writes bypass authentication and authorization

Sources: `src/app/api/sport-hub/record/route.ts:189`, `:204`, `:280–318`; `src/lib/supabase/middleware.ts:19`; GMV FK in `supabase/migrations/20261004000000_scout_quality_and_gmv.sql`.

POST/PUT/DELETE read the current user but do not reject absent users or viewers before using the service-role database client. The whole sport-hub API namespace is public in middleware. In particular, deleting a KOL through this API cascades into its monthly GMV, bypassing GMV's own API authorization and database RLS because the parent deletion uses service role.

Safe runtime probe: unauthenticated PUT with an unsupported type returned 400 “Unsupported update type”, rather than 401, demonstrating that the handler reached record dispatch. The new scout and GMV endpoints correctly returned 401 to the same caller. No actual record update/delete was attempted. The destructive path is confirmed by code inspection. This is an inherited endpoint defect, newly consequential to monthly GMV.

Correction: enforce authenticated editor/admin access consistently for record mutations, restrict deletion explicitly, and protect financial-history deletion at the parent operation. Do not rely only on the child-table RLS policy.

### F2 — P1: admin status differs between the application and GMV RLS

Source: `src/lib/auth/financial-sanitizer.ts:96–107`.

Two hardcoded email addresses receive effective admin status regardless of `profiles.role`. The GMV policy checks only `profiles.role = 'admin'`. If either account is demoted to editor/viewer, GMV server handlers still permit it and execute through service role, bypassing the intended demotion. Current profile-role counts show three admins; a demotion test was not performed on real users. This finding is based on the directly conflicting authorization rules.

Correction: one role authority for UI, API, workers and RLS; remove the email override or migrate those users to explicitly managed admin roles.

### F3 — P2: club mentions override an explicitly identified individual

Source: `src/lib/apify/discovery-quality.ts:15–17`.

Reproduced: entityType `person`, category `Digital creator`, biography “Athlete and coach, member of Hanoi running club Vietnam” becomes Community / Excluded for KOL discovery. The classifier evaluates any club/community token before person evidence. This can discard real KOLs and prevents reviewers correcting the excluded candidate, since exclusions are removed before the cards/feedback controls render.

Correction: separate entity identity from memberships/mentions; respect strong structured person evidence, and route conflicting evidence to Needs Review.

### F4 — P2: query geography is discarded; HCMC preset fails

Sources: `src/lib/apify/discovery-quality.ts:5–9`, `:18–24`.

Reproduced: “Sai Gon Run Club” with geography Nationwide accepts Hanoi Running Club as Matched. The normalized `hcm` token is removed from relevance without becoming a location requirement. Separately, the existing “Marathon Runner HCMC” preset excludes a marathon athlete whose profile explicitly says Ho Chi Minh City, because `hcmc` has no alias to `hcm`.

Correction: preserve location intent expressed in the query, distinguish it from topic tokens, and normalize HCMC/HCM/Saigon consistently. Resolve conflicts with explicit geographic scope visibly.

### F5 — P2: trending geography and sport are not verified

Sources: `src/lib/apify/scout.ts:191–207`; `src/lib/apify/providers.ts:13–22`.

Trending validates only hashtag/caption tokens. Instagram and TikTok plans do not use geography; no post/author location assessment follows retrieval. A global post carrying the exact tag can be stored under a Vietnam/city request without location evidence. The selected sport is assigned directly, also without checking content; the default Pickleball selection can tag running posts as Pickleball.

Correction: assess topic/location evidence after retrieval, separate requested scope from observed facts, and mark unknown location for review. Treat manual tagging explicitly rather than presenting it as verified sport classification.

### F6 — P2: Facebook story/watch links can masquerade as profiles

Source: `src/lib/apify/providers.ts:34–39`, `:46`, `:53`.

Reproduced: `parseProfile` returns a profile for `facebook.com/story.php?story_fbid=...&id=...` and `facebook.com/watch?v=...`, although `parsePost` recognizes those same URLs as posts. Discovery hydrates an author only when profile parsing fails, so these cases skip hydration. `description` can then become biography, and a post URL can be imported as the profile URL.

Correction: share a platform-specific URL-kind parser and reject every supported post URL form from profile parsing. Hydrate through the actual author profile URL before classification.

### F7 — P2: multi-platform post scouting uses only the primary profile URL

Source: `src/lib/apify/scout.ts:210–218`; platform selection in the KOL/community post scout modals.

The UI permits multiple platforms, but the server reuses `entity.profile_url` / `entity.group_url` for each platform. It does not resolve connected channel URLs. A creator with valid Instagram and Facebook channels fails the Facebook step when Instagram is primary, and the session fails before saving the collected posts.

Correction: resolve a verified URL for each requested platform from persisted channels; distinguish unsupported/missing channels from failures, and report any partial result explicitly.

### F8 — P2: zero saved posts are reported as the requested limit

Sources: `src/components/sport-hub/kol-post-scout-modal.tsx:93`; `src/components/sport-hub/community-post-scout-modal.tsx:87`.

Both use `result.insertedCount || limit`. With zero new posts (empty dataset or all duplicates), the server returns insertedCount 0 with no message, and the UI reports “Scouted 10 posts” for limit 10. This contradicts the requirement to report only records actually saved.

Correction: use the returned count, preserve zero with nullish fallback, and show a truthful empty/duplicate result.

### F9 — P2: manual community metric edits do not clear Unknown metadata

Sources: `src/app/api/sport-hub/record/route.ts:214`; `src/lib/sport-hub/service.ts:237`; `src/components/sport-hub/tabs/community-table-view.tsx:596`.

A scouted community with missing members stores `scout_missing_metrics = ['members']`. The ordinary edit handler updates `members_count` but never removes that marker. After an explicit manual correction, including a real zero, reload still displays Unknown. KOL edits already clear the corresponding metric markers; community edits do not.

Correction: clear only the explicitly edited community metric marker on a successful write, preserving missing markers for other fields.

## Verification performed

- Focused Vitest: 6 files, 75 tests pass.
- Typecheck: pass.
- Production build: pass.
- Desktop/mobile fixture browser checks: preview/review/confirm and monthly GMV UI pass, no page errors. Provider/auth/API responses in these checks are mocked.
- Live Supabase: Scout/Feedback/GMV schema reads return 200; anonymous reads of all three return 401 / PostgreSQL 42501.
- Local application unauthenticated scout and GMV GETs return 401. Generic record PUT reaches dispatch, as described in F1.
- Read-only regression probes reproduced F3, F4, F6 and the F8 zero-count expression. Run `npx tsx tooling/scout/audit-scout-cases.ts`; evidence is `artifacts/influencer-audit/regression-probes.json`.
- No live CRM records, GMV values or real user roles were changed. A temporary browser-fixture route was removed after testing.

## What remains unverified

- Fully authenticated live UI preview → import → reload and GMV save → reload.
- Live editor/viewer API and database denial checks; the current live profiles inspected all have admin role. Earlier isolated PostgreSQL RLS tests are not a substitute for this live proof.
- Live provider behavior was not rerun with paid actors during this audit. Earlier reports verify Instagram profile/direct hashtag and Facebook profile/Group responses; TikTok's last recorded result was HTTP 402.
- Concurrent import/polling, transient-failure recovery and larger-than-one-page CRM datasets are not covered by the current tests.
- The manually applied SQL does not record the migration in Supabase CLI migration history. Reconcile that history before a future CLI migration push; do not rerun the create-table migration against existing tables.

## Client feedback acceptance

| Request | Current assessment |
| --- | --- |
| Separate KOLs from groups/pages/brands | Implemented, but classification false exclusions and Facebook URL-kind errors remain. |
| More accurate run-club discovery | Token matching improved; query location intent is still lost. |
| Trending by hashtag | Exact-tag retrieval exists; scope verification and truthful zero-result notifications remain incomplete. |
| Monthly admin-only GMV | Schema/UI/import exist; inherited parent mutation access and conflicting admin rules need correction. Live save/reload remains unverified. |
| Improve with team feedback | Persisted replay exists and focused tests pass. It is controlled review reuse, not fine-tuning; excluded false negatives cannot currently be corrected in the review UI. |

Prioritize F1/F2, then F3–F8, then F9. Repeat acceptance checks with authenticated users only after these corrections.
