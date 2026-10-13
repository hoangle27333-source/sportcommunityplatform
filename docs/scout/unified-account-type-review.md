# Single account type review control

Profiles with an entity assessment now use only the account evidence panel's type selector and Save type correction action. The legacy Entity Type selector, type shortcut and duplicate classification feedback options are hidden for those profiles. Legacy profiles without an entity assessment keep their original single type editor.

Approval and import read the saved reviewed/suggested type rather than defaulting Unknown to the search target. A changed, unsaved type disables approval. Unknown type remains Unknown; saving type does not bypass missing topic, audience or geography evidence. Unknown geography displays Needs Location Verification and survives restoration; a confirmed mismatch remains separate.

Validation: 488 tests / 61 files passed, Scout typecheck and local production build passed. Browser fixtures for both current and experimental strategies passed, covering one type editor, unsaved-type approval blocking, correction persistence, reload, approval/import fixtures, and unknown topic/location retention. All fixture API calls are intercepted; no live provider/model or CRM calls.
