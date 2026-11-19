# CodeDesk

A private code inventory, client distribution, and Excel invoice app built with Next.js, TypeScript, and Supabase.

## Run locally

Requires Node.js 22 or a compatible supported Node release. Dependencies are pinned in `package.json` and `package-lock.json`.

```powershell
npm.cmd ci
Copy-Item .env.example .env.local
npm.cmd run dev
```

Open the printed local URL (normally http://127.0.0.1:3000). Without Supabase configuration, the app displays an empty setup workspace; it does not store business data locally or accept fake logins. On Windows, `npm.cmd` avoids PowerShell's `npm.ps1` execution-policy issue. In other shells, `npm` works normally.

## Connect Supabase

1. Create a dedicated development Supabase project.
2. Apply `supabase/migrations/202611190001_workspace.sql` using the SQL editor, or your Supabase CLI migration workflow. This migration is for a new project and is not a repeatable seed script. Never reset a populated production database to apply changes.
3. In Supabase Auth, disable public signups and create/invite your initial owner account. Complete the account/password setup through Supabase.
4. Edit the owner email and business name in `supabase/provision-owner.sql`, then run that script in the SQL editor. It requires an existing Auth user and refuses to add a duplicate membership.
5. Fill `.env.local` with the project URL and publishable key:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
SUPABASE_SECRET_KEY=your-server-only-secret-key
```

The server-only secret is used exclusively for archiving generated invoice workbooks in private storage. It must never be included in a browser variable, commit, log, or client bundle. Normal application queries and mutations use the verified user's session and RLS. Code distribution and drafts work without the secret; invoice archiving requires it.

6. Restart the app, visit `/login`, and sign in. Save your company profile in Settings, then add products and clients.

## Supported workflows

- Product and client creation, editing, deactivation/archiving, including text TIN/registration values.
- Pasted, CSV, and XLSX code imports with preview, duplicate detection, purchase metadata, and database-bound confirmation. Preview expires after one hour; a successful confirmation can be retried safely.
- One product per import/file. Split mixed-product spreadsheets into separate uploads; automatic per-row product mapping is deferred.
- Maximum 5,000 codes per import and 4 MB per uploaded file. XLSX uses the first worksheet, first row as header, and a selectable code column. Numeric/formula code cells are rejected instead of guessing their original text.
- Eligible-stock views, paged masked code records, purchase batches, and audited voiding of unused codes.
- Multi-product draft orders, atomic all-or-nothing allocation, stable code copying/XLSX downloads, sent marking, and cancellation without automatic restocking.
- Independent manual or order-linked invoice drafts; quantity, price, numbering, billing, dates, discounts, configured tax, and explicit adjustment overrides. Differences from orders require an issue reason.
- Verified versioned invoice templates, immutable issued snapshots, protected workbook downloads, and recoverable on-demand artifact generation. The first download archives the issued revision; later downloads reuse the archive.
- Manual partial/full payments, audited reversal of mistaken entries, and void rules that preserve real payment records.
- Dashboard stock, uninvoiced orders, and outstanding/overdue invoice balances grouped by currency.

Client messaging, tax-authority submission, payment gateways, refunds/credit notes, partial invoicing, and provider redemption status are not implemented.

## Excel invoice setup

Your actual invoice workbook has not yet been supplied. No claim is made that a particular template is compatible.

See `docs/template-mapping.md`. Upload an XLSX and its mapping under Settings, download the clearly labelled sample, compare the saved workbook in Excel, and only then mark that template verified. Invoice issue is blocked until a verified template exists, and if the invoice exceeds its line capacity. Sample calculation rates are examples, not configured tax defaults.

## Verification

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd test
npm.cmd run test:e2e
npm.cmd run build
```

Vitest runs the real SQL migration and functions in PGlite with a test-only Supabase Auth/Storage schema. It covers allocation/retries/rollback, authorization, import confirmation, invoice issue/snapshots/numbers/payments, calculations, and workbook behavior. This is not a substitute for testing actual Supabase Storage, hosted Auth, or simultaneous transactions from independent PostgreSQL sessions.

Playwright uses installed Google Chrome and checks the unconfigured app, forms, imports, invoice calculations, login behavior, and mobile navigation. It must run with the Supabase variables unset; it does not connect to a real account. For a different browser, adjust `playwright.config.ts`.

Before production, complete the connected pilot and independent-session concurrency checks in `docs/operations.md`, verify your real template, and demonstrate backup/restore. No hosted project was created or production deployment performed during implementation.

## Project records

- `docs/superpowers/specs/2026-11-19-code-distribution-design.md`: proposed design and business rules.
- `docs/superpowers/plans/2026-11-19-code-distribution.md`: implementation sequence and contracts.
- `docs/implementation-status.md`: delivered work, verification, and remaining inputs.
