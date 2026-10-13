# Rejecting excluded Scout candidates

The review API called `profileReviewDecision`, which rejected every operation when the system assessment was `Excluded`. This also blocked explicit human rejection with “This candidate cannot be reviewed.” It confused system eligibility with the review decision.

The exclusion guard now applies only to approval. Reject and reset-to-pending work for excluded candidates; they do not require topic, type, geography, or audience confirmations. The system assessment stays excluded. Approval, import eligibility, owner checks, imported-candidate protection, and the optimistic review snapshot check remain enforced.

Regression coverage includes single and mixed-batch rejection through the actual Next.js route handler, saved decisions retained alongside the new rejection, audience/approval blocking, and imported-candidate blocking. No provider/model or CRM operations are required.
