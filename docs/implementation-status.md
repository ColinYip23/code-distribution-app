# Implementation status

Implemented locally: application shell, owner login/session refresh, Supabase schema/RLS/RPCs, business/product/client management, preview-bound imports, stock/batch views, order drafts/allocation/transitions/copy/XLSX, invoice drafts/calculations/linking/issue/void/snapshots, template upload/sample/verification, private artifact generation/retry, manual payment records/reversals, and dashboard summaries.

The repository originally had no code or initial commit. All changes are local files; Git metadata has not been modified.

## Review decisions and remaining scope

- Supabase credentials are present locally. URL handling now accepts a copied `/rest/v1/` endpoint and correctly uses the project root. Read-only connection checks confirmed the owner workspace; no key values were printed or committed.
- Five requested CME products were seeded with separate Onshore/Offshore SKUs. Existing prices are never overwritten; selling prices were not supplied, so new product defaults are zero.
- The actual VSAT XLS was inspected and converted privately. The sanitized template is installed in private Storage, with native letterhead/text drawings, bank details, signature and stamp preserved. A full nine-line sample was visually checked as a one-page print. It is fixed to MYR; no client invoice was issued.
- The sample supplier CSV was parsed read-only: `PAC`, validity, creation date, expiry and remark are supported. Original codes were not added to live stock. Source expiry is preserved, so already expired PACs cannot be allocated.
- Apply the additive `202611240001_cme_file_support.sql` migration for per-code metadata, client order references, template-currency enforcement, and expiry calculations using the Kuala Lumpur calendar. Live-schema application is checked separately and remains required until confirmed.
- Files contain a single product per import, with an explicit confirmation. Per-row mixed-product mapping from the proposed design is deferred; split those files before uploading.
- Artifact generation runs on demand when an issued invoice is first downloaded, rather than through a background worker. Retries use the same immutable revision.
- Database checks use real PostgreSQL behavior in PGlite with test Auth/Storage schemas. Live API reads, private template upload and anonymous-download denial were verified; authenticated operational workflows and concurrent independent sessions still need the connected pilot.
- Database/file backup and restore are documented, not executed against a real project.
- Metadata queries fetch all pages and UI tables paginate. More selective server queries are a later scaling improvement; stock/code export correctness does not depend on a 1,000-row result cap.
- Staff administration is not exposed in the app UI. Initial owner provisioning is provided.

## Verification record

Verified locally: 52 Vitest checks, 7 Playwright checks in installed Chrome, TypeScript checking, ESLint, and a production Next.js build. The continuation received a fresh read-only review; explicit shore-category matching and namespace-prefixed relationships were fixed with regression checks. Native invoice samples were visually inspected. Live API/private-storage checks do not establish independent-session concurrency or a complete authenticated operational pilot.

Minor follow-up: the native XML renderer's insertion-order support should be broadened before onboarding unusual third-party templates with later worksheet elements but no standard print nodes. The verified VSAT preset contains those nodes; its current output is covered by structural and native print checks.
