# Scout account assessments (policy 5)

## Implemented behavior

New discovery plans explicitly request policy 5. Legacy requests remain on their previous policy. A service-only policy RPC prevents collection before the additive account migration is available.

Settings become inspectable provider filters, query hints, and local verification steps. Only immutable verified Actor builds and verified optional capabilities are used. No provider calls start when opening the form. Queries include neutral personal-account topic searches, organizational/commercial hints, and broader geography rounds. Collection stops at the approved budget, row/hydration limits, exhausted plan, or qualified target.

Entity and geography assessments are independent of topic. Taxonomy is Individual, Community, Club, Brand/Business, Media/Event, Other, Unknown. Clear own-account commerce takes priority; a sponsored post alone does not establish Business. Group structure alone establishes Community, not Club. Reviewer corrections take priority and recompute eligibility, counts and groups. Business/Media/Other stay visible in Scout and cannot use the current CRM imports. Club and Community retain their subtype. Account followers and club membership are stored separately.

Discovery and Broaden Search include an optional **Minimum followers** setting. Empty or zero disables the threshold; otherwise an observed account follower count must be greater than or equal to it. Below-threshold profiles are inspectable exclusions; missing counts require verification and cannot be approved/imported until evidence meets the minimum. Group membership never substitutes for followers. Plans hash and persist the setting, expose it as local verification, and use it when counting qualified results in adaptive retrieval. Unsupported Apify filters are not sent. Corrections, reloads and saved-evidence reassessment preserve the threshold; server approval/import guards prevent a saved approval bypass. Input accepts integers from 0 through 1,000,000,000. Regression coverage includes the inclusive boundary, unknown/zero counts, membership separation, plan hashing, schema validation and preview/import behavior. Local verification: 382 tests across 49 files and typecheck passed.

Geography uses profile location or structured geotags/check-ins in up to ten deduplicated, dated, owned posts. Reposts and another account's posts do not establish location. Posts are sampled without keyword, engagement or content-search date filtering. Caption mentions remain reviewable and require explicit confirmation. Profile location is preserved. Unverified latest ordering, missing dates, fewer than ten posts, missing capabilities, or insufficient budget produce partial coverage rather than inferred completeness. Group member posts do not establish the group's geography.

Saved-evidence reassessment creates a new assessment session without provider starts. Plan hashes, classifier checkpoints and reassessment identities include model revision and mode (`off`, `shadow`, `active`). A repeated reassessment under the same policy reuses its child; a different policy creates a different child and preserves the original results/reviews. Queued work with a stale policy stops with `MODEL_POLICY_STALE` before collection; reassess saved evidence or review a new collection plan. Candidate assessments retain the policy key. Additional collection requires a new reviewed plan. Review/import state is protected by snapshot comparison and import leases; completed imports are not rewritten.

## Saved-session export (read-only)

A completed account-discovery session can be exported directly without recollection:

```sh
npx tsx --env-file=.env.local tooling/scout/export-account-session.ts --session=SESSION_UUID --owner=OWNER_UUID --output=private/scout-dataset/review-packets.json --runs-output=private/scout-dataset/provider-runs.json
```

The operator supplies the actual owner/session UUIDs. Export requires that owner match and a completed successful preview session. It reads only final saved provider rows, combines profiles/detail evidence and owned posts, and retains account/source-session references. Original provider runs remain unchanged. Review labels stay blank, and completeness is not inferred from keyword hits or an unverified post ordering. Output files are new private files; keep them out of Git. The read-only command was run against the two owned production sources described below.

## Reviewer dataset preparation

There is no reviewer-confirmed dataset yet. Prepare packets from a JSON array of saved normalized `SocialProfile` evidence:

```sh
npx tsx tooling/scout/prepare-account-review.ts --input=private/scout-dataset/saved-profiles.json --output=private/scout-dataset/review-packets.json
```

This command preserves names, bio and posts, computes the evidence hash, and shows a separate rule proposal. It never assigns a training label or reviewer identity. It refuses duplicates, source overwrites and overwriting an existing review file. Reviewers fill `annotation.label`, `subjectKey`, `reviewers`, `confirmedAt` and the actual `evidenceUrls` they checked. Use the same subject key for the same real-world entity across accounts/platforms. Two reviewers must agree on test examples. Keep Unknown/sparse/conflicting cases for a separate benchmark; do not turn them into confident training labels. `geographyAnnotation` records separately reviewed location observations. Only confirmed annotations can proceed to feature export.

Validate reviewer packets without loading the encoder:

```sh
npx tsx tooling/scout/verify-account-dataset.ts --input=private/scout-dataset/reviewed.json --output=private/scout-dataset/dataset-status.json
```

The offline report identifies missing annotations, stale evidence hashes, duplicate accounts, incomplete reviews and missing platform/class slices. Unknown labels stay separate from the six-class training set. Training-input readiness requires 900 reviewed records and at least 50 in each platform/class slice; this is not model-quality acceptance. The trainer independently enforces subject-disjoint splits and two reviewers on test labels. Feature export rejects unconfirmed or invalid records before loading the encoder, verifies the pinned encoder manifest and all artifact checksums, and refuses to overwrite existing output. No command assigns reviewer labels or enables a model.

## Local model and activation

`SCOUT_ACCOUNT_MODEL_MODE=off` is the default. Rules remain available. `shadow` attaches model scores while retaining rule decisions. `active` requires the manifest's quality gate, runtime gate and test receipt; unavailable active inference becomes uncertain and requires verification. Scores are not claimed as measured probabilities of correctness.

The frozen encoder is multilingual MiniLM, quantized ONNX. Shared export/inference preprocessing chunks each source to 128 tokens, averages profile and up to five latest post sources, and appends missing-source masks (770 features). Model files are local, checksum checked, immutable, ignored by Git, and traced into relevant Node functions. Inference never downloads a remote model. Evidence hash and model revision fence checkpoints/cache. A hosting change is not automatic.

Prepare local artifacts:

```sh
node tooling/scout/prepare-account-encoder.mjs
```

Reviewer-authored JSON records must contain `profile` and `annotation` with `label`, `subjectKey`, `reviewers`, `confirmedAt`, `evidenceUrls`, and current `evidenceHash`. Cross-platform accounts of the same subject share `subjectKey`.

```sh
npx tsx tooling/scout/export-account-features.ts --input=private/scout-dataset/reviewed.json --output=private/scout-dataset/features.json --model=models/scout-account --revision=2c4055b12046f11709e9df2c122e59ffbdc2f900
python3 tooling/scout/train-account-classifier.py --input=private/scout-dataset/features.json --output=models/scout-account --version=account-model-1
npx tsx tooling/scout/benchmark-account-model.ts --model=models/scout-account --input=private/scout-dataset/five-reviewed.json --output=private/scout-dataset/runtime.json
```

Training requires numpy/scikit-learn and at least 900 reviewed accounts, at least 50 for each of six classes across three platforms. Subject-disjoint train/calibration/test splits and two test reviewers are enforced. Thresholds use calibration data. The script reports confusion matrix, macro-F1, confidence coverage and per-platform/class precision; quality targets are 0.80 macro-F1, 0.60 coverage, and 0.90 precision with sufficient samples. It leaves runtime gate false. A local timing receipt cannot authorize activation: validate the actual Vercel preview bundle below 250 MB, peak RAM below 1.5 GB, cold first batch below 60 s and warm batch below 15 s before recording a reviewed runtime gate. Additional geography accuracy and sparse/conflicting-case annotation are still required for rollout acceptance.

Optional Actor options, including latest-profile-post ordering, remain disabled unless the existing pinned build has a capability receipt. Observed date sorting alone does not prove that the returned posts are the account's latest ten. Verify against an independently reviewed latest-post reference before setting `latestProfilePosts` in its receipt. Never change the Actor/build to make verification pass.

## Verification and remaining release gates

Local verification passed 374 tests across 48 files, TypeScript checking, production build, and the real-component UI fixture (settings, evidence, correction, filtering, approval; intercepted APIs). Model-policy tests cover mode/revision changes, separate reassessment children, preserved source evidence and stale queued jobs with zero provider starts. Dataset tests cover pending annotations, stale reviews, duplicate accounts and Unknown cases; the CLI test verifies pending-data rejection before opening model artifacts. Bundle checks reject unused CUDA/TensorRT providers.

Unit/integration tests cover account rules, own-account latest-post selection, geotag vs caption geography, version compatibility, model dimensions/fallback, plan mapping, stored-evidence reassessment, and bounded hydration. The UI fixture uses the actual Scout component with intercepted API responses and zero live provider/import calls:

```sh
SCOUT_PLAYWRIGHT_PATH=/path/to/playwright/index.mjs SCOUT_CHROME_PATH=/path/to/chrome node tooling/scout/verify-account-ui.mjs
```

The additive migration was rehearsed twice on disposable PostgreSQL, including subtype/follower constraints and service-only policy access. Local ONNX encoder smoke produced 770 finite features in about 2.6 seconds with about 726 MiB maximum RSS. This is not a trained-classifier benchmark or a Vercel runtime receipt. The initial trace was about 293 MiB because it kept ONNX binaries for multiple operating systems. Build tracing now retains native binaries only for the build target and includes encoder artifacts in Workflow 5.2's combined flow/step route. Local macOS traces are at most 192.71 MB; a Linux-x64-targeted trace built locally is at most 188.47 MB. Both pass the conservative 250,000,000-byte encoder-only trace check, not deployment acceptance. The classifier manifest is absent because no reviewed classifier has been trained. The strict release check intentionally fails until that manifest is present.

No production migration, paid provider probe, deployment, CRM mutation, reviewer dataset creation or model-quality claim is implied by local verification. Remaining release inputs are the real reviewed dataset, sparse/conflicting-case review, pinned-build latest-post capability receipts, rule/model and geography benchmarks, preview runtime/bundle receipt, then shadow evaluation and controlled activation. Rollback sets model mode to off; old CRM records are not backfilled.

## Bundle and encoder smoke checks

```sh
npm run build
node tooling/scout/verify-account-bundle.mjs --encoder-only --output=artifacts/scout-account-qa/bundle-local.json
npx tsx tooling/scout/smoke-account-encoder.ts --output=artifacts/scout-account-qa/encoder-local.json
# Use without --encoder-only once the reviewed classifier exists:
node tooling/scout/verify-account-bundle.mjs --output=artifacts/scout-account-qa/bundle-release.json
```

The checker verifies the combined Workflow handler, Scout and reassessment traces, required artifacts, the target ONNX binding, absent foreign-platform bindings, missing files, and the 250 MB byte cap. Encoder-only receipts always retain `releaseReady=false` and `runtimeGate=false`. Synthetic smoke fixtures exercise five accounts with five captions each; they provide no classifier accuracy or reviewer labels. Cold timing includes encoder artifact verification. `SCOUT_ACCOUNT_BUILD_TARGET=linux-x64` supports offline trace verification on macOS; do not serve that build on macOS. Deployment builds default to their actual OS/architecture. Rebuild for the host after cross-target verification.

All route traces exclude foreign-platform ONNX binaries and unused CUDA/TensorRT providers, including routes that transitively import Scout outside the three inference endpoints. Configure `ONNXRUNTIME_NODE_INSTALL_CUDA=skip` for CPU-only Linux installs. Without CPU tracing, oversized route bundles can exceed Vercel's normal grouping budget and create too many isolated functions for Hobby. The rule-only production snapshot excludes the untrained local model directory; model mode remains explicitly off. Deploying rules does not satisfy the separate model preview/quality gates.

Actual Vercel preview packaging, cold/warm runtime, trained classifier, reviewed quality benchmark and geography acceptance remain outstanding. No budget/hosting change or automatic activation is part of these checks. The 250 MB limit is documented in [Vercel function limits](https://vercel.com/docs/functions/limitations); tracing uses [Next.js output tracing](https://nextjs.org/docs/app/api-reference/config/next-config-js/output).

Linux-x64 encoder smoke also passed in a disposable Node 22.23.3 Bookworm container (x64 emulated on the local arm64 machine, two CPUs, 1.5 GiB cap): five accounts × five captions, cold 5.57 s including checksum verification, warm 3.31 s, peak RSS about 536 MiB. Local macOS smoke was also below the timing/memory gates. These synthetic encoder checks exercise native loading and shared preprocessing only; they are not a Vercel receipt, classifier benchmark, or activation authority. Receipts: `artifacts/scout-account-qa/encoder-linux-x64.json`, `bundle-linux-target.json` and `bundle-local.json`.

## Independently verified latest-post sample

`tooling/scout/verify-latest-posts.ts` compares saved observations to a separately reviewed latest-post reference. The reference JSON contains `accountUrl`, `observedAt`, `reviewers`, `evidenceUrls` (including the original account URL), `allPublicPosts`, and `posts` with URL/publication date. It must identify ten latest owned posts, or explicitly verify the entire shorter public history. Reference and run observations must be within one hour.

```sh
npx tsx tooling/scout/verify-latest-posts.ts --run=private/scout-dataset/provider-runs.json --run-id=RUN_UUID --reference=private/scout-dataset/latest-reference.json --pinned-build=PINNED_BUILD_VERSION --pinned-build-id=OBSERVED_BUILD_ID --output=private/scout-dataset/latest-receipt.json
```

Use the pinned version and observed build ID from the existing core capability receipt; the version and ID are separate values. The check requires the matching Actor/task/account input, ten requested posts, valid dates, owned posts, exact agreement with the reviewed latest list, and no topic/date/geography/engagement filters or pinned-post exclusion. It rejects missing timestamps, reposts, wrong accounts, wrong builds, unparseable rows and incomplete references. TikTok must explicitly request latest `videos`. Date sorting alone never passes.

The result is a verification **proposal** (`capabilityEnabled=false`). This command neither calls Apify nor changes the capability ledger. Only after independently reviewing that receipt against the current core capability may an operator add `latestProfilePosts: true` and its reference/run receipt to that exact capability/build. No Actor/build switch, paid probe or production capability update was performed here.

## Rule-only production rollout — 2026-10-11

The user authorized deployment. Final deployment `dpl_9vPXCdfceckmToNaFfibdYAUf1P5` is Ready and aliased to [production Scout](https://sportcommunityplatform.vercel.app/scout). [Deployment inspector](https://vercel.com/hoang-le2/sportcommunityplatform/9vPXCdfceckmToNaFfibdYAUf1P5).

- Applied the additive account-assessment migration to Supabase project `xfqwxehetbjofoaygeqj` using the authenticated SQL Editor. Independent service API reads verified all new columns and policy version 5. Policy RPC privileges are anon=false, authenticated=false, service_role=true. Existing CRM records were not backfilled.
- Explicit production configuration is `SCOUT_ACCOUNT_MODEL_MODE=off`, `SCOUT_ACCOUNT_MODEL_REVISION=rules-5`, `ONNXRUNTIME_NODE_INSTALL_CUDA=skip`. The snapshot contains application sources, configuration and public assets; credentials, private datasets, model weights and QA artifacts are excluded. A workspace upload was canceled before deployment; final release used the reviewed snapshot.
- The first deployment was rejected by Hobby's 12-function limit. CPU-only tracing across all routes and skipped CUDA installation restored normal function grouping; the final hosted build and deployment passed without upgrading the plan or changing hosting/budgets.
- Authenticated UI verified the seven English account-type choices, latest-10 geography mode, neutral Individual and separate Club query branches, provider/search-hint/local-verification labels, and the unchanged USD 1 session cap. No collection was submitted.
- Saved HYROX source `4cc9de34-2d4d-4ae7-96a2-6e39cc79ac2c` reassessed through hosted Workflow `wrun_41M4NSH2Q80GJ3E8SXSRP1HGKT` into child `7f8d0917-ab3c-5075-a311-6d5f577933da`: 0 qualified, 11 unverified, 19 excluded across 30 inspectable accounts. Suggested types were 2 Media/Event, 3 Brand/Business, 1 Community, 1 Club and 23 Unknown. These are rule suggestions, not reviewed labels or measured accuracy. All 30 geography samples remain partial. Repeated reassessment reuses the same child.
- Reloaded evidence and the Brand/Business filter were inspected in the actual production review screen. Business accounts remain visible and their import approval is disabled. Review/import decisions were not changed. Resuming a saved review now displays "Loading Saved Task" rather than implying new crawling.
- Source-session and provider-ledger hashes remained unchanged. Provider-run count stayed 111, KOL count 85 and community count 4; sessions changed 71 to 72 only for the saved-evidence child. The child has zero provider runs and reports `providerStarts=0`.
- Public login returns 200, unauthenticated valid plan/reassessment requests return 401, and the production Workflow fixture remains 404. Local verification: 374 tests/48 files, typecheck and build; final hosted build also passed compilation/type checks.
- Read-only source export produced 30 HYROX and 15 Running packets under `private/scout-dataset/`. Preflight reports 0 confirmed annotations, no invalid evidence records and all 18 platform/class slices still missing. These files are ignored by Git/deployment and have not been labeled automatically.

Receipts are in `artifacts/scout-account-qa/production-rollout.json`, `production-source-baseline.json`, `production-before.json`, `deploy-source-receipt.json` and `vercel-production-inspect.txt`.

This completes the rule-only release. The trained model remains off: reviewed labels, the accuracy benchmark, sparse/conflicting cases, geography acceptance, trained-model preview runtime/bundle receipts, shadow evaluation and controlled activation are still required. No latest-profile-post capability currently has an independently verified receipt; incomplete ordering remains partial. No paid collection, fresh-provider precision claim, budget increase or automatic CRM import occurred. Supabase's existing dashboard quota warning remains visible; service API reads were available during verification. No billing change was made.

## Minimum followers production update — 2026-10-11

Deployment `dpl_DKCxVf6Aki4Fs4gWR4KDmfzZow16` is Ready and aliased to production. The hosted build passed compilation and type checks. Authenticated UI verified the new optional setting, the 1,000-follower local-verification plan, and Broaden Search's 10,000-follower changes summary. The default USD 1 budget was unchanged. No collection was submitted, review decision modified, or CRM import performed. Public login returned 200; unauthenticated plan returned 401; production Workflow fixture returned 404.
