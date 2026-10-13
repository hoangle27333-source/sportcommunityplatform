# Brave Search compatibility review and rollout

Reviewed 2026-10-13. Brave is a task-specific discovery provider for Experimental Search (`seed_content_v1`, SearchPlan v6). Apify remains the default and supplies profile details and owned posts; Gemini analyzes collected content. Current Search and Top Posts retain their existing provider paths.

## Compatibility matrix

| Surface / requirement | Verdict | Evidence and behavior |
| --- | --- | --- |
| Experimental UI → approved plan → execution | Supported with adapter | The same request builder produces preview and execution parameters. Query, parameters and adapter revision participate in plan hash; mismatches stop before reservation. |
| Public profile / group web hits | Supported with adapter | Canonical, same-platform account URLs become leads; title/snippet are separate search hints. Group hydration still requires a verified group-capable Apify detail contract; missing support stays unverified. Captured live responses and fixture replay exercise Facebook, TikTok and Instagram. |
| Admission → profile/posts enrichment | Supported with adapter | An observed topic hint in a search result admits a lead for Apify inspection. It cannot qualify sport, identity, audience size or geography. Flow fixtures verify profile and owned-post retrieval after Brave admission. |
| Post/reel → author identity | Unsupported in v1 | Search hits without verified author identity remain in the external ledger and emit unresolved counts; no owner is guessed from title, snippet or URL slug. |
| Follower/member counts, engagement, entity type, location | Needs Apify evidence | Brave web results are not social profile snapshots. Missing fields remain Unknown; snippets never populate bio/name/metrics/location. |
| Keyword, sport, role, location wording | Supported as retrieval intent | Exact approved Unicode text follows the required site operator. The six real receipts preserve the original query and report the intended site restriction as applied. Location words are not location evidence. |
| Language and count | Supported | Real calls accepted `search_lang=vi`, `ui_lang=en-US`, count 15. English queries and Vietnamese queries both returned leads. |
| OR / conflicting site operators | Unsupported in v1 | Rejected before request/reservation; separate approved query lines are required. The final query is bounded to 600 Unicode characters / 75 words, count 1–20. The existing approved-keyword form additionally limits each line to 150 characters. |
| Strict residence/geography filtering | Unsupported by web search alone | The provider returned country context `us` with our default parameters. Vietnam/HCMC wording narrows retrieval intent but does not enforce residence. Final qualification uses observed account/post evidence. |
| Social-post date windows / most viewed sorting | Unsupported | Web freshness represents page age and is not a verified social publication timestamp. V1 has no automatic freshness or pagination. |
| Current Search / Top Posts | Unsupported as replacement | Current Search is built on immutable Apify actor contracts; Top Posts needs publication/engagement evidence and local views-first ranking. Brave is exposed only for Experimental Discovery. |
| Resume / saved recovery / reassessment | Supported | Typed rows restore with the same identity adapter. Search hints persist separately. Reassessment uses stored evidence and starts zero providers. |
| Review / CRM import | Existing safeguards apply | Missing metrics and unapproved selections cannot bypass review/import policy. Live verification performs no CRM import. |

## Live response evidence

Two approved queries per platform: `cầu lông huấn luyện viên Hồ Chí Minh` and `badminton coach Vietnam`, each prefixed with the platform site operator. Six requests returned 90 normalized same-platform rows. These are web search observations, not verified accounts.

| Platform | Successful requests | Unique admissible account leads | Unresolved post/unknown URL observations |
| --- | ---: | ---: | ---: |
| Facebook | 2 | 19 | 8 |
| TikTok | 2 | 9 | 21 |
| Instagram | 2 | 12 | 6 |

Receipts retain provider query metadata, exact source URLs, unchanged title/snippet text, normalized URL kind and observation time. The minimal web adapter intentionally does not retain unrelated full-response sections. The public fixture contains the captured normalized web result sets; private pilot material is ignored by Git. All six durable request rows succeeded at $0.005/request, total API usage value $0.03; completed receipt replay issued no additional requests. No paid credit was bought.

Brave dashboard inspection confirmed Search prepaid Active at $5/1,000 requests, $5 granted Search credit, $0 purchased credit and auto-reload off. This establishes the subscribed rate; local `actual_usd` is API value at the verified rate, not a reconciled invoice or a promise that free credit never changes. Search credit refresh is UTC, while the application's budget month is Vietnam time.

## Interfaces and cost enforcement

`BraveRequest` freezes adapter revision, approved query and the outgoing parameters. `BraveResult` contains provider/revision, source and canonical URLs, URL kind, platform, title/snippet, query metadata and observed time. `SocialProfile.searchHints` preserves these observations without adding them to profile evidence. The candidate review UI labels them as discovery hints.

`BRAVE_SEARCH_API_KEY` is server-only in ignored local env and Vercel Preview/Production secrets. `.env.example` has an empty placeholder. Keys are absent from source, database rows, fixture data and receipts.

The additive migration adds an RLS-protected monthly budget table and service-role-only budget RPC. The latest reservation RPC supports paid Brave Discovery specifically, preserving Apify's trial bridge and Gemini's $0.02/session policy. Advisory/row locks serialize shared reservations. All platforms and deployments using this database share the $4.50/month ceiling. Existing daily/session limits also apply. Each unresolved request retains $0.005, including holds from older months; completed receipt replay does not reserve again. A settled prior-month request drops out of the current-month total. Provider usage outside this application is not controlled by this ledger.

Production migration was applied through Supabase Chrome Hoang / `hoangle27333-source`, project Sport Platform, main PRODUCTION. The pre-migration RPC checksum matched the latest local Apify bridge implementation. Dashboard post-check showed budget $4.50 and anonymous RPC access false; REST now reports $0.03 used and $4.47 remaining. A rollback-only live SQL test reduced the temporary cap to the already consumed $0.03 and confirmed the next reservation is rejected without a ledger row; rollback restored $4.50. Database passwords were not changed; direct SQL connection paths still fail authentication.

## Validation and operational boundaries

Tests cover exact requests/auth header, query changes before reservation, Unicode and invalid operators, schema validation, empty results, duplicate/wrong-domain URLs, snippet isolation, unresolved posts, admission/enrichment, saved recovery, all six captured live response sets, and atomic shared SQL budgets. Embedded SQL additionally verifies replay, rollback-safe units, over-cap rejection, prior-month unresolved holds, month rollover, RLS, and preservation of Apify bridge behavior.

Hosted release verification uses an existing admin login and the six saved Brave responses: plan/configuration, stable saved-result reload, rejection of unapproved import, hosted Workflow stored reassessment, idempotent child identity, and zero child provider/model rows. It does not perform fresh Brave→Apify profile/posts hydration and does not claim new Qualified accounts or improved precision. Live social hydration coverage is distinct from the adapter/flow fixture proof.

Activation and deployment receipts are alongside this report. The Brave-only configuration script is dry-run by default and only enables platforms with two successful live requests plus usable leads; it preserves used-unit counters. No administrative budgets or default provider were changed. Disable the Brave discovery capability to roll back activation; preserve evidence and ledgers.

References: [Brave Web Search API](https://api-dashboard.search.brave.com/api-reference/web/search/get), [Brave pricing](https://api-dashboard.search.brave.com/documentation/pricing), local `experimental-implementation.md`, `scout-search-v4.md`, `scout-top-posts.md`.

## Deployment verification

Ready preview: `dpl_4w13qQQvLqFJBggTHsRcg3QnpTSg`. Ready production: `dpl_3quByLj2kTtCW8ZKuJbrWxVkfL9e`, aliased to https://sportcommunityplatform.vercel.app. Both contain the tested adapter and budget integration; the final production cost label explicitly identifies API usage value. No Git commit/push was performed. Preview hosted verification passed configuration, exact plan, stable reload, unapproved-import rejection and provider-free Workflow reassessment. Production verification is recorded separately in `brave-production-receipt.json`.

Authenticated Chrome Hoang production UI inspection confirmed Current Search (Apify) remains the default, Experimental Search allows Brave selection, the monthly API-value panel shows $0.030 used / $4.470 remaining, and an approved two-query plan renders without starting a collection.
