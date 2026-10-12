# Running search corrections — 2026-10-11

Production: https://sportcommunityplatform.vercel.app

## Behavior

- Canonical geography precedes session criteria, retrieval scopes and assessment. Nationwide / Toàn quốc and Any location apply no geography filter; Vietnam remains an explicit evidence-based filter.
- Facebook search inputs contain topic queries and no provider location suffix. Optional, reviewed query variants are restricted to Facebook profile or keyword search.
- The adapter retains exact hashtags observed in Facebook text-reference URLs. Query context is never evidence. Running / Runner / Chạy bộ / Marathon share topic assessment aliases.
- Successful empty tasks display No Results. Item diagnostics and source evidence explain exclusions; incomplete interactions remain in review unless observed views independently qualify.
- Reassess Saved Results creates one deterministic child session per source and assessment version. It uses saved provider rows, preserves the source reference date and receipts, blocks paid provider execution, does not advance watermarks, and returns persisted previews without CRM writes.
- Broaden Search preserves criteria, displays proposed changes and configured budget, and creates collection work only on explicit submission. Profiles still require existing review / Approve for Import.

## Verification

- 35 test files / 297 tests passed, including stored-evidence replay, owner/editor checks, unavailable/failed source rejection, repeated requests, criteria preservation and variant restrictions.
- Application typecheck, Scout typecheck and production build passed. Vercel hosted builds succeeded.
- Authenticated preview smoke: original task GET 200; unknown reassessment source POST 404 / NOT_FOUND; Scout page GET 200.
- Production Chrome Hoang: No Results on original empty tasks; reassess both sources; inspect profile evidence; reload results; open Broaden Search, edit variants/geography, cancel without creating collection work.
- Repeated production reassessment POST returned the same child (HTTP 200, providerStarts 0).

## Reassessment results

| Source | Child | Outcome |
| --- | --- | --- |
| 8a8db666-ce92-413d-981e-71b6173288fb | 19597d46-25ab-5744-a03e-621fb2eebf1e | 1 matched post / 30 observed; 18 absent exact hashtag, 4 outside original recency window, 7 below engagement thresholds |
| 9c68115e-b3f3-4cb3-8844-a5606245ef69 | 37f757bf-5493-580f-a30a-97e16150d888 | 0 profiles / 15 observed; all 15 lack running topic evidence |

Both children completed through Vercel Workflows. Full original session rows and the source provider ledger are unchanged. The two sources retain three existing paid runs totaling USD 0.188; both children have zero provider runs. No paid recollection, import, failed-task retry or source-session mutation occurred. The matching content remains a saved-evidence preview, not a new Trending record.

Final production deployment: https://sportcommunityplatform-hdwbhm8yj-hoang-le2.vercel.app (Vercel inspection confirmed Ready, aliased to the production domain). The final UI uses the polled result rather than the initial running snapshot and labels stored-evidence content metrics as Matched Evidence / Preview only.
