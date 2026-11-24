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
2. For a new project, apply the SQL files in `supabase/migrations/` in filename order using the SQL editor or your CLI migration workflow. For an existing configured project, apply only `supabase/migrations/202611240001_cme_file_support.sql` for the CME update; it adds columns and replaces constrained functions without deleting stock or orders. Never rerun the original setup migration or reset a populated database.
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
- Pasted, CSV, and XLSX code imports with preview, duplicate detection, purchase metadata, and database-bound confirmation. CME CSVs automatically detect `PAC` and preserve each code's `Expiry`, `Validity`, `Created Date`, product description, and remark. Source dates use day/month/year; the fallback date is used only where source expiry is absent. Preview expires after one hour; a successful confirmation can be retried safely.
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

The supplied VSAT legacy XLS invoice has been converted to XLSX, mapped, sanitized of its example client/line items, and installed in private Supabase Storage. The original file is unchanged. The installed template uses MYR and supports nine line items; it preserves the fixed letterhead, bank instructions, signature, stamp, and one-page print layout. Header artwork and remittance details remain part of that template; changing business profile text does not replace its artwork.

See `docs/template-mapping.md`. In Settings, download a sample from the installed template. New templates still require layout verification. Invoice issue is blocked if there is no active verified template, its currency does not match, or its line capacity is exceeded. Sample calculation rates and selling prices are examples, not business defaults.

## CME product catalog

The configured catalog contains Onshore 3GB/20GB and Offshore 5GB/10GB/20GB with distinct SKUs and provider `CME`. Selling prices were not supplied and initial defaults are zero; configure your prices before fulfilment. For another new environment, preview missing products with `node scripts/setup-cme-catalog.mjs`, then use `--apply` to insert them. Existing products and prices are preserved.

## Verification

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd test
npm.cmd run test:e2e
npm.cmd run build
```

Vitest runs the real SQL migration and functions in PGlite with a test-only Supabase Auth/Storage schema. It covers allocation/retries/rollback, authorization, import confirmation, invoice issue/snapshots/numbers/payments, calculations, and workbook behavior. This is not a substitute for testing actual Supabase Storage, hosted Auth, or simultaneous transactions from independent PostgreSQL sessions.

Playwright uses installed Google Chrome and checks the unconfigured app, forms, imports, invoice calculations, login behavior, and mobile navigation. Its server explicitly clears the Supabase variables and uses `.next-e2e`, so tests do not connect to your real account or use the regular app's build directory. For a different browser, adjust `playwright.config.ts`.

Before operational release, complete the authenticated pilot and independent-session concurrency checks in `docs/operations.md` and demonstrate backup/restore. The live API and private template storage have been checked, but the sample codes have not been imported and no operational invoices have been issued. No website deployment was performed.

## Project records

- `docs/superpowers/specs/2026-11-19-code-distribution-design.md`: proposed design and business rules.
- `docs/superpowers/plans/2026-11-19-code-distribution.md`: implementation sequence and contracts.
- `docs/implementation-status.md`: delivered work, verification, and remaining inputs.
