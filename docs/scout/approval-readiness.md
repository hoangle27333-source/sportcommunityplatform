# Visible approval blockers

The latest saved badminton experimental sessions cannot be approved because all 28 profiles have unknown geography, 27 have unknown topic, and eight fail the audience range. Four profiles in the reassessment have a confirmed account type; that does not qualify the remaining dimensions.

The UI previously disabled Approve with a generic tooltip while allowing experimental topic/location confirmations that the server does not accept as evidence. It now renders an accessible Approval is blocked list, including unsaved account type, unknown/wrong type, missing/out-of-range audience, topic/location evidence and exclusion. Tooltip and single/batch readiness use the same blocker function. Experimental topic/location selectors reflect saved evidence and cannot imply a manual bypass. Legacy review confirmations remain available.

Verification: 494 tests / 62 files, Scout typecheck, production build, and both current/experimental browser fixture flows. Fixtures cover qualified approval, unknown evidence despite manual confirmations, draft type blocking, saved type/reload, missing topic/geography explanations, and read-only experimental evidence fields. Live provider/model/CRM calls: zero. Session inspection was read-only.
