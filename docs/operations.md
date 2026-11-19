# Operations and connected release checklist

## Environments

Use separate Supabase projects and credentials for development/staging and production. Keep `.env.local` out of source control. Apply migrations once to a new project; future schema changes need new migrations, never a production reset. Provision the owner using the documented script. Public signup must be disabled in Supabase Auth itself.

The initial UI is owner-operated. Staff membership exists in the data model, with business settings and template writes limited to owners; there is no member invitation/admin screen yet. Use Supabase's Auth administration and controlled membership provisioning if adding staff.

## Connected pilot (not yet performed)

- [ ] Sign in to a development Supabase project with the provisioned owner; verify another Auth user has no workspace access.
- [ ] Create 5GB/20GB products and two clients with leading-zero TIN/registration identifiers.
- [ ] Import 100/50 synthetic codes and repeat the import. Verify eligible counts 100/50.
- [ ] Create and allocate 10/3; verify 90/47 and 13 assigned codes. Repeat allocation and export; counts remain unchanged.
- [ ] Run two independent sessions for competing orders on the final stock. Assert their assigned code ID sets do not overlap; the losing request must not partially allocate a different product.
- [ ] Exercise expired/void codes, reversed line ordering across concurrent orders, and same-order simultaneous retries.
- [ ] Create an invoice draft from the order; change billed quantity and total adjustment, acknowledge the difference, and confirm stock does not change.
- [ ] Verify the actual XLSX template layout and maximum rows, then issue an invoice and download it. Check Auth and private Storage access directly, including anonymous requests and a different Auth user.
- [ ] Interrupt artifact generation/storage upload, then retry. The same invoice/revision/number remains; the immutable artifact is either uploaded once or recovered.
- [ ] Change the client TIN/address and business details, upload a newer template, and re-download the prior invoice. Its saved details and workbook must remain unchanged.
- [ ] Record partial/full payments, retry the same payment request, reject overpayment, reverse only a mistaken entry, and verify void is blocked while payments are applied.
- [ ] Reconcile stock, allocations, invoice totals, active billing links, payments, and the dashboard by currency.

## Recovery

Database backups and Storage object backups are separate. The database contains immutable template references and invoice snapshots, but a database backup alone does not back up the workbook bytes.

1. Choose a backup frequency and restore objective for the actual operational volume.
2. Back up the database through the Supabase-supported mechanism selected for the project. Include schema, functions, RLS, memberships, purchase batches, codes, orders, invoice snapshots, payments, and audit history.
3. Separately copy private `documents` bucket objects and retain their exact business/template/revision paths. Restrict access to backups because code inventory and identifiers are sensitive.
4. Restore into a separate development project first; restore Auth user identities through supported administration before memberships that reference them.
5. Restore bucket configuration, policies, and all referenced object bytes. Do not rotate template or revision IDs during restore.
6. Validate counts and relationships, sign in as the owner, and download a historical invoice and order export.
7. Record the backup time, restored point, counts, tested downloads, and recovery duration. No restore has been demonstrated in this implementation session.

## Artifact retries

Invoice issue is a database transaction; file generation happens on the first protected download. A missing server storage key returns a setup message, without issuing another number. Failed uploads leave the revision pending. Retrying renders from the original snapshot and template. Storage writes use the server secret and `upsert:false`; authenticated users cannot insert invoice artifacts directly. If a concurrent request wins the upload, the other request reads that object and marks the same revision ready. Never overwrite a ready artifact to correct invoice details.

## Limits and scaling

Imports: 5,000 codes / 4 MB, one product per file; codes up to 512 characters. Orders/invoices: up to 100 lines, quantities up to 5,000 per line; template line capacity can be lower. Two-decimal currencies are explicitly allowlisted. The current app fetches metadata in paged database requests and paginates tables in the UI; large deployments should move more page-specific filtering/aggregation to server queries. Raw inventory codes are never included in the general workspace payload.

No production deployment, external Supabase project configuration, real-user testing, live multi-session test, or actual-template approval has been performed. Treat those checklist items as prerequisites to operational release.
