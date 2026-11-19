# Implementation status

Implemented locally: application shell, owner login/session refresh, Supabase schema/RLS/RPCs, business/product/client management, preview-bound imports, stock/batch views, order drafts/allocation/transitions/copy/XLSX, invoice drafts/calculations/linking/issue/void/snapshots, template upload/sample/verification, private artifact generation/retry, manual payment records/reversals, and dashboard summaries.

The repository originally had no code or initial commit. All changes are local files; Git metadata has not been modified.

## Review decisions and remaining scope

- No external Supabase credentials were supplied. An unconfigured workspace honestly shows empty state and blocks writes. Setup is documented in `README.md`.
- No actual invoice template was supplied. The renderer is verified only against synthetic workbooks; the real template and layout sign-off remain required before issuing operational invoices.
- Files contain a single product per import, with an explicit confirmation. Per-row mixed-product mapping from the proposed design is deferred; split those files before uploading.
- Artifact generation runs on demand when an issued invoice is first downloaded, rather than through a background worker. Retries use the same immutable revision.
- Database checks use real PostgreSQL behavior in PGlite with test Auth/Storage schemas. Hosted Supabase behavior, object uploads, and concurrent independent sessions still need the connected pilot.
- Database/file backup and restore are documented, not executed against a real project.
- Metadata queries fetch all pages and UI tables paginate. More selective server queries are a later scaling improvement; stock/code export correctness does not depend on a 1,000-row result cap.
- Staff administration is not exposed in the app UI. Initial owner provisioning is provided.

## Verification record

Verified locally: 35 Vitest checks, 7 Playwright checks in installed Chrome, TypeScript checking, ESLint, and a production Next.js build. Desktop/mobile screenshots were inspected. A fresh read-only review identified issues that were fixed and covered by regression checks where locally testable. Do not interpret these results as proof of a real Supabase deployment, independent-session concurrency, cloud artifact recovery, or actual-template approval.
