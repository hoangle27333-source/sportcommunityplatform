# Scout Workflows implementation and rollout

The web app now dispatches Scout through Vercel Workflows. Supabase retains sessions, execution leases, provider reservations, budgets, dataset checkpoints, reviews and results. Apify runs use the existing immutable verified Actor builds. New Scout producers do not use BullMQ or Redis. Other queues are unchanged.

## Review before deployment

Apply `supabase/migrations/20261011000000_scout_workflows_and_engagement.sql` before deploying this application version. The dashboard requires its engagement RPC and dispatch requires its atomic claim/register RPCs. This is an additive migration; it does not dispatch or collect anything.

Configure the existing Supabase service credentials and Apify token on Vercel, plus a strong `CRON_SECRET`. Keep `SCOUT_LEGACY_WORKER_ENABLED=false`, stop old Scout worker deployments and disable old Scout schedules. Do not override `WORKFLOW_TARGET_WORLD` to `local` on Vercel. The SDK selects the hosted world automatically. Internal `/.well-known/workflow/` endpoints bypass cookie middleware; the SDK handles its queue protocol.

Check the actual Vercel project's plan, Workflow/queue/compute quotas and spending limits before rollout, along with the Scout budget settings and Apify balance. No free-running assumption is made. Project/account quotas have not been verified from an authenticated Vercel dashboard in this implementation pass. See [Workflow pricing](https://vercel.com/docs/workflows/pricing) and [Next.js SDK setup](https://workflow-sdk.dev/docs/getting-started/next).

Database receipts checked read-only on 2026-10-11:

| Source | Verified immutable build |
| --- | --- |
| Facebook Page search | `0.0.333` |
| Facebook Group search | `0.1.4` |
| Facebook Page details | `0.0.518` |
| TikTok profile search (`/user`) | `0.0.612` |

Facebook sources fail independently. An unavailable branch produces partial coverage. TikTok community discovery uses the verified profile contract and classifies Community/Individual/Unknown; it does not create another capability receipt. Import still requires explicit reviewed approval. Deployment must use the same verified receipt database; reverify only missing evidence within the existing budget.

## Dispatch and continuation

- Sessions are saved before dispatch and return HTTP 202. Atomic dispatch claims use a token and two-minute lease. Workflow steps register their own run ID.
- A lost start response produces **Dispatch needs reconciliation**. Recovery checks known run status; it does not assume a missing response means no run exists. Unknown dispatches without a run ID become eligible after their lease expires; stale tokens cannot register.
- Pending Apify runs use durable sleeps with 5–30 second backoff. Each step executes one uncached provider unit and reads at most one dataset page. Completed entity/channel/post units are checkpointed.
- The executor checks the session owner's editor/admin role and holds a renewable lease. Engine checks prevent an old consumer claiming a session during a Workflow switch.
- Provider reservations, task hashes, input/build snapshots and `START_UNKNOWN` remain fail-closed. Replays reuse provider run IDs. Runtime-v1 evidence needs manual reconciliation and cannot start replacement paid runs through Workflow.
- Processing timeout is 15 minutes from first execution, not session creation. Failed sessions are not automatically retried.
- Daily secret-protected maintenance runs at 02:00 UTC. Each invocation scans up to 10 active sessions, reconciles up to five billing records and cleans expired cache/old raw rows. Admin **Recover Task** runs immediately for a selected session. Repeat maintenance for larger backlogs.

## Latest-30 engagement

The server RPC selects at most 30 dated, deduplicated stored posts for each `community_id` before PostgREST row limits. It does not associate records by author name. The summary includes post IDs, sample size, measured count, dates and channel coverage.

The average is `mean(likes/reactions + comments)` over posts with both metrics in that sample. Observed zero is valid. Missing metrics are excluded; the 31st post does not replace an unmeasured post. UI displays **Not available**, coverage, update time, partial sample and an explanatory tooltip when appropriate.

**Update latest 30 posts** opens channel selection; opening does not start collection. Submission collects up to 30 public posts per connected selected channel, independently of incremental watermarks/30-day windows, then merges the latest 30 across the club. Private/unverified/error channels retain existing data and report partial coverage. This is a collected public sample, not a guarantee that inaccessible posts were inspected.

## Implementation verification before rollout

- `npm test`: 34 files / 284 tests passed.
- `npm run typecheck`: passed.
- `npm run build`: production compilation, types and route generation passed.
- Migration applied and assertions passed on disposable PostgreSQL 16 with a minimal fixture schema. Atomic claim, token fencing, expired lease, failed-session exclusion, service-only RPC access, canonical URL dedupe and 30-post sampling over 1,101 records were checked. This does not prove the hosted migration has been applied.
- Real local SDK fixture completed with two steps and durable sleep: average `15.931034482758621`, 29 measured / 30 posts, zero provider starts. Another fixture resumed after process restart using explicit `wakeUp`; the first measurement step remained at attempt 1. Local automatic restart delivery was not established. Hosted redeploy/queue continuation still needs preview verification.
- Actual table component and update modal were checked in a local browser using fixture entities. The column, `1,020`, 29 measured / 30 posts, timestamp, partial sample, empty state and channel-selection form were visible. No collection was submitted. Screenshot: `docs/scout-engagement-fixture.png`.
- No production migration, deployment, collection, import or recovery was performed.

## Production rollout — 2026-10-11

- The user authorized deployment. Vercel account `hoangle27333-source`, team `hoang-le2`, project `sportcommunityplatform` was verified. The team has an active Hobby plan; authenticated remaining Workflow event/compute quotas were not established.
- The migration was applied transactionally in the project's Supabase SQL Editor in Chrome Hoang. The editor returned success and the service-role engagement RPC and new session columns were independently read successfully. SQL connection credentials in local/remote environment configuration were stale; the dashboard was used instead. No `supabase_migrations.schema_migrations` table was present.
- Preview `dpl_64cNtXUBKpqkqEWLnmsGuZJhr3PG` completed two hosted fixture runs automatically, without PATCH wake-up or Apify calls. Run `wrun_41M4MJKFST0GP90HKAP5AAZP4G` completed its 60-second durable sleep; `wrun_41M4MJP9B20GV6BYH921P068XM` also completed while a new deployment was being built. Both returned 29 measured / 30 posts and average `15.931034482758621`. This verifies hosted continuation during deployment; it does not claim a physical computer shutdown test. Temporary fixture project environment variables were removed after testing.
- Final production deployment: `dpl_7uxj9owLEKPko8Pgsr9Yrf2aF2og`, [production](https://sportcommunityplatform.vercel.app), [deployment inspector](https://vercel.com/hoang-le2/sportcommunityplatform/7uxj9owLEKPko8Pgsr9Yrf2aF2og). Build passed and the production alias was assigned. An earlier build was canceled before completion to exclude `.env` from uploads; `.vercelignore` now excludes real environment files. The final uploaded source contains only `.env.example`.
- Production fixture endpoint returns 404; login returns 200. Authenticated Chrome smoke checks showed Facebook and TikTok enabled and selectable in Communities & Clubs, the engagement column, and the latest-30 channel form. Opening/closing forms did not submit collection. Existing four clubs have no dated stored samples and correctly show Not available / 0 measured / 0 posts. A new production review/import was not performed.
- The three original IDs were recovered through the admin UI, retaining their IDs and provider ledgers. All reached `complete`: HYROX returned 7 review candidates (23 excluded); Running returned 0 eligible candidates (15 excluded); #running returned 0 eligible posts (22 excluded). Empty-result warnings are preserved. No failed sessions were retried. Provider task keys were unique; no duplicate paid starts were observed.
- Scout Activity was reloaded and retained all three completed results, including HYROX's 7 Need Review badge. Screenshot: `docs/scout-production-rollout.png`. Six provider runs all succeeded, with unique session/task keys and total recorded actual Apify usage of USD 0.418; this excludes Vercel compute/queue charges. No candidates were approved or imported automatically.
- Supabase displayed **Grace period is over** and warned requests may stop when quota is exhausted. Its service API remained available during rollout. The account quota/billing warning remains an operational concern.

## Preview smoke test before production

Enable `SCOUT_WORKFLOW_FIXTURE_ENABLED=true` and set `SCOUT_WORKFLOW_FIXTURE_SECRET` only on preview. The fixture endpoint returns 404 when disabled or when `VERCEL_ENV=production`, and uses bearer-secret authorization. It never accesses Supabase or Apify.

1. POST `/api/sport-hub/scout/workflow-fixture?delay=60` with `Authorization: Bearer <fixture secret>`; save its `runId`.
2. GET the same route with `?runId=<id>`. Verify running status, then close the browser and redeploy/restart while it sleeps.
3. GET again after the sleep; verify completed, `fixture=true`, `providerStarts=0`, `sampleSize=30`, `measuredCount=29` and the average above. A redeploy probe should also confirm the original run continues using its original deployment.
4. PATCH the route with the run ID is an explicit wake-up probe if needed; record this separately from automatic durable continuation.
5. Disable/delete preview fixture secrets after testing. Run the existing authenticated discovery/review/import fixture flow for Facebook Page/Group and TikTok and verify persistence after reload before accepting rollout. Do not substitute an unreviewed production import for a fixture test.

To repeat SQL checks, initialize a fresh disposable database with `tooling/scout/workflow-migration-schema.sql`, apply the migration, then execute `tooling/scout/workflow-migration-fixture.sql`. Never run those fixture SQL files on a shared database. For UI-only inspection, temporarily copy `tooling/scout/fixtures/community-engagement-page.tsx` to `src/app/community/engagement-fixture/page.tsx`; remove the temporary route after inspection and do not submit its collection form.

## Recover the original pending sessions after rollout

Use the admin **Recover Task** button (or authenticated POST `/api/sport-hub/scout/recover` with `{ "sessionId": "..." }`) for these same IDs:

- `8a8db666-ce92-413d-981e-71b6173288fb` — Find Content, `#running`.
- `4cc9de34-2d4d-4ae7-96a2-6e39cc79ac2c` — Find Profiles, HYROX.
- `9c68115e-b3f3-4cb3-8844-a5606245ef69` — Find Profiles, Running.

Confirm their owners still have access and review the existing provider ledger/budget before recovery. Do not create replacement sessions and do not retry failed tasks. Accept only when tasks complete with the personal computer off, saved results survive reload and the displayed average matches the returned sample post IDs and measured metrics.
