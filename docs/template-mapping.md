# Invoice template integration

Status: engine implemented and tested with a synthetic XLSX; the user's actual workbook is pending.

Only XLSX is supported initially. Legacy XLS and macro-enabled workbooks are not accepted. A compatibility check must confirm merged cells, styles, logos, print areas, page breaks, long addresses, and the maximum supported line count in the actual template.

## Mapping contract

Configure the worksheet, header/footer cells, first line row, maximum line rows, and numeric column positions. Line rows must already be formatted in the uploaded template; the renderer fills reserved cells without inserting rows. Exceeding `maxItems` blocks invoice issue and rendering. A larger invoice requires a larger template version or separate agreed workflow.

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

- `number`, `issueDate`, `dueDate`, `currency`
- `clientName`, `clientAddress`, `clientTin`, `clientRegistrationNumber`, `clientEmail`, `clientPhone`, `clientTaxIdentifier`, `clientCountry`, `clientContactPerson`
- `businessName`, `businessAddress`, `businessTin`, `businessRegistrationNumber`, `businessEmail`, `businessPhone`
- `subtotal`, `discount`, `tax`, `adjustment`, `total`, `notes`, `paymentInstructions`

Registration/contact fields come from frozen client/business snapshots; billing name/address/TIN can be independently overridden on the invoice. Templates themselves are immutable versions. Upload a new file/mapping for changes.

## Verification workflow

1. Create the mapping from the actual workbook, using cells with the intended labels and types.
2. Upload the template and mapping in Settings. It begins unverified.
3. Download the sample workbook; it is clearly labelled SAMPLE-NOT-AN-INVOICE and allocates no stock or invoice number.
4. Open it in Excel. Inspect identifiers, long text, rows, totals, logos, print preview, and page breaks. Also test the agreed maximum number of rows through the renderer before approving the actual template.
5. Only then mark the template verified. The newest verified template is used for new invoice issue.
6. Issued invoices retain their own snapshot/template ID, and the first download archives a workbook under that revision's immutable path. Retries never create another invoice number.
