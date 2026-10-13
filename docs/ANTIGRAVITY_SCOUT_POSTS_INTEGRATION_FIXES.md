# Scout Posts frontend integration corrections

Update, 2026-10-13: Codex has applied the corrections below while preserving Antigravity's layout. Mounted browser fixture verification passed for immediate batch progress, reload without another POST, failed-session termination, Vietnam custom dates, save-before-approve, partial import/link retry, empty workspace responses and viewer launch controls. See `docs/scout-post-workspaces-verification.md` for evidence and remaining live boundaries.

Please finish these frontend corrections against the implemented backend contract. Codex has inspected the current frontend source; these findings are source-level evidence, not a completed authenticated browser audit. Preserve concurrent edits. Do not change backend/provider policy to accommodate incompatible frontend values.

## 1. Batch launch must return control immediately

In `src/components/sport-hub/account-post-scout-modal.tsx`, `handleStartScout` currently uses `scoutFetch`. That helper polls internally until the entire session completes. The dedicated form stays in the planning step and cannot show streaming progress or close/run-in-background while the request is waiting.

Use raw `fetch` for POST `/api/sport-hub/scout/account-posts`. Store the returned session ID as soon as HTTP 202 arrives, move to the progress step, and let the dedicated polling effect handle the session. Preserve the ID in a durable URL or pending-draft mechanism so reload opens the same run. Do not POST another task on reload.

Test with a delayed mocked 202 response followed by running progress, partial results, and completion. Assert exactly one POST even after reload/reopen.

## 2. Failed polling responses must terminate the running state

The polling effect only handles results inside `res.ok && data.success`; a failed session has `success:false` and a non-2xx response and will otherwise be polled indefinitely.

Handle `data.status==='failed'` before the success branch, retain any `posts`/`accountResults`, show the typed error, and stop polling. Backend completed/failed responses now include explicit `status` fields. Test complete, all-failed, partial success and revoked-access responses.

## 3. Quality metric rule must match the backend

The form currently offers `Interactions First` and sends `metricRule:'interactions-first'`. The approved content filter schema only accepts `metricRule:'views-first'`; it already falls back to observed interactions when views are unavailable.

Remove the unsupported option and always send `views-first`. Keep minimum views/interactions controls and explain their actual behavior. Test both quality-enabled and quality-disabled plans.

## 4. Custom dates must display local time correctly

`datetime-local` values are initialized with `toISOString().slice(0,16)` (UTC fields), then parsed by `new Date(value)` as local fields. In Vietnam this shifts the requested interval by seven hours.

Format initial values using local date components, then serialize the selected local time to UTC exactly once. Keep the UI timezone clear. Test under Asia/Ho_Chi_Minh with a known 09:00 local value producing 02:00 UTC, including both custom boundaries and resumed criteria.

## 5. Import success and post-link success are separate

Backend import now returns `importedAccounts`, `importedIds` and `postLinkResults`. Use the returned account ID for Retry Linking; examine each linking result. When account import succeeds but post linking fails, show that partial state and the retry action instead of claiming all posts were linked.

Keep successful import state on linking failure and refresh account/post data. Test an import returning `success:true,partial:true,postLinkResults:[{success:false,retryable:true,...}]`, then a successful link retry without another import or provider action.

## 6. Accept empty workspace results and keep all suggestions accessible

The Posts view currently ignores a successful `posts:[]` response and falls back to old dashboard posts. Accept successful empty responses so stale posts are cleared. Avoid misleading success UI on read failures.

Suggested Accounts currently renders only `.slice(0,6)` with no access to the remaining entries. Add pagination or Show More so every suggestion can be reviewed.

## 7. Review must not import unsaved edits

The suggested-account form has separate Save Edits and Approve controls. Ensure unsaved name/bio/geography edits either save successfully before approval or block approval with a clear pending-edits state. Editing after approval must immediately invalidate the frontend approval state; server PATCH also clears approval.

Test changing a name, approving/importing, and reading it back; test stale-save errors preserve drafts. Import always uses the server candidate snapshot.

## Verification boundary

Backend tests, typecheck and a frozen production build passed before these source findings were recorded. The migration has been verified on an isolated temporary PostgreSQL instance, including concurrent metadata writes. The application's live database migration and authenticated end-to-end UI acceptance remain outstanding. Use fixture/mocked API QA without paid provider starts and provide real action-path evidence after the frontend corrections.
