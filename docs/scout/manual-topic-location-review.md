# Manual topic and location review

The reviewer can edit Topic Relevance and Target Location in the experimental profile editor, then explicitly save with **Save topic and location**. Unsaved changes block approval. Saving does not approve or import the candidate; it clears only that candidate's prior decision and requires a fresh explicit approval.

This implements the user's explicit request to allow manual topic/location corrections, replacing the earlier experimental policy that only collected evidence could satisfy those two dimensions. Manual statements are labelled **Team review** and stored separately from provider observations, with authenticated reviewer, timestamp, criteria context and previous review history. They do not fabricate posts, profile location or follower/member counts.

The shared assessment replays applicable saved statements during review, reassessment and import without calling providers or a model. A changed topic/location context does not inherit the correction. New manual statements supersede older negative feedback for that context; newer negative feedback still excludes the candidate. Entity type and audience size remain independently enforced. Saving a type correction preserves the topic/location review.

Persistence uses an opaque revision in the existing session progress JSON as an optimistic concurrency guard; editing/importing an already imported profile is blocked. No database migration, provider run, model call or budget update is needed.

Validation: 503 tests / 64 files, Scout typecheck and production build. Both current and experimental browser fixtures passed. The experimental fixture covers editable unknown topic/location, unsaved-change approval blocking, save, reload, approval and import. Browser API responses were intercepted; this is not authenticated live-database approval/import proof.
