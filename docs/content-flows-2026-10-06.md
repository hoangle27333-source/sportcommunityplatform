# Instagram and TikTok content flows

Find Content at `/trending` now provides two explicit presets:

- **Instagram** selects Instagram and Hashtag. Enter one exact hashtag, for example `#badmintonvietnam`. Posts and reels use the verified Instagram scraper contract. Keyword mode offers a visible **Use Instagram Hashtag** action.
- **TikTok** selects TikTok and Keyword when verified, with Hashtag also available. Keyword uses `searchQueries` and `/video`; hashtag uses `hashtags`. Hashtag mode supports selecting both platforms together.

Changing presets preserves the query for human editing. Words containing spaces are not silently converted into a hashtag. Invalid hashtags stop before submission. Restored platform selections remain intact while capabilities load. All UI copy remains English; original captions and names are preserved.

## Activation

The existing production policy already allows USD0.50 per TikTok run, USD0.25 per Instagram run and USD1 per session. TikTok keyword had a stale failed receipt from the earlier USD0.25 policy. Bounded live verification on 2026-10-06 returned one valid video, charged USD0.0047 and enabled `clockworks~tiktok-scraper:keyword:default` on build `0.0.612`. Run ID: `RjDbxjKhDbctj69xN`. Existing hashtag/profile/comment gates are preserved.

The capability API now compares failed minimum-charge receipts against the current platform cap; satisfying a cap does not automatically count as verification. The verifier now includes the previously omitted TikTok keyword contract. No budget policy was increased.

## Local execution

Docker Desktop was stopped. Starting it restored the existing `sportbookingplatform-redis-1` container at localhost:6379. `npm run worker:scout:start` starts the Scout consumer. Keep Docker and the worker running while collecting content. Producer and consumer use the existing `SOCIAL_SCOUT_REDIS_URL`.

## Evidence and limits

- 48 focused tests passed, including stale policy and platform activation regressions.
- Source/tooling typecheck and frozen production build passed.
- An isolated, removed UI fixture used live capability data and simulated submission. It verified restored TikTok selection after delayed loading, TikTok keyword payload, Instagram hashtag payload and invalid-hashtag rejection.
- Native Chrome Hoang (`hoangle27333`) showed the real admin session with TikTok keyword enabled and both flow presets. Screenshot: `artifacts/content-flows/live-admin-modal.png`.
- Provider verification receipt: timestamped file under `artifacts/apify-runtime/`.
- Bounded content pipeline acceptance is recorded in `artifacts/content-flows/runtime-receipt.json`. Resume its exact session IDs with `tsx --env-file=.env.local tooling/scout/verify-content-flows.ts --run`; it does not create replacement runs after a paid start.
- Posts still require exact query matches, publication within the retrieval window and observed target geography. Zero accepted posts is distinct from provider failure. A verified capability does not guarantee search relevance or coverage.
- Live content acceptance completed successfully for both platforms with settled USD0 reported charges. Instagram returned 5 observations, all unverified by eligibility gates. TikTok returned 5 observations: 4 excluded and 1 unverified. These samples saved no posts; provider execution and durable completion are proven, while insertion/reload for newly matched trend posts remains unproven.
- Remote application deployment and mobile layout verification are not claimed.

Provider input references: https://apify.com/clockworks/tiktok-scraper/input-schema and https://blog.apify.com/scrape-instagram-posts-comments-and-more-21d05506aeb3/
