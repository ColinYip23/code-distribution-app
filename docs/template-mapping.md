# Invoice template integration

Status: the supplied VSAT XLS has been inspected, converted to XLSX, and installed as a private template. Native one-page output has been visually checked, including a full nine-line sample. The original file is unchanged; example customer details and invoice values were removed from the prepared template.

The application's upload/export format is XLSX. Legacy XLS files require conversion before uploading; the supplied file has already been converted. Macro-enabled files are not accepted. New template versions still require a compatibility check.

## Installed VSAT CME mapping

The authoritative preset is `src/features/invoices/vsat-cme-mapping.json`. It maps invoice number/date/terms/client order reference/TIN to H11:H15, client details to the existing billing box, and total to H45. Line items occupy rows 23, 25, 27, 29, 31, 33, 35, 37 and 39; item number is B, description C:D, quantity E, unit F, price G, and amount H. The fixed amount heading is RM, so the preset requires MYR.

The preserved-package renderer changes worksheet values directly while retaining drawing/text objects, images, styles, and print settings from the converted template. It removes unused original shared strings so cleared example client data does not remain hidden in the workbook. The nine-row sample preserves all three images plus native header text drawings and prints on one page. Custom invoice numbers shrink to fit, TIN remains literal text, and dates use `d/m/yyyy`.

Fixed letterhead, bank details, signature, and stamp come from the supplied template. Upload a new template version to change those fixed parts.

## Mapping contract

Configure the worksheet, header/footer cells, first line row, maximum line rows, and numeric column positions. Line rows must already be formatted in the uploaded template; the renderer fills reserved cells without inserting rows. Exceeding `maxItems` blocks invoice issue and rendering. A larger invoice requires a larger template version or separate agreed workflow.

Optional settings include `rowStep` for spaced line rows; `columns.itemNumber`/`columns.unit` and `unitLabel`; `clearRanges` for template example values; `mergeRanges`, `wrapFields`, and `shrinkFields`; text `fieldFormats` containing `{value}`; `dateFormat`; and fixed `currency`. `preservePackage: true` retains drawing/text and native package parts unsupported by a general workbook round-trip. `printScale` and `centerHorizontally` are supported when explicitly required by a template. These settings are covered by the preset and rendering tests.

```json
{
  "worksheet": "Invoice",
  "fields": {
    "number": "F3",
    "issueDate": "F4",
    "dueDate": "F5",
    "businessName": "B3",
    "businessTin": "B5",
    "businessRegistrationNumber": "B6",
    "clientName": "B8",
    "clientAddress": "B9",
    "clientTin": "B11",
    "clientRegistrationNumber": "B12",
    "total": "F29"
  },
  "firstItemRow": 15,
  "maxItems": 8,
  "columns": { "description": 2, "quantity": 4, "unitPrice": 5, "amount": 6 }
}
```

These are example coordinates, not a mapping for your workbook. Header/footer fields must not overlap the reserved line cells. Text identifiers are always written as text. Numeric totals are calculated by the app/database and written as values. Do not rely on ExcelJS to recalculate arbitrary formulas. The template should clearly label the line amount as including line discount/tax if that column is used; the renderer's `amount` equals discounted line value plus line tax.

Supported field names (unknown names are rejected):

- `number`, `issueDate`, `dueDate`, `paymentTerms`, `orderReference`, `currency`
- `clientName`, `clientAddress`, `clientTin`, `clientRegistrationNumber`, `clientEmail`, `clientPhone`, `clientTaxIdentifier`, `clientCountry`, `clientContactPerson`
- `businessName`, `businessAddress`, `businessTin`, `businessRegistrationNumber`, `businessEmail`, `businessPhone`
- `subtotal`, `discount`, `tax`, `adjustment`, `total`, `notes`, `paymentInstructions`

Registration/contact fields come from frozen client/business snapshots; billing name/address/TIN can be independently overridden on the invoice. Templates themselves are immutable versions. Upload a new file/mapping for changes.

## Verification workflow

1. Create the mapping from the actual workbook, using cells with the intended labels and types.
2. Upload the template and mapping in Settings. It begins unverified.
3. Download the sample workbook; it is clearly labelled SAMPLE-NOT-AN-INVOICE and allocates no stock or invoice number.
4. Open it in Excel. Inspect identifiers, long text, rows, totals, logos, print preview, and page breaks. Also test the agreed maximum number of rows before approving a new template. The supplied VSAT template has additionally been rendered through LibreOffice and visually inspected at maximum capacity.
5. Only then mark the template verified. The newest verified template is used for new invoice issue.
6. Issued invoices retain their own snapshot/template ID, and the first download archives a workbook under that revision's immutable path. Retries never create another invoice number.
