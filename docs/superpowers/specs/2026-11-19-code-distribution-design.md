# Code distribution app: proposed project design

Date: 19 November 2026. Status: proposal for review; no application has been built.

## Purpose and assumptions

Create a private web app for importing purchased codes, managing repeat clients, allocating codes to their orders, exporting those codes, and separately creating invoices using the owner's Excel template.

Proposed defaults, not confirmed requirements: one business, one owner initially, invite-only staff access, clients do not log in, codes are manually sent outside the app, and one currency per invoice. Product types are configurable rather than hardcoded to 5GB and 20GB. The invoice workbook has not yet been provided. This workspace is empty apart from Git metadata.

Success means that every imported code can be traced to its purchase batch and, once issued, its client order; the same code is never allocated twice; an old order can be exported repeatedly without consuming inventory; and invoice details remain independently editable.

## Approaches

1. **Recommended: Next.js/TypeScript app plus Supabase.** One application for the UI, server operations, and workbook generation; Supabase provides PostgreSQL, authentication, and private file storage. Database transactions handle allocation. This keeps the initial deployment small while supporting custom workflows.
2. **Separate frontend and backend service plus Supabase.** Useful if invoice processing requires specialized software or substantial background processing. More deployment and authentication work than the initial scope needs. Add a worker later only if the actual template or volume requires one.
3. **Low-code internal tool plus Supabase.** Can shorten initial form/table work but ties the allocation UI and template processing to another platform. Consider only if speed matters more than control over this custom workflow.

The recommendation is a proposal, not a recorded user choice. Framework/library versions and hosting will be selected and pinned at implementation after compatibility checks; no paid hosting tier is assumed.

## Screens and workflows

### Dashboard

Show available stock per product, low-stock warnings, recent orders, orders without invoices, and unpaid invoice totals. Keep issued invoice totals distinct from fulfilled order values; they can intentionally differ. Navigation: Dashboard, Inventory, Products, Clients, Orders, Invoices, Settings.

### Products

Create, edit, and deactivate product types: SKU, display name, data allowance/description, optional validity/provider, default selling price, and low-stock threshold. Price changes affect new orders only. Products referenced by stock or history are deactivated rather than deleted. Client-specific price lists are a later enhancement; per-order pricing is included initially.

### Clients

Manage display name, legal billing name, contact person, email, phone, billing address, country, TIN, company registration number, optional other tax identifiers, default currency/payment terms, and internal notes. Identifiers are strings so leading zeros and punctuation survive. Client detail pages show order/invoice history. Archive clients rather than deleting history. Invoice billing details can be overridden without modifying the client's saved profile.

### Import and inventory

Support paste (one code per line), CSV, and XLSX. For paste, choose a product for the batch. For files, allow column mapping; product can be selected for the whole file or mapped per row. Optional fields: supplier/reference, purchase date, unit cost, expiry, and batch notes.

Preview valid rows, malformed rows, duplicates within the upload, and codes already in the database. Import only accepted rows after an explicit confirmation and show actual inserted/skipped counts. The database enforces uniqueness even if two imports race. Retrying an import uses an idempotency key and cannot silently insert the batch twice.

Proposed deduplication scope is all codes within the business, including issued or void codes. If suppliers reuse identical strings for different code systems, explicitly define a provider namespace before building imports. Normalize surrounding whitespace only; preserve case, leading zeros, internal spaces, and hyphens unless a provider-specific rule is confirmed. Reject formula-valued XLSX code cells and ambiguous numeric code cells instead of guessing lost digits; ordinary formula-like text remains text.

Each code has an immutable original value and a state: `available`, `allocated`, or `void`. Expiry is a separate date; allocation excludes expired codes. Each row stores product, batch, cost if supplied, and allocation linkage. Product correction or voiding is restricted to unallocated inventory and audited. Inventory counts are derived from code rows, not separately editable counters. Do not claim to detect whether an issued code was redeemed without a provider integration.

### Orders and code distribution

1. Select an active client.
2. Add product lines, positive integer quantities, unit prices, and notes. Multiple products can be included in one order.
3. Display current eligible stock and calculated value. This is a preview, not a stock reservation.
4. Confirm allocation. Allocate all requested lines in one database transaction; if any line lacks eligible stock, allocate nothing.
5. Show the resulting immutable code assignments grouped by product.
6. Copy codes only, copy a formatted client message, or download an XLSX file. Code values are text cells, never formulas or numbers. Internal costs and notes are excluded from client exports.
7. Optionally mark the order as sent and create an invoice draft from it.

Allocation is the stock-consumption point, before codes are revealed. Use oldest-imported eligible codes first, with a deterministic ID tie-breaker. A future change can prioritize soonest expiry if needed. Repeated copy/download actions fetch existing assignments. Copy/download activity is not proof of delivery; `sent_at` is a manual record. If an export fails after allocation, the order and codes remain recoverable.

Orders transition from draft to allocated to sent, or to cancelled. Draft editing consumes nothing. Once allocated, product quantities and code assignments are immutable. Cancelled allocated orders keep their codes unavailable because they may have been copied or exposed; cancellation never automatically restocks them. Corrections use a separate order, and exceptional code returns/replacements are deferred to an audited workflow rather than ad hoc edits.

### Separate invoice feature

The Invoices section works independently of the allocation screen. Start by selecting a client and either linking one or more of that client's allocated/sent orders or entering manual invoice lines. The latter supports historical or otherwise manual billing without importing stock. An allocated order may be invoiced before it is marked sent.

For the initial scope, each order can appear on only one non-void invoice, and linked orders are billed as whole orders. An invoice may consolidate several orders for the same client and currency. Partial invoicing is deferred. Linking an order already attached to a non-void draft or issued invoice is blocked transactionally; voiding releases the link for a replacement invoice. Manual invoices are visibly marked as unlinked and do not imply stock fulfilment.

Prefill client/company details and order lines but allow editing invoice number, issue/due dates, descriptions, billed quantity, unit price, discounts, explicit adjustments, applicable configured tax, notes, and payment instructions. Interpret "code amount" as billed quantity and "order amount" as the monetary total; both remain customizable. The final total is derived from lines, discounts, taxes, and a clearly labelled adjustment rather than an unexplained overwritten total. Show a comparison warning when invoice quantities/values differ from linked orders; acknowledgement with a reason is required to issue a differing invoice. Invoice changes never allocate, return, or alter codes.

Drafts are editable. A suggested number such as `INV-2026-0001` is optional; a manually entered unique number is supported. On issue, reserve the number under a database uniqueness constraint, freeze client/company/line snapshots, record the template version, and create an immutable invoice revision. Issued content is corrected by voiding and issuing a replacement with a new number; preserve the original. Numbers are not reused. Numbering gaps are acceptable in the proposed internal workflow; jurisdiction-specific numbering rules are a separate requirement.

Track document state (`draft`, `issued`, `void`) separately from payment state (`unpaid`, `partial`, `paid`); overdue is derived from due date and outstanding balance. Record manual payment entries, dates, references, and amount; no online payment integration initially. Refunds, formal credit notes, and accounting-ledger behavior are future scope.

Proposed initial payment/correction rule: only invoices with no unreversed payment entries can be voided. Mistaken bookkeeping entries can be reversed with a reason and an audit trail, never deleted; a reversal is not a refund. Real payments cannot be silently removed or moved to a replacement invoice. Correcting an invoice that has actually been paid requires a future credit/refund workflow, so the initial app blocks that void operation. Reject overpayments and payments against draft/void invoices in this initial scope.

Store the issued business snapshot in the database first. Generate and archive the XLSX through a retryable artifact job; a failed generation shows a pending/failed status and retries the same invoice, without issuing another number. Store the template version and completed artifact so repeated downloads preserve the issued document. Storage writes cannot be assumed to share a transaction with database changes.

### Excel invoice template

Once supplied, inspect the actual workbook, map invoice fields to cells/named ranges, identify repeating line rows, determine maximum line count and overflow behavior, and check logos, merged cells, fonts, borders, formulas, print areas, and page breaks. Initially support one versioned template with a developer-configured mapping; a drag-and-drop template designer is out of scope.

Trial ExcelJS for reading/modifying/writing XLSX. Its suitability is conditional on a successful round-trip test of this workbook. Compute invoice totals in application code and write authoritative numeric values; do not depend on ExcelJS evaluating spreadsheet formulas. If macros, unsupported objects, or layout fidelity make this unsuitable, evaluate another processing approach before committing to the renderer. Macro-enabled or legacy formats are not promised.

An app preview shows the invoice's saved values; the downloaded workbook is the layout reference. Compare generated output visually in Excel against the supplied template, including long addresses and multiple line items. A faithful in-browser spreadsheet rendering or PDF export is a separate enhancement. Template changes affect new drafts/versions, never previously issued documents.

### Settings

Business legal/billing identifiers, address, contact details, bank/payment instructions, default currency, invoice number suggestion format, configured tax labels/rates, template version, and administrator access. Tax calculation settings are user-supplied; creating an XLSX invoice does not constitute a tax-authority submission or a government e-invoice integration.

## Data model

| Table | Purpose and main fields |
|---|---|
| `businesses` | Single business settings, currency defaults, invoice numbering settings |
| `business_members` | Auth user, business, role, active flag; invite-only membership |
| `products` | SKU, name, description, default price, low-stock threshold, active |
| `clients` | Contact/billing identifiers, address, terms, archived flag |
| `inventory_batches` | Product/source metadata, imported time, import request key, result counts |
| `codes` | Original text, canonical identity, product, batch, expiry, cost, state, allocated order item |
| `orders` | Client, order reference, state, currency, commercial/client snapshot, request key, sent timestamp |
| `order_items` | Product/description/price snapshot, quantity, order ID |
| `invoice_templates` | Private workbook path, version, field/row mapping, compatibility status |
| `invoices` | Client, editable draft, state, payment terms, invoice number, monetary totals |
| `invoice_orders` | Whole-order links; constraint prevents more than one active invoice per order |
| `invoice_items` | Billed description, quantity, price, discount/tax inputs, calculated amounts |
| `invoice_revisions` | Immutable issued snapshot, number, template version, artifact state/path |
| `payments` | Manual payment records attached to an invoice |
| `audit_events` | Actor, time, action, entity references, change metadata without raw codes |

Every business-owned record carries `business_id`; references enforce that clients, products, orders, codes, and invoices belong to the same business. Archive/deactivate referenced master records. Use foreign keys, checks, and unique constraints in addition to UI validation. Codes have at most one allocation; available counts are indexed by business/product/state/expiry. Keep raw code values out of broad reporting queries and logs. Do not overwrite prices, identifiers, or billing details in historical snapshots after master records change.

Quantities are positive integers. Monetary values use PostgreSQL exact numeric fields and decimal arithmetic, never floating-point JavaScript calculations. Initial currencies use two decimal minor units; reject unsupported currencies until rounding rules are defined. Round line amounts to two decimals, apply fixed line discounts, calculate configured per-line tax on the discounted line value, sum, then add a signed explicit invoice adjustment. Reject negative totals or discounts exceeding their line subtotal. Store currency on each order/invoice; consolidated linked orders must share it.

## Allocation and security architecture

Browser -> authenticated Next.js server operation -> constrained Supabase PostgreSQL function -> committed order. The browser cannot directly change code state or historical assignment fields.

`allocate_order(order_id, request_key)` verifies staff membership, locks the draft order and affected product rows in sorted ID order, selects eligible code rows with row locks, verifies exact quantities, then creates assignments and changes the order state atomically. Product locks serialize competing allocation operations for a product. Short transactions and deterministic locking order reduce contention/deadlocks. A unique request key plus the locked order makes retries return the existing result. Insufficient stock leaves the draft unchanged. No preliminary browser stock count is trusted.

Prefer database functions under caller permissions where practical; where privileged execution is needed, revoke broad execution grants, restrict the search path, validate membership inside the function, and explicitly deny direct table mutations to application roles. RLS must limit all business data to active membership, not merely to anyone who can sign up. Sensitive server routes recheck authorization independently.

Use Supabase Auth, disable public self-registration, and make the initial user an explicitly provisioned owner. Plan owner/staff role boundaries now; the first release can be owner-only. Store invoice templates/artifacts in private Storage buckets with authenticated downloads or short-lived URLs. Keep secret/service keys server-side. Sensitive responses should not be publicly cached. Mask inventory codes by default; allow full values only for authorized import/reveal/order/export flows. Avoid code values in URLs, analytics, errors, audit metadata, and general application logs.

Export all codes and user-entered strings as literal XLSX strings, preserve leading zeros, sanitize filenames, validate workbook/file size and row limits, and reject active formula cells from imported code columns. Add pagination and server-side filters. Record import, allocation, export request, cancellation, invoice issue/void, and payment actions. Export logs record requests rather than claiming the file was received.

## Delivery phases and release checks

1. Confirm proposed business rules; inspect sample purchased-code files and the invoice workbook; prove workbook round-trip fidelity. This determines the invoice renderer before the rest of the app depends on it.
2. Establish app/authentication, migrations, RLS, private storage, owner provisioning, settings, products, and clients. Verify that anonymous and non-member users cannot read or mutate data.
3. Build import preview/confirmation, deduplication, batch history, expiry handling, and stock views. Reconcile counts with imported fixtures, including text identifiers with leading zeros.
4. Build draft orders, transactional allocation, order history, copy outputs, XLSX code export, and cancellation rules. Verify simultaneous orders cannot share codes, retries do not consume more stock, and export failure is recoverable.
5. Build invoice drafts/linking/overrides, exact calculations, numbering, immutable issue/void/replacement, artifact retries, template exports, and manual payment tracking. Confirm historical snapshots and actual workbook appearance.
6. Add dashboard, end-to-end checks, staging/production separation, operational logs, backup/restore runbook for database plus private files, and deployment documentation. Run a small real-data pilot before loading full inventory.

An indicative build is several weeks for one developer, with the invoice template and final requirements as the main uncertainty. Re-estimate after phase 1 rather than treating this as a fixed schedule. Operating cost categories are app hosting, Supabase database/auth/storage/backups, domain if wanted, and any later email/worker service; no current pricing or paid plan is assumed here.

## Acceptance scenarios

- Import 100 unique 5GB codes and 50 unique 20GB codes; repeated upload adds none, and a duplicate hidden among new rows is identified.
- Fulfil an order for 10 x 5GB and 3 x 20GB; available stock becomes 90 and 47, with exactly 13 persistent code assignments.
- Refresh, retry confirmation, copy twice, and download twice; assignment IDs and stock do not change.
- Competing requests for the last 10 codes cannot both receive 10; a multi-product order with one short line changes no stock.
- Expired/void/allocated codes are never chosen. Codes such as `001234567890123456` and literal `=ABCD` remain exact text in exports; formula cells are never executed as imported codes.
- A logged-in non-member and an anonymous request cannot read inventory, invoice workbooks, or invoke allocation/issue functions successfully.
- Cancel an allocated order; its code assignments remain unavailable and visible in history.
- Invoice quantity/price overrides do not change fulfilment quantities; issuance records the mismatch acknowledgement.
- Two issue requests cannot claim the same invoice number or active order billing link; a failed artifact upload retries the same issued revision.
- A paid/part-paid invoice cannot be voided; mistaken payment entries can be reversed with an audit trail, but refunds and payment transfers are not performed.
- Changing a client's TIN/address or the invoice template leaves existing issued workbooks and snapshots unchanged.
- Generated invoices preserve the agreed template layout with long billing details and the agreed maximum/overflow line behavior.
- Recover both sample database records and their private template/invoice files from the documented backup procedure.

## Deliberately deferred

Client portal, client self-ordering, automatic email/WhatsApp sending, online payments, provider redemption checks, accounting integration, jurisdiction-specific electronic invoicing, formal credit notes/refunds, partial/split order invoicing, replacement/return automation, advanced template designer, and multi-business administration. These are possible extensions, not necessary for the requested core app.

## Inputs to settle before implementation

The actual invoice workbook and representative code import files; expected inventory size and largest order; provider/code uniqueness rules; client identifier fields; currency/tax/rounding needs; staff permissions; and whether consolidated/manual invoices match the desired workflow. The proposal supplies defaults for review and does not block delivery of this plan.

## Primary technical references

- [Supabase database functions and function privileges](https://supabase.com/docs/guides/database/functions)
- [PostgreSQL row locking](https://www.postgresql.org/docs/current/explicit-locking.html)
- [Supabase RLS and secret key restrictions](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase private storage buckets](https://supabase.com/docs/guides/storage/buckets/fundamentals)
- [Next.js authentication and server authorization](https://nextjs.org/docs/app/guides/authentication)
- [ExcelJS workbook read/write and formatting support](https://github.com/exceljs/exceljs)
