# Frontend implementation request: Account Posts and Trending Posts

## Assignment

Implement the UI/UX and frontend for the approved Scout Post split in:

`/Users/Apple/Documents/Vibe Code/Sport Booking Platform`

Antigravity owns frontend design and implementation. Codex owns backend/API, migrations, provider execution, storage, identity matching, and final integration verification. Backend code is implemented locally; the new database migration must be applied before live use. Use the contract below and shared types, and report a contract discrepancy instead of changing backend behavior yourself. The user will send this request to Antigravity manually.

Choose the layout and interaction design using the existing design system. This request defines behavior, data, states, and acceptance; it does not prescribe layout. Preserve all existing dirty tracked/untracked changes. Do not reset files, commit, push, deploy, run migrations, or start paid provider runs.

## Product behavior

Keep `/trending` as the URL and change its displayed name to **Posts**. Provide two independently usable tabs:

### Account Posts

- Show saved posts linked to a database KOL/Creator or Community/Club. Include posts discovered through topic search when their author or containing community matches a saved account.
- Provide a dedicated **Scout Account Posts** flow. The account picker includes KOLs/Creators and Communities/Clubs and their saved channels; exclude the separate Tracked Accounts list.
- Support account search and filters for entity type, sport and platform. Select individual accounts, multiple accounts, or **Select All Matching Accounts** across all pages of the current filtered set. Show the exact selected count; offer clear selection reset and per-account/channel deselection.
- Distinguish selection across pages from the visible page. Accounts added after a run starts do not join that run.
- Display original account names and their connected channels. Unsupported/unverified channels remain visible with a reason, and cannot be selected for execution.
- Default to **Latest Posts**, last 7 days, up to 10 posts per account across selected channels. Allow changing the time window (up to 30 days), limit (1–50/account), optional quality filter, and **Top Posts** mode. Default engagement filtering is off for this flow.
- Review eligible accounts, selected channels, time window, limits and one total batch budget before the user explicitly selects **Start Scout**.
- Follow progress per account, partial failures and persisted results. Users can close the form or reload and reopen the same durable session. Never restart collection merely because the page reloads.

### Trending Posts

- Provide a separate **Scout Trending Posts** entry point using the existing topic/keyword/hashtag collection behavior, filters and ranking. Preserve current Top Posts and content settings work.
- Show whether the publishing account already exists in the database, needs review, or has an unresolved identity.
- Display **Suggested Accounts**, grouped by author identity, with original name, platform, actual profile URL, related saved posts, post count and **Review Account** action.
- Opening Review Account uses saved evidence. Do not automatically start paid profile verification or import.
- User selects the CRM destination (KOL/Creator or Community/Club), reviews/edits details, explicitly confirms account type/relevance/location, approves, then imports using the existing review pipeline.
- If the user chooses optional profile verification, make the provider action explicit and resume its session rather than starting it again.
- After import, refresh suggestions and both post tabs. Existing posts are linked to the imported account; a post may appear in both tabs while retaining the same ID.
- If identity is missing or conflicting, display **Needs Verification**. Do not match by similar names, infer followers from post metrics, or treat group members as followers.

### Other entry points

- In `/scout`, separate the content entry points into **Scout Account Posts** and **Scout Trending Posts**. Keep Find Profiles, Refresh Data, Activity, Add Post Link and profile/community dossier entry points.
- Existing single-account URLs and actions continue to work. A single-account action can preselect that account in the dedicated flow.
- Preserve access controls: viewers can read permitted posts/activity; editors/admins can launch tasks, review, import and retry linking. Use the current auth context and handle server denials.
- Legacy posts whose source cannot be established remain accessible through **Legacy / Unknown Source**. Do not hide them or label every legacy record as trending.

## Shared contract

Read the current implementation of these contract modules before wiring:

- `src/lib/apify/post-contracts.ts`: browser-safe metadata and Suggested Account types.
- `src/lib/apify/account-posts.ts`: backend request/plan contracts; do not import this server module into browser code.
- `src/lib/apify/scout-workspace.ts`: durable session summaries.

Frontend-only sample responses are available in `docs/scout-post-workspaces-fixture.json`. Mock these responses; never submit fixture IDs/URLs to live collection endpoints. Integration corrections from the frontend source review are recorded in `docs/ANTIGRAVITY_SCOUT_POSTS_INTEGRATION_FIXES.md`.

### Account selection

`GET /api/sport-hub/scout/accounts` returns all saved KOL/community picker records with channels and availability. Apply search/filter/pagination to this complete set so Select All Matching Accounts is correct. Existing `/api/sport-hub/data` still returns CRM entities.

### Plan and start batch

`POST /api/sport-hub/scout/plan`:

```json
{
  "kind": "account-posts",
  "accounts": [
    {"entityType": "kol", "id": "00000000-0000-4000-8000-000000000001", "channelUrls": ["https://www.tiktok.com/@example"]},
    {"entityType": "community", "id": "00000000-0000-4000-8000-000000000002"}
  ],
  "mode": "latest",
  "recentDays": 7,
  "limitPerAccount": 10,
  "qualityFilter": {"enabled": false, "minViews": 1000, "minInteractions": 50, "metricRule": "views-first", "policyVersion": 1},
  "maxSessionUsd": 1
}
```

IDs/URLs above are placeholders, not valid live test targets. Omitting `channelUrls` selects the saved account's eligible channels; explicit channel URLs must belong to that account. For a custom window, send both `publishedFrom` and `publishedTo` as UTC ISO timestamps instead of relying on `recentDays`. Display dates clearly in the user's local time.

The plan response is `{success:true, plan}`. The batch plan includes `kind`, `version`, `hash`, normalized `criteria`, eligible `accounts`, `skipped` channel/account reasons, `accountCount`, `channelCount`, `maxSessionUsd` and `allowedMaxSessionUsd`. Review this server plan; do not estimate costs by multiplying the total cap by the account count.

Start with `POST /api/sport-hub/scout/account-posts`, sending the same criteria and `planHash: plan.hash`, plus optional `uiContext:{source:"/trending"}`. Account selection is bounded to 1,000 unique accounts/request; explain that limit if reached. Do not silently truncate a selection.

Use raw `fetch` for the dedicated batch launch to receive HTTP 202 immediately and display progress. The existing `scoutFetch` helper waits/polls until completion internally, so it cannot be used for an immediate pending response. A pending response is HTTP 202 with `{success:true,pending:true,sessionId,status,progress,warnings}`. Resume via `GET /api/sport-hub/scout?sessionId=...`; activity detail via `/api/sport-hub/scout/sessions?sessionId=...`. Completed responses include `status:'complete'`; failed responses include `status:'failed'`, `success:false` and a non-2xx status. Handle failed receipts before the `res.ok && data.success` branch.

Progress includes `stage`, `totalAccounts`, `completedAccounts`, `accountResults` and `skippedChannels`. Each account result includes `entityType`, `id`, `name`, `status: complete|failed|skipped`, saved `posts`, `counts`, `warnings`, optional `code`, `error` and `partial`. Final results include unique `posts`, account results, counts, warnings and stop reason. Completed accounts can have zero posts; show that truthfully.

### Post data and suggestions

`GET /api/sport-hub/scout/posts?workspace=account|topic|legacy` returns `{success,posts,suggestedAccounts}`. These are read-only endpoints. `/api/sport-hub/data` also exposes the new metadata on each existing Post DTO.

Post metadata:

```ts
{
  authorIdentity: string | null;
  authorProfileUrl: string | null;
  collectionSources: Array<{kind:'account'|'topic'; sessionId?:string; keyword?:string; entityType?:'kol'|'community'; entityId?:string; channelUrl?:string}>;
  accountLinks: Array<{entityType:'kol'|'community'; id:string; role:'author'|'group'}>;
  workspaces: Array<'account'|'topic'|'legacy'>;
  accountSuggestionState: 'existing'|'suggested'|'needs-verification';
}
```

Preserve the distinction between `role:'author'` and `role:'group'`: membership in a Facebook group does not make the group the author. Display metric unknowns using `missingMetrics`, not numeric fallback zero. Use original captions and names.

`GET /api/sport-hub/scout/suggested-accounts` returns grouped suggestions with `identity`, `platform`, `name`, `profileUrl`, `postIds`, `postCount`, `suggestedEntityType:null` and `reviewState:'Needs Review'`. The user chooses destination; the frontend does not auto-classify authors.

`POST /api/sport-hub/scout/suggested-accounts` creates a saved-evidence review preview:

```json
{"identity":"TikTok:https://www.tiktok.com/@example","entityType":"kol","keyword":"Pickleball","geography":"Any location"}
```

Response supplies `sessionId`, candidates and criteria, compatible with existing review/import. Optional `verificationSessionId` can reuse a completed, user-owned inspect session for the exact profile. Creating a review preview does not launch providers. Optional `name`/`bio` are manual edits; record them without representing them as provider facts.

`PATCH /api/sport-hub/scout/suggested-accounts` edits a suggestion preview using `{sessionId,candidateId,name?,bio?,geography?}` and returns the updated candidate; prior approval is invalidated. Do not drop unsaved edits during errors or conflicts.

Approve via existing `POST /api/sport-hub/scout/review`; import via `POST /api/sport-hub/scout` with `action:'confirm'`, `sessionId`, and selected candidate IDs. Preserve all existing review guards. Account status after import remains **New Scout (Unverified)**. Import returns `importedAccounts:[{entityType,id}]`, `importedIds:[id]` and, for suggestion imports, `postLinkResults`. `success:true` with `partial:true` means the account can be imported even if linking needs retry; inspect `postLinkResults` and display that accurately.

If post linking fails after successful import, offer **Retry Linking** via `POST /api/sport-hub/scout/post-links` with `{entityType,id}`. This action does not scrape or charge provider usage. Refresh the post list afterwards.

## Required states and errors

- Loading account data/plan, empty database, no matching accounts, no eligible channels, no results, unknown metrics and legacy source.
- Pending/running, completed with zero posts, partial success, failed account, failed batch, skipped account/channel, total budget exhausted and time limit reached.
- `PLAN_STALE`: preserve selections/settings and request a new plan for user review; do not auto-start it.
- `POST_WORKSPACE_SCHEMA_UNAVAILABLE`: explain that the backend migration is required; do not launch another task.
- `REVIEW_STALE`, import in progress, approval missing, duplicate account detected, unresolved identity and post-link conflict: retain edits and refresh/reopen appropriate data.
- HTTP 401/403 access errors, transient connectivity and delayed dispatch. Keep the durable session ID available.

## Language, formatting and accessibility

Follow AGENTS.md: English system/UI copy; `t()` for dynamic system labels; preserve original names/captions/user notes; numbers in `en-US`. Use the existing light UI. Support keyboard navigation, accessible control names, focus management, selection state announcements, responsive tables/cards and readable status messaging. Antigravity owns the design choices.

## Acceptance and delivery

1. Both tabs and scout entry points are clearly separate and can be used independently.
2. Select All Matching Accounts selects the entire filtered set across pages, with accurate counts and channel exclusions.
3. One reviewed total budget applies to a batch; the UI does not create one independent paid session per account.
4. Account A succeeding and Account B failing preserves A's saved results and shows B's failure. Close/reload resumes progress without duplicate starts.
5. A topic-discovered post with a saved author/containing community appears in Account Posts and Trending Posts with the same post ID; secondary-channel matches work.
6. Suggestions group multiple posts by exact author identity; incomplete identities stay Needs Verification. Review does not auto-charge or auto-import.
7. Review/edit/approve/import refreshes the account linkage, both tabs and suggestions; support concurrent existing-account detection and independent Retry Linking.
8. Existing single-account scout, Add Post Link, legacy data access, Activity and dossiers continue to work.
9. Verify desktop/mobile and viewer/editor states using fixtures/mocked APIs. Run typecheck/build and focused frontend tests. Do not run paid tests.

Deliver the implemented frontend, changed-file summary, tests run, screenshots/QA evidence and any backend contract discrepancy. A completion report is not final integration acceptance; Codex will independently inspect the diff and verify the action path.
