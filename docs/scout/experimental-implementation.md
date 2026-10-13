# Experimental Scout: implementation and pilot evidence

Status on 2026-10-12: implemented experimental pipeline, fixture verified, small isolated Facebook pilot completed. Verified Apify and bounded Gemini capabilities are now configured for the authorized release. Current Search (Apify) remains the default. The full eight-session quality acceptance is incomplete.

## Implemented behavior

- Strategy `seed_content_v1`, SearchPlan v6, assessment revision 7. Existing v4/v5 executors remain selected for historical plans.
- Task-specific provider selection. Apify is the experimental default for discovery/profile/posts. Brave and Bright Data adapters are gated by verified configuration; they have not been live verified.
- Reviewed bilingual keyword list, seed URLs and dataset selection; immutable seed snapshot, capability/build/model/prompt configuration and budget participate in the plan hash.
- Content-author discovery is scheduled even for a single approved keyword. Unsupported/stale branches are filtered out before collection; only verified builds are pinned. Remaining approved calls are prioritized by observed method yield with round-robin platforms. Distinct owned sport posts and seed-content similarity prioritize a bounded candidate queue; public collaborator links expand one hop. Similarity and seed membership never qualify an account.
- Up to 12 discovery requests, 60 unique candidates, 20 profile details, 10 sampled owned posts and six media samples per account. Instagram Apify content queries require compatible hashtags. One immutable actor branch runs per discovery request.
- Shared assessment across collection target, preview, reassessment, review and import. Three distinct owned sport posts, a declared athlete/coach role with a supporting sport post, or a collected trusted-publisher introduction explicitly linking one account to the sport role can meet topic. Trusted publishers require an explicit server-side allowlist; none is enabled by default. Model-invented sources and multi-person tags cannot qualify a role. Missing evidence stays unverified. Followers and members remain separate.
- Text analysis precedes media analysis. Gemini 2.5 Flash-Lite is explicitly pinned; token preflight reserves bounded cost. Model analysis is capped at $0.02/session, reflecting the user's later authorization of inexpensive paid models. Scraping remains free-credit/trial only.
- Generic racket/court images, product brands and event names are insufficient evidence for badminton. Visual descriptions require a shuttlecock or explicit visible badminton labeling. No face identification is used.
- Account location and observed content location remain distinct. Sport post geotags can qualify content location; a caption mention alone does not establish presence.
- Durable provider/model receipts, unresolved-start fencing, checkpoints, saved-evidence recovery and model/provider-free reassessment. SQL serializes old/new reservations and shared trial wallets. Unknown costs retain reservations.

## Workbook ingestion

`tooling/scout/ingest-seeds.ts` is read-only by default. `--persist` writes only the new seed tables, never CRM. The workbook is not edited. Ingestion has now been persisted to main; `seed-readiness-receipt.json` records 95 seed records, zero configured Experimental capabilities, zero CRM writes and no provider/model calls for the readiness step.

Verified source SHA-256: `483b53e507bfbb9bd7360f2a0dfeba37027c181b0ecef9fbd467618eab8ed0bb`.
Sheet: Talent Database. 97 source profile rows; 96 raw unique URLs; **95 canonical unique URLs**. Two Facebook share links remain unresolved and cannot be selected as verified seed account URLs. The earlier 96-unique figure referred to raw URLs, not canonical identities. Duplicate source rows remain attached to their record. Followers and region are historical context, not current observations. Road maps to Running/Road, Trail and Triathlon remain distinct.

## Live Facebook pilot

The user narrowed the initial provider experiment to Apify and authorized inexpensive Gemini analysis. The isolated pilot reused existing verified Apify build contracts and reservation ledger, rather than enabling the new production migration. It never approved or imported CRM records.

Raw receipts are private and ignored by Git: `private/scout-dataset/seed-content-apify-pilot.json`. Retry reruns the same receipt identities; completed provider/model responses are reused.

| Sample | Observed outcome |
|---|---|
| leechongtudeptrai | 9,154 followers; ten posts; Individual with commercial activity; HCMC profile location. Insufficient direct badminton post evidence after removing ambiguous brand/product visual claims. Needs Verification. |
| thongthao.shopvnb | 8,240 followers; ten posts; Individual; repeated owned badminton content. HCMC is mentioned but observed location remains unverified. Needs Verification. |
| nhu.pham2605 | Profile unavailable in the verified detail response; no replacement scrape started. |
| Content-author retrieval | 15 search posts, five unique authors, zero new Qualified accounts. Additional profile/post hydration was not run for these new authors. |

The sample exposed two mapping defects: Facebook post authors use numeric account URLs while seeds use vanity URLs; search post authors can be represented only by `user.id`. The new adapter binds ownership through observed IDs and retains each original source URL. It also maps structured current-city fields and media thumbnails without rewriting historical assessment semantics.

Apify settled provider charges: **$0.104** of Free credit across four existing-ledger runs (excluding continuing account storage charges). Gemini token-based estimated cost across prompt revisions: **$0.0058286**; this is an estimate, not a reconciled invoice. Model revisions were replayed without additional Apify starts. No credit purchase, subscription or administrative budget increase occurred.

A provisional model result initially qualified the first seed. Inspection identified generic product imagery being counted as topic proof; stricter validation removed those claims. The final result is Needs Verification. Do not report the earlier provisional result as acceptance evidence.

Neither seed identification nor five discovered authors establish improved precision or discovery yield. Manual reviewer precision, cost per approved account, and a comparable saved baseline have not been measured. Instagram/TikTok and the eight full pilot sessions remain unrun.

## Verification and activation boundary

- Unit fixtures exercise eight sport/platform/type pilot combinations, missing-keyword content, media gating, repeated/reposted evidence, wrong sport, commercial identity, location, ranges, author mapping, later-round recovery, platform failures and saved request replay.
- Browser fixtures intercept all APIs. Both strategies passed configuration, plan, evidence, type correction, filtering and approval. Experimental also passed seed dataset selection, separate seed verification, saved-review resume, fixture import and reload. These are UI behavior checks, not live authentication/database/import proof.
- The additive SQL migration was exercised on embedded PostgreSQL: compile, reservations, replay identity, trial-wallet exhaustion, combined old/new budgets and failed-reservation rollback. This does not replace live schema/RLS/concurrent-client verification.
- `scout:typecheck` and 472 tests in 58 files passed. Production build passed again after the final recovery/import and prompt-pinning edits.
- The user authorized applying the migration to **main (PRODUCTION), without enabling Experimental**. It was applied successfully through Chrome in one BEGIN/COMMIT transaction. Five tables have RLS and deny anon/authenticated SELECT; the new RPC is service-role only. Capability, trial-account and external-run tables remain empty; seed storage now contains one dataset and 95 records. Existing reservation and replay passed in a rollback-only live fixture with zero provider starts. Administrative budgets are unchanged. See `main-migration-receipt.json`. Both configured PostgreSQL URLs currently fail password authentication; Supabase REST access remains available. Chrome dashboard inspection confirmed only main (PRODUCTION), and initial read-only SQL returned NULL for the new Experimental tables before application. The user subsequently selected main explicitly. Supabase has no migration-history table, so this manual application is recorded in the local receipt. No database credentials were changed.

Before enabling Experimental on preview: ensure `20261012010000_scout_experimental.sql` is present in the intended preview database (already applied to main); verify seed storage (ingested to main, 95 canonical records); configure verified trial account wallets/capabilities and immutable actor builds; configure the explicit Flash-Lite pricing revision and model cap. Configuration contains no API secrets; keys remain environment variables. Do not enable unverified Bright Data datasets or capabilities.

Remaining acceptance work: live preview session resume/reconciliation and concurrent-budget checks; complete authenticated review/import/reload for KOL and communities; configure and live-verify trusted external publishers and any additional geographic source resolver; reverse-resolve non-profile Brave content hits only through a verified adapter; verify Bright Data schemas; run the eight full discovery pilots and obtain manual quality labels. Missing endpoints/capabilities remain blocked rather than inferred.

## Research references and limits

- InfluenceX, commit `a36a804af773178d8c091e462cc75074978012f3`, `server/instagram-discovery.js`: hashtag posts → authors → profile enrichment; still Apify-backed.
- Tigerless influencer-discovery, commit `89a17be52e81a50d530798c8fcee5a339b623e7e`, `skills/influencer-discovery/scripts/influencer_discovery/channels/tiktok.py`: video authors and prioritized profile hydration with caption evidence.
- Creator Outreach RAG, commit `32d9288be6238e4cc0badc8572f79abd783f5032`, `src/embeddings.py`: vector retrieval inside an existing creator dataset; does not discover unknown external accounts.
- Multi-Modal Influencer Analytics, commit `39659918028572f8b2438f0ae6436482a3dd8d6f`, `ml/instagram/models/similar_influencer.ipynb`: numeric/TF-IDF similarity; inspected code did not establish visual understanding.

No repository scoring implementation was copied. References inform retrieval design; they do not prove our quality outcome.

Pricing reference checked during implementation: https://ai.google.dev/gemini-api/docs/pricing ($0.10/million text/image/video input tokens and $0.40/million output tokens for Gemini 2.5 Flash-Lite standard pricing). Apify account status/limits were read through authenticated GET endpoints; no account settings were updated.

## Authorized release continuation

The user subsequently authorized completion and deployment. `activation-receipt.json` records authenticated Free credit verification, a single $0.80 scraping wallet expiring with the current Apify cycle, nine task/platform capabilities pinned to previously verified immutable builds, and one paid Gemini 2.5 Flash-Lite capability. Model usage has a $0.02/session cap and 32 request units for this allocation. The $0.15 Free-credit reserve is retained. No administrative budget or provider subscription was changed. Brave and Bright Data remain unavailable. Media fetching allows only exact CDN hosts observed in the saved Facebook pilot; inaccessible or unverified media remain Unknown.

Authenticated preview verification caught a plan identity defect: start-only UI routing metadata changed the hash and prevented session creation. The hash now excludes UI context and reviewer notes; a regression test checks that adding these at start preserves the approved identity. Six live-configuration plans (Facebook/TikTok/Instagram, each KOL and community) compiled with verified content-author/hashtag and profile branches, with zero provider starts. These configuration checks are distinct from discovery yield.

## Release verification on 2026-10-12

Production deployment `dpl_63VG369PeAmHZeFZjdf1H42dEQVW` is Ready at https://sportcommunityplatform.vercel.app, built from the same frozen source as Ready preview `dpl_EipobzFjkrLEP8rG1xbA3XQtoR9p`. No Git commit/push or administrative budget change was performed. Source-only snapshot excludes local credentials, raw workbook, private receipts and build caches. Authenticated Chrome Hoang verified production Scout, saved Activity and Current Search default.

Live runtime testing found and fixed two additional defects. Large (22 KB) session plans exceeded the PostgREST URL limit in the historical snapshot CAS; v6/large sessions now use a service-role-only atomic snapshot RPC (`20261012020000`). TikTok requires a minimum $0.50 actor cap. The new Apify trial bridge (`20261012030000`) transfers that reservation to the provider ledger instead of counting it twice, reconciles settled credit against the shared wallet, and retains ambiguous holds. Current actor minimum pricing is checked during explicit capability configuration; a cap below that minimum is rejected at planning. Both migrations were exercised on embedded PostgreSQL and applied on main through Chrome in transactions. Anonymous RPC access is denied. Confirmed pre-start failures were reconciled to zero charge without deleting original sessions or receipts.

The real v6 local bounded executor pilot `726ba266-b3f0-4816-83ac-642178814eb3` collected 28 candidates: 8 Excluded, 20 Needs Verification, 0/5 Qualified. Five Apify run receipts settled to $0.1002 of Free credit; Gemini estimated cost was $0.0006629. Completed replay started zero providers; no CRM review/import occurred. The pilot stopped at the shared trial reservation boundary. Raw historical searchCost fields in the initial runtime receipt represent the older accumulation semantics; `live-reconciliation-receipt.json` computes final outstanding reservation $0 and settled credit $0.1002 from the durable ledger. This is real provider/executor proof, **not a hosted Vercel Workflow run or quality acceptance**. No improved precision or discovery yield is claimed.

Model media access now also includes exact TikTok CDN hosts observed in successful, currently verified immutable-build provider receipts. URLs/hosts outside the verified allowlist remain unavailable. Trusted-publisher allowlists, Brave/Bright Data live adapters, external geographic resolution and the full eight-session/manual-quality acceptance remain unverified or unavailable and are not represented as completed live coverage.

The final production build is `dpl_8s14s7UzanwbN9mk9VbfYp3gHdhH`; its final change labels Experimental cost as provider charges plus a model estimate. The authenticated production smoke session `4624d972-bc75-4747-a475-1a42fe7ff548` completed through Vercel Workflow `wrun_41M4QNNFKA0GTFE5NA16KW0BT8`, reused cached Apify evidence with zero provider-run rows, and incurred an estimated $0.0006629 model cost. Reload restored results/evidence and kept unapproved import disabled. Stored-evidence child `f03b1eb1-0a93-52dc-a3da-8fcd1f684c1e` completed with zero provider and external/model ledger rows; source decisions and ledgers were preserved.

A live functional example is **Công Cầu 🏸** (`https://tiktok.com/@minhcong.ha`): no badminton/cầu lông keyword was matched in its name or bio, but nine owned posts supported badminton; observed followers 1,208 and Individual identity passed. The selected HCMC scope is only mentioned, so geography remains Needs Verification and this account is not Qualified. This establishes content-based sport identification in the live sample, not improved overall precision or fulfilment of the five-account target.
