# Scout account criteria implementation and acceptance

## Delivered behavior

New Find Profiles plans use SearchPlan 5 and assessment revision 6. New requests require the displayed plan hash. Persisted version 4 plans continue through the previous executor. Search criteria, model policy, verified capabilities/builds, quotas and approved budget participate in the plan hash.

Followers and members have separate inclusive optional minimum/maximum bounds, from zero through 1,000,000,000. Missing counts remain unknown. Approval and import both enforce observed size on the server; manual confirmation cannot override the range. Community imports store members separately from account followers.

The executor maintains a candidate queue across four retrieval stages: scoped profiles, broader profiles, topic content/authors, supplementary bilingual queries. Qualification criteria remain fixed while queries broaden. Hydration is shared across platforms and reserved across rounds; priority favors supported topic, account type and geography evidence. Existing accounts, duplicates, rejected feedback and missing evidence do not satisfy the new-account target. Details precede optional owned-post sampling; posts are not fetched solely to resolve a missing audience count. Provider checkpoints and receipts prevent duplicate starts on retry.

Results default to Qualified, expose Needs Verification, Excluded and In CRM, and explain shortfall and stop reason. Review approval remains separate from system qualification. Reload retains review/import state and the historical count of qualified accounts imported from the search. Broaden Search retains criteria; stored reassessment hashes criteria and evaluation revision, replays author evidence, preserves the source/ledger and starts no provider.

## Verification

- 400 tests across 50 files pass, including inclusive bounds, zero/unknown values, separate members/followers, bilingual queries, author fallback, fairness, later-round capacity, contextual feedback, budget and stale capabilities, replay, review/import and reassessment identity.
- Application and Scout typechecks pass. Production build passes.
- Browser verification used the real DiscoveryScoutModal with intercepted local API fixtures: KOL followers and community members, min/max restoration, plan cap, default Qualified/shortfall, missing-size approval disabled, approval/import, reload, and explicit rejection of a $2 input against a $1 maximum without silently changing the input.
- Screenshot: `artifacts/scout-criteria/qualified-browser.png` (fixture, not live sample results).
- Browser fixture source: `tooling/scout/fixtures/criteria-page.tsx`. It intercepts all `/api/` requests and never mutates CRM or calls a provider. The temporary development route was removed before building.
- Authenticated production/hosted preview browser flow and live Facebook/Instagram quality remain unverified. Nothing was deployed, committed or pushed; administrative budgets were not changed.

## Budgeted live TikTok sample

User-approved scope: Badminton, Ho Chi Minh City, 5 individual accounts, TikTok only, total maximum $1. No follower threshold was requested. No accounts were approved or imported.

Session: `b10e0ca8-0126-4ca0-b85b-5d3ba8a0110b`. Immutable provider receipts and complete output: `artifacts/scout-criteria/live-sample.json`.

| Measure | Observed |
| --- | --- |
| Actual charge | $0.3948 |
| Provider runs | 10, all settled succeeded |
| Unique candidates retained | 57 |
| Qualified new / requested | 0 / 5 |
| Needs verification | 40 |
| Excluded | 17 |
| Approved / imported | 0 / 0 |
| Cost per qualified / approved | Undefined: denominator is zero |
| Stop reason | Existing 15-minute session time limit |

Every candidate's geography dimension remained unknown. Bios and post mentions are preserved as location proposals; they do not substitute for verified structured location/geotag evidence. This prevents globally popular badminton profiles from being presented as verified HCMC creators.

Manual inspection of all 57 saved biographies and the collected owned-post samples found 33 with direct badminton topic support, 1 misleading lexical match (Badminton School describes a girls' school), and 23 without enough topic evidence in the saved material. This is 33/57 (57.9%) evidence-supported topic retrieval, with 33/34 (97.1%) supported among automated topic passes. These are an agent audit of saved evidence, not reviewer approval, current full-profile verification or a baseline quality comparison. Type and geography uncertainty still prevent qualification.

The sample began before the final candidate-priority and time-limit-display corrections. Those changes have focused test coverage, but have not been measured in another paid run. No claim of improved live yield is made. Facebook and Instagram were outside the approved paid sample.

The source session and provider ledger are preserved. Future quality work should inspect verified location coverage and evaluate prioritization using stored evidence before spending again; filters must not be relaxed merely to fill the target.

## Reproduce the browser fixture

Temporarily create `src/app/templates/scout-criteria-qa/page.tsx` in development:

```tsx
import Fixture from '../../../../tooling/scout/fixtures/criteria-page';
import { notFound } from 'next/navigation';
export default function Page() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return <Fixture />;
}
```

Run development on a free port and open `/templates/scout-criteria-qa`. Remove the temporary route before building. Fixture state persists only in the browser localStorage; no provider or CRM calls are made.

The live runner requires an explicit `--allow-paid` and approved `--budget-usd`. Never rerun without `--resume=b10e0ca8-0126-4ca0-b85b-5d3ba8a0110b` to inspect this sample. A resume of the completed sample exports its saved result and can settle already-started receipts; it does not create a new search.

## Authorized production deployment

After the user authorized deployment, a frozen application snapshot was deployed to Vercel project `hoang-le2/sportcommunityplatform`. Its 261 source files matched the tested workspace. Local credentials, raw datasets, QA artifacts and untrained model weights were excluded. Existing workspace edits were preserved; no Git commit/push, administrative budget update, new Apify run or CRM mutation was performed.

- Preview `dpl_YX5oKz9xjD4vCwXLpb24roAYg8XE` reached Ready after the hosted build passed. Login returned 200, an unauthenticated plan request returned 401 and the disabled fixture returned 404.
- Production `dpl_GL9yhRCWiP5qXbesXzox4aGEZDSq` reached Ready after the hosted build passed and was assigned to [production Scout](https://sportcommunityplatform.vercel.app/scout). [Deployment inspector](https://vercel.com/hoang-le2/sportcommunityplatform/GL9yhRCWiP5qXbesXzox4aGEZDSq).
- On the production alias, login returned 200 and rendered; Scout redirected unauthenticated requests to login (307). Plan and reassessment returned 401 with `UNAUTHORIZED`. The production Workflow fixture returned 404.
- Verification receipts are under `artifacts/scout-criteria/deploy/`. Authenticated browser/review/import acceptance and live Facebook/Instagram quality remain unverified; deployment does not resolve the live-sample quality limitation above.
