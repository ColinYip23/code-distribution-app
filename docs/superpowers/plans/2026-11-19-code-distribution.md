# Code Distribution App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task after the user approves the design. Steps use checkbox (`- [ ]`) syntax for tracking. Execution/delegation has not been selected or authorized by this planning request.

**Goal:** Build a private app that imports purchased codes, safely fulfils client orders, exports assigned codes, and creates independently customizable Excel invoices.

**Architecture:** A Next.js application uses authenticated server operations and Supabase Auth, PostgreSQL, and private Storage. PostgreSQL functions own atomic allocation and invoice issue/link transitions. XLSX artifacts are generated from committed snapshots through retryable operations.

**Tech Stack:** Proposed Next.js, React, TypeScript, Tailwind CSS, Supabase, Zod, a decimal arithmetic library, ExcelJS conditional on template compatibility, Vitest, Playwright, and database integration tests. Select compatible supported versions during setup and lock them; these are proposed tools, not installed dependencies.

**Spec:** [Proposed project design](../specs/2026-11-19-code-distribution-design.md). Read the spec and this plan together. All listed source/test files are proposed new files; the workspace currently contains no app.

## Ordered implementation checklist

This is the practical build sequence. The detailed tasks below supply interfaces, file boundaries, and behavioral checks. The Excel template is needed to finish invoice rendering; inventory and order work can proceed while it is unavailable. Run the template compatibility work as soon as the workbook arrives, after basic project tooling exists.

1. [ ] **Record the initial business rules.** Use the proposed internal, owner-operated workflow as the starting point. Record required client identifiers, product attributes, currencies, quantity/price rules, code uniqueness namespace, expected import/order sizes, and invoice override behavior. **Done when:** these decisions are explicit in the design and sanitized sample inputs are identified.
2. [ ] **Scaffold the app and development checks.** Create the Next.js/TypeScript/Tailwind project, feature directories, environment example, and scripts for type checks, lint, unit/integration/database/browser tests, and production build. Add the Supabase client, validation, decimal arithmetic, and conditional XLSX dependencies. **Done when:** the empty app runs locally and its configured baseline checks run successfully.
3. [ ] **Create the development database and migration foundation.** Create the business/member, product/client, inventory, and order tables with foreign keys, unique code identities, positive quantity checks, exact numeric prices, timestamps, and indexes. Add invoice tables with their feature migration later. Use migrations rather than undocumented dashboard edits. **Done when:** a clean development database can be rebuilt reproducibly from migrations.
4. [ ] **Implement login and database authorization.** Provision the owner, disable public signup, verify sessions on server actions/downloads, enforce active membership with RLS, and protect direct database functions and private files. Restrict direct allocation-state writes. **Done when:** owner access works and anonymous/non-member access fails, including requests that bypass the UI.
5. [ ] **Build business settings and products.** Add business billing/payment details and product create/edit/deactivate screens, default prices, validity information, and low-stock thresholds. **Done when:** products such as 5GB and 20GB can be managed without code changes.
6. [ ] **Build client management.** Add searchable clients, billing/contact details, TIN/registration strings, payment terms, archive behavior, and a client-detail screen ready for order/invoice history. **Done when:** create/edit/archive works and identifiers preserve leading zeros.
7. [ ] **Build paste import first.** Select a product, paste codes, preview validity and duplicates, confirm accepted rows, record batch metadata, and show inserted/skipped counts. Enforce uniqueness in the database and request idempotency. **Done when:** 100 valid codes add 100 rows and a retry adds zero.
8. [ ] **Add CSV/XLSX imports.** Reuse the same validation/confirmation pipeline, add column/product mapping and row limits, preserve text values, and reject ambiguous numeric or formula-valued code cells. **Done when:** equivalent paste/file inputs produce the same inventory, and invalid rows have clear rejection reasons.
9. [ ] **Build inventory views.** Add product stock totals, pagination, filters, purchase-batch details, expiry exclusion, default code masking, and audited voiding of unallocated codes. **Done when:** displayed eligible counts reconcile with actual code records.
10. [ ] **Build draft orders.** Select the client, add one or more product lines, validate positive integer quantities, edit prices, show advisory stock counts, and save drafts without consuming inventory. **Done when:** draft edits leave all code states unchanged.
11. [ ] **Implement and test atomic allocation.** Add the locked database operation described in Task 4. Allocate exact quantities for every line, preserve request identity, capture snapshots, and reject all lines together on stock shortage. **Done when:** concurrent orders cannot share codes, retries return existing assignments, and shortage changes no stock.
12. [ ] **Build code output and history.** Add codes-only and formatted-message copying, authorized XLSX downloads, stable assignment retrieval, manual sent marking, and safe cancellation. **Done when:** repeated output actions preserve assignment IDs and stock counts; failed exports can be retried. This is the first usable distribution milestone.
13. [ ] **Prove invoice-template compatibility.** Inspect the supplied workbook, map fields and repeating rows, determine overflow behavior, round-trip it through the chosen renderer, and visually compare the result in Excel. **Done when:** the template mapping and renderer are documented and agreed layout checks pass. Perform this earlier when the workbook is available.
14. [ ] **Build invoice drafts and exact calculations.** Add invoice migrations and a separate editor for client selection, linked orders/manual lines, number, dates, quantities, prices, discounts, configured taxes, explicit adjustments, and billing overrides. Compare invoice values with linked orders and require mismatch acknowledgement. **Done when:** exact totals pass calculation checks and invoice edits never mutate inventory.
15. [ ] **Implement invoice issue and Excel download.** Reserve unique numbers and active order links transactionally, freeze issued snapshots/template versions, render into private storage, and retry failed artifacts against the same revision. Add void/replacement rules and preserve issued outputs. **Done when:** number/link races, upload failure, and later client/template changes cannot corrupt or duplicate an issued invoice.
16. [ ] **Add manual payment records.** Track unpaid/partial/paid balances and due dates; retain audited reversals for mistaken entries. Reject overpayments and payments on draft/void invoices; prevent voiding invoices with applied payments. **Done when:** outstanding amounts reconcile with payment entries and correction rules are enforced.
17. [ ] **Build dashboard and complete the workflow checks.** Show stock warnings, recent orders, uninvoiced orders, and unpaid/overdue invoice amounts. Keep order and invoice totals distinct. Run the end-to-end import -> allocate -> export -> invoice -> payment scenario plus access, concurrency, and recovery checks. **Done when:** all required checks pass on staging with representative data and realistic limits.
18. [ ] **Prepare operations, pilot, and release.** Configure separate production credentials, private storage, sanitized error reporting, database/file backups, a demonstrated restore procedure, and a deployment runbook. Pilot with a small real batch and client before full inventory. **Done when:** stock reconciles, sample workbooks are approved, recovery is demonstrated, and the app is ready for the authorized production release.

## Global Constraints

- One business initially; invite-only operator access; no client login in the initial release.
- Every business-owned record carries `business_id`; references enforce that clients, products, orders, codes, and invoices belong to the same business.
- Quantities are positive integers. Monetary values use PostgreSQL exact numeric fields and decimal arithmetic, never floating-point JavaScript calculations.
- Preserve case, leading zeros, internal spaces, and hyphens in code values; trim surrounding whitespace only.
- Allocate all requested lines in one database transaction; if any line lacks eligible stock, allocate nothing.
- Repeated copy/download actions fetch existing assignments. Cancellation never automatically restocks codes.
- Invoice changes never allocate, return, or alter codes. Issued snapshots and completed workbooks are immutable.
- An order can appear on only one non-void invoice; partial invoicing is deferred. Manual invoices are visibly unlinked.
- Secret/service keys remain server-side; private files require authorization. No raw code values in logs or audit metadata.
- Compute authoritative invoice values in application code; do not depend on ExcelJS evaluating spreadsheet formulas.
- Implementation must begin only after design review. This document contains no claim that tests or template checks have been run.

## Review Focus

- Two operators compete for final stock or retry after a timeout: exactly one allocation per code/request, with no partial multi-product order.
- Two imports contain the same code under different products, or ambiguous numeric cells: reject duplicates/ambiguity without corrupting existing inventory.
- A non-member calls a database function or private download directly: deny access even if the UI is bypassed.
- An invoice has different quantities from its orders, or rendering fails after issue: require the stated acknowledgement and preserve the issued identity on retry.
- Long identifiers/addresses, formula-like strings, and template revisions: preserve literal values, agreed layout, and historical outputs.

## Proposed file boundaries

| Path | Responsibility |
|---|---|
| `app/(auth)/login/page.tsx` | Operator login |
| `app/(dashboard)/{page,inventory,products,clients,orders,invoices,settings}` | Dashboard pages and feature routes |
| `app/api/orders/[id]/export/route.ts` | Authorized committed-order XLSX download |
| `app/api/invoices/[id]/export/route.ts` | Authorized issued-artifact download/retry |
| `src/lib/auth/require-member.ts` | Verified active business membership |
| `src/lib/supabase/{server,browser}.ts` | Session-aware clients, no browser secrets |
| `src/features/{clients,products,inventory,orders,invoices}/` | Feature schemas, server actions, data access, focused UI components |
| `src/features/inventory/import.ts` | File parsing, preview, normalization |
| `src/features/orders/export.ts` | Literal-text copy/XLSX payloads |
| `src/features/invoices/{calculate,template,render,artifacts}.ts` | Decimal amounts, mapping, workbook generation, artifact retry |
| `src/features/settings/` | Company profile, numbering, template configuration |
| `src/shared/contracts.ts` | Shared IDs, decimal-string values, typed errors/results |
| `supabase/migrations/*.sql` | Tables, constraints, indexes, RLS, privileged operations |
| `supabase/tests/` | Real database tests for authorization, constraints, concurrency |
| `tests/{unit,integration,e2e,fixtures}/` | Behavioral tests and sanitized sample inputs |
| `docs/operations.md` | Setup, deployment, retries, backup and restore |

Directory braces in this table indicate proposed sibling paths, not literal filenames. Split UI files by workflow rather than putting a whole feature into one page.

## Shared interface decisions

- IDs are UUID strings; `Money` is a base-10 decimal string with two minor-unit digits. Currency is explicit, initially limited to currencies with two minor units.
- `requireMember(): Promise<{ userId: string; businessId: string; role: 'owner' | 'staff' }>` derives membership from the verified session, never from a submitted actor/business ID.
- `OrderLineInput = { productId: string; quantity: number; unitPrice: Money }`; `OrderResult = { orderId: string; status: 'draft' | 'allocated' | 'sent' | 'cancelled' }`.
- `ImportPreview` returns row indices, preserved text values, accepted/rejected flags, and structured error reasons without committing stock.
- `InvoiceLineInput = { description: string; quantity: number; unitPrice: Money; discount: Money; taxRate: string }`; `InvoiceTotals = { subtotal: Money; discount: Money; tax: Money; adjustment: Money; total: Money }`.
- `IssuedInvoiceSnapshot` contains immutable billing/company fields, invoice lines/totals, currency, dates, number, linked order IDs, mismatch acknowledgement, and template version.
- Server mutations validate schemas and return typed domain failures: `VALIDATION_ERROR`, `FORBIDDEN`, `INSUFFICIENT_STOCK`, `DUPLICATE`, `INVALID_STATE`, and `ARTIFACT_PENDING`. Unexpected failures use a correlation ID without sensitive values.
- Each feature owns its actions and routes; all cross-feature consumers use these contracts or committed database records, not client UI state.

## Task 1: Settle inputs and prove template compatibility

**Files:** Create minimal project/tooling files (`package.json` and test configuration), `docs/template-mapping.md`, `tests/fixtures/README.md`, `tests/integration/invoice-template.test.ts`, `src/features/invoices/template.ts`.

**Consumes:** The supplied invoice workbook and representative code files, once available. No workbook is presently available.

**Produces:** A versioned `TemplateMapping` contract: worksheet, header cell mapping, first line row, styled line-row pattern, maximum rows/overflow behavior, totals mapping, print settings, and renderer choice.

**Scheduling:** Establish project/test tooling before running this experiment. If the template is unavailable, proceed with Tasks 2-5 and Task 6 draft/calculation work using an unresolved draft template reference. Invoice issue in Task 6 and rendering in Task 7 must wait for an approved compatible template. Draft creation must not require issuing a workbook.

- [ ] Confirm the proposed defaults that change scope: internal users, code uniqueness namespace, currencies, invoice linkage, expected import/order sizes, and rounding/tax inputs.
- [ ] Establish the minimal package/test setup needed for the compatibility experiment, then retain it as the foundation for Task 2 rather than scaffolding twice.
- [ ] Inspect the workbook and agree field mappings and line overflow behavior; use sanitized copies as fixtures. Record whether the file is XLSX, legacy, or macro-enabled.
- [ ] Create compatibility assertions: `001234567890123456` and `=ABCD` remain text; invoice values land in agreed cells; merged ranges/logo/print area survive; maximum line count behaves as specified.
- [ ] Run the compatibility test using a small ExcelJS round-trip experiment, then inspect its output in Excel. If it fails, select and document an alternative before proceeding with invoice rendering.
- [ ] Record the actual supported template/version/limits and the user's settled scope in the design. Commit this bounded compatibility work only during authorized implementation.

## Task 2: Secure foundation, company settings, products, and clients

**Files:** Create `package.json`, app/config files, `src/lib/auth/require-member.ts`, `src/lib/supabase/server.ts`, `src/lib/supabase/browser.ts`, `src/shared/contracts.ts`, feature schemas/actions/pages for settings/products/clients, `supabase/migrations/001_foundation.sql`, `supabase/tests/access.test.sql`.

**Consumes:** Approved design and settled core business rules. Actual workbook compatibility is required for invoice rendering, not for this foundation task.

**Produces:** `requireMember()`; `saveClient(input): Promise<{ clientId: string }>`; `saveProduct(input): Promise<{ productId: string }>`; company profile settings; configured migrations and test commands.

- [ ] Complete the app/config/dependencies and scripts, reusing any tooling created in Task 1: `typecheck`, `lint`, `test:unit`, `test:integration`, `test:db`, `test:e2e`, and `build`. These command names are the intended verification contract.
- [ ] Write database access tests first: anonymous and signed-in non-members receive no data and cannot mutate it; active owner can access only its business; cross-business foreign-key references fail.
- [ ] Implement Auth, explicit owner provisioning, disabled public signup, server authorization, RLS/storage policies, protected navigation, and company/product/client forms. Preserve TIN/registration values as strings; archive referenced records.
- [ ] Run `npm run test:db`, `npm run typecheck`, and a login/create/archive client smoke check. Expected: denied unauthorized requests and preserved leading-zero identifiers.
- [ ] Commit the working secured foundation; document environment variable names without actual secrets.

## Task 3: Inventory import and stock views

**Files:** Create `src/features/inventory/{schema,import,actions,queries}.ts`, inventory UI, `supabase/migrations/002_inventory.sql`, `tests/unit/import.test.ts`, `tests/integration/import.test.ts`.

**Consumes:** `requireMember()`, products, business identity, confirmed input limits.

**Produces:** `previewImport(input): Promise<ImportPreview>` and `confirmImport({ previewToken, requestKey }): Promise<{ batchId: string; inserted: number; skipped: number }>`; paginated inventory/batch queries. The signed or stored preview token binds accepted data, product mapping, business, and expiry to prevent client tampering.

- [ ] Write tests: importing 100 unique 5GB and 50 unique 20GB codes yields counts 100/50; reimport yields zero additions; raced duplicates cannot bypass uniqueness; expired rows are excluded from eligible counts.
- [ ] Add fixtures proving trimmed outer whitespace, preserved case/zeros/internal characters, rejection of formula-valued and ambiguous numeric code cells, and literal formula-like text handling.
- [ ] Implement paste/CSV/XLSX mapping and preview, confirmation idempotency, per-row rejection report, batch metadata, indexed stock views, voiding of unallocated stock, and audit events.
- [ ] Run `npm run test:unit -- import` and `npm run test:integration -- import`; expected: exact stock counts and no duplicated code identity under retries/races.
- [ ] Commit the import workflow with the stated file/row limits visible to operators.

## Task 4: Orders and atomic allocation

**Files:** Create order schemas/actions/queries and pages, `supabase/migrations/003_orders_allocation.sql`, `supabase/tests/allocation.test.sql`, `tests/integration/allocation-concurrency.test.ts`.

**Consumes:** Membership, products, eligible code rows, `OrderLineInput`.

**Produces:** `createOrder({ clientId, currency, lines, notes }): Promise<OrderResult>`; SQL `allocate_order(order_id uuid, request_key uuid)` returning the committed order ID/state; `getOrderAssignments(orderId)` with stable product/code ordering; `markOrderSent(orderId)` and `cancelOrder(orderId, reason)`.

- [ ] Write tests first: 10 x 5GB and 3 x 20GB reduce 100/50 to 90/47; a short second line changes neither product; same request/order retries preserve all assignment IDs.
- [ ] Add real simultaneous-session tests for final stock, same-order concurrent confirms, reversed multi-product line order, and unauthorized RPC/direct state mutations. Assert no code is assigned twice and no partial order commits.
- [ ] Implement draft validation, immutable commercial/client snapshots at allocation, sorted product/order/code locks, exact quantity checks, persistent assignments, state transitions, and no automatic restocking after cancellation. Reject duplicate product lines or merge them deterministically before allocation.
- [ ] Run `npm run test:db` and `npm run test:integration -- allocation`; expected: disjoint assignment sets and exact counts in concurrent tests.
- [ ] Commit order allocation after database-level evidence passes; UI stock previews remain advisory.

## Task 5: Code copy and Excel export

**Files:** Create `src/features/orders/export.ts`, `app/api/orders/[id]/export/route.ts`, order result/history UI, `tests/unit/order-export.test.ts`, `tests/e2e/order-distribution.spec.ts`.

**Consumes:** Authorized `getOrderAssignments(orderId)` output; never an unallocated stock query.

**Produces:** `formatOrderCodes(assignments, mode: 'codes' | 'message'): string` and `renderOrderWorkbook(orderSnapshot, assignments): Promise<Uint8Array>`.

- [ ] Write assertions that two copies and two downloads leave inventory and assignment IDs unchanged; `001234567890123456`, `=ABCD`, and long codes round-trip as literal text cells without formula metadata.
- [ ] Implement grouped codes-only/message copying, browser clipboard fallback, private non-cached XLSX downloads, sanitized filenames, and client-safe fields (exclude cost/internal notes).
- [ ] Make network/export failures show a retry against the existing order. Audit export requests without code content and allow manual sent marking separately.
- [ ] Run `npm run test:unit -- order-export` and `npm run test:e2e -- order-distribution`; expected: exact stable codes, no additional allocation, and recoverable failure.
- [ ] Commit code fulfilment/export. This is the first usable operational milestone, even before invoicing ships.

## Task 6: Invoice drafts, linking, totals, issue, and payments

**Files:** Create invoice schemas/actions/queries/calculate/UI, `supabase/migrations/004_invoices.sql`, `tests/unit/invoice-calculation.test.ts`, `supabase/tests/invoices.test.sql`, `tests/integration/invoice-issue.test.ts`.

**Consumes:** Clients, allocated/sent order snapshots, company settings, `InvoiceLineInput`, template version.

**Produces:** `createInvoiceDraft({ clientId, orderIds }): Promise<{ invoiceId: string }>`; `saveInvoiceDraft(input)`; `calculateInvoice(lines, adjustment): InvoiceTotals`; SQL `issue_invoice(invoice_id uuid, request_key uuid)` returning immutable revision ID/number; `voidInvoice(invoiceId, reason)`; `recordPayment(input)`.

- [ ] Write decimal tests: quantity 3 at 0.10 totals 0.30; line 2 x 10.00 minus 1.00 discount at configured 6% tax yields 20.14; explicit -0.14 adjustment yields 20.00; excessive discount/negative total/unsupported currency is rejected. The 6% rate is a calculation fixture, not a legal default.
- [ ] Write integration tests: quantity override 10 -> 12 leaves 10 code assignments; mismatches require acknowledgement/reason; foreign-client/mixed-currency links fail; order linking and invoice numbers cannot be claimed twice under concurrency.
- [ ] Add payment-state assertions: reject payments on draft/void invoices and overpayments; block void when any unreversed payment remains; reversing a mistaken bookkeeping entry retains its audit history and is not recorded as a refund or transfer.
- [ ] Implement independent/manual and whole-order linked drafts, editable number/quantity/price/adjustment fields, comparison warnings, exact totals, document/payment state separation, and manual payments. Freeze a complete business/client/line/template snapshot on issue; record auditable void/replacement transitions and prevent number reuse.
- [ ] Run `npm run test:unit -- invoice-calculation`, `npm run test:db`, and `npm run test:integration -- invoice-issue`; expected: exact amounts, no inventory mutations, and immutable issued snapshots after client edits.
- [ ] Commit invoice business behavior before coupling it to file generation.

## Task 7: Template rendering and recoverable invoice artifacts

**Files:** Create `src/features/invoices/{render,artifacts}.ts`, `app/api/invoices/[id]/export/route.ts`, template settings UI, `supabase/migrations/005_invoice_artifacts.sql`, `tests/integration/invoice-artifact.test.ts`.

**Consumes:** `IssuedInvoiceSnapshot`, Task 1 `TemplateMapping`, private Storage.

**Produces:** `renderInvoiceWorkbook(snapshot, templateBytes, mapping): Promise<Uint8Array>`; `ensureInvoiceArtifact(revisionId): Promise<{ state: 'ready' | 'pending' | 'failed'; path?: string }>`; authorized artifact retrieval. Rendering is isolated from issue/stock operations.

- [ ] Write failure tests first: issue commits but upload fails; retry keeps revision/number and assigns no stock; concurrent retries converge on one artifact record; a ready file is never overwritten by a new template version.
- [ ] Implement pending/rendering/ready/failed artifact state with safe claim/retry handling and versioned object paths; use a worker only if measured runtime/size requires it. Downloads verify membership before serving private files.
- [ ] Write authoritative literal values and decimal totals into mapped cells; support the agreed line overflow behavior. Add preview of saved business values without claiming pixel-perfect browser rendering.
- [ ] Run `npm run test:integration -- invoice-artifact` and Task 1 compatibility tests; inspect actual generated workbooks in Excel for long addresses, maximum lines, page breaks, logo, and totals. Expected: agreed layout and identical archived issued content after master-data edits.
- [ ] Commit artifact generation only after template fidelity and failure recovery both pass.

## Task 8: Dashboard, operations, pilot, and release

**Files:** Create dashboard/report queries and UI, `tests/e2e/core-workflow.spec.ts`, `docs/operations.md`, deployment configuration and CI.

**Consumes:** Committed inventory/order/invoice/payment records and audit events.

**Produces:** Stock/low-stock/recent-order/uninvoiced/unpaid views, documented deployment and recovery, a tested pilot release.

- [ ] Add the end-to-end scenario from the design: import 100/50 -> allocate 10/3 -> repeated exports -> invoice override -> issue/download -> edit client -> re-download unchanged invoice.
- [ ] Verify dashboard distinguishes invoice totals from order values, computes outstanding/overdue from payments, and paginates large records. Exercise confirmed maximum file/order sizes with sanitized fixtures.
- [ ] Set up separate staging/production environments, secrets, authorization-safe error reporting, release migrations, and a database/private-file backup and restore procedure. Restore sample invoice artifacts together with their records to demonstrate recovery.
- [ ] Run the appropriate full release checks once: `npm run typecheck`, `npm run lint`, `npm run test:unit`, `npm run test:db`, `npm run test:integration`, `npm run test:e2e`, `npm run build`. Resolve failures before pilot; repeat only checks affected by subsequent changes.
- [ ] Run a small operator pilot, reconcile inventory/assignment/invoice counts, record template sign-off, and deliver the deployment/runbook. Production publication is a distinct action after the implementation is reviewable.

## Deferred extensions

Client portal, provider API/redemption checks, automatic sending, customer-specific price lists, partial billing, credit notes/refunds, payment gateways, PDF rendering, government e-invoicing, returns/replacements, multiple template designer, and multi-business UI are separate future plans.

## Handoff

Review the proposed workflow defaults and gather sample code files. The invoice template is required for final rendering work; it does not block inventory/order development. No build, dependency installation, Supabase project creation, deployment, or purchase has been performed by this planning task. Once the design is settled, follow the ordered checklist above, using the detailed tasks for implementation contracts and verification; inventory fulfilment can ship as an intermediate milestone before invoices.
