# Talent spreadsheet import

The supplied `Talent Database Raw.xlsx` was imported into production Supabase on 2026-10-11. Its SHA-256 is `483b53e507bfbb9bd7360f2a0dfeba37027c181b0ecef9fbd467618eab8ed0bb`.

97 source talent rows produced 95 CRM records after collapsing two repeated account URLs. All 85 pre-existing CRM records were preserved; the verified total after import is 180. Names, descriptions, source tiers, categories, hyperlinks, and row references are retained. Road and Trail map to Running / Marathon; Tri maps to Triathlon. Source tiers are recorded independently of follower-based CRM tiers. Missing geography stays Unknown. Missing followers, average views, and engagement retain the existing missing-metric markers instead of becoming observed zeroes.

The two Facebook share links remain unresolved. Their talents are in CRM with blank direct account URLs and original links in source notes. They are excluded from account review packets until their identity is resolved. One duplicate account has conflicting follower counts; its normalized followers remain unknown, with both source values preserved.

The private `scout-datasets` Supabase Storage bucket contains the original workbook, normalized source dataset, 93 account review packets, unresolved accounts, dataset status, CRM links, and import receipt under `talent/<source-sha256>/`. The same dataset is available locally under ignored `private/scout-dataset/talent-raw/`. It can be used by the existing review, feature-export, and training tools once the required review annotations are complete. It does not automatically change the Scout classifier or discovery results.

Spreadsheet descriptions and regions are editorial source context; they are not presented as scraped profile biographies or observed locations in model packets. Annotation labels, reviewer confirmations, and subject links remain blank. No provider calls, paid collection, model training, activation, or automatic review decisions occurred.

Reproduce the dry run:

```sh
npx tsx --env-file=.env.local tooling/scout/import-talent-dataset.ts --source='Database raw/Talent Database Raw.xlsx' --output=private/scout-dataset/talent-raw
```

Add `--apply` only for an explicitly authorized system import. Canonical account identity and stable IDs prevent duplicate insertion; matched existing CRM fields are never overwritten. Source files are immutable and their bytes are checked after storage download. The importer verifies CRM fields after writing and records an audit entry. Private data is excluded from Git and deployment.

Verification: source reconciliation, focused normalization tests, Scout typecheck, storage download comparison, CRM field read-back, and pre-existing row comparison passed. The production browser required sign-in, so authenticated UI display was not independently verified in this import.
