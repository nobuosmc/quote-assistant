/**
 * Sheet names and column titles for the three Smartsheets.
 *
 * Names resolve to sheet ids at runtime. Titles map a logical field to a
 * column. An environment variable, when set, replaces that one default.
 * Titles must match the sheet exactly. A missing column is an error.
 */

export type RequestField =
  | "requestId"
  | "customer"
  | "contactEmail"
  | "product"
  | "quantity"
  | "neededBy"
  | "notes"
  | "status";

export type HistoryField =
  | "quoteId"
  | "date"
  | "customer"
  | "product"
  | "quantity"
  | "unitPrice"
  | "currency"
  | "outcome";

export type ProposalField =
  | "requestId"
  | "customer"
  | "currency"
  | "product"
  | "quantity"
  | "unitPrice"
  | "lineItems"
  | "total"
  | "validUntil"
  | "rationale"
  | "historyRefs"
  | "stagedAt";

export type ColumnTitles<F extends string> = Record<F, string>;

type FieldDefault<F extends string> = { field: F; env: string; title: string };

const REQUEST_FIELDS: FieldDefault<RequestField>[] = [
  { field: "requestId", env: "SMARTSHEET_REQUESTS_COL_REQUEST_ID", title: "Request ID" },
  { field: "customer", env: "SMARTSHEET_REQUESTS_COL_CUSTOMER", title: "Customer" },
  { field: "contactEmail", env: "SMARTSHEET_REQUESTS_COL_CONTACT_EMAIL", title: "Contact Email" },
  { field: "product", env: "SMARTSHEET_REQUESTS_COL_PRODUCT", title: "Product" },
  { field: "quantity", env: "SMARTSHEET_REQUESTS_COL_QUANTITY", title: "Quantity" },
  { field: "neededBy", env: "SMARTSHEET_REQUESTS_COL_NEEDED_BY", title: "Needed By" },
  { field: "notes", env: "SMARTSHEET_REQUESTS_COL_NOTES", title: "Notes" },
  { field: "status", env: "SMARTSHEET_REQUESTS_COL_STATUS", title: "Status" },
];

const HISTORY_FIELDS: FieldDefault<HistoryField>[] = [
  { field: "quoteId", env: "SMARTSHEET_HISTORY_COL_QUOTE_ID", title: "Quote ID" },
  { field: "date", env: "SMARTSHEET_HISTORY_COL_DATE", title: "Date" },
  { field: "customer", env: "SMARTSHEET_HISTORY_COL_CUSTOMER", title: "Customer" },
  { field: "product", env: "SMARTSHEET_HISTORY_COL_PRODUCT", title: "Product" },
  { field: "quantity", env: "SMARTSHEET_HISTORY_COL_QUANTITY", title: "Quantity" },
  { field: "unitPrice", env: "SMARTSHEET_HISTORY_COL_UNIT_PRICE", title: "Unit Price" },
  { field: "currency", env: "SMARTSHEET_HISTORY_COL_CURRENCY", title: "Currency" },
  { field: "outcome", env: "SMARTSHEET_HISTORY_COL_OUTCOME", title: "Outcome" },
];

const PROPOSAL_FIELDS: FieldDefault<ProposalField>[] = [
  { field: "requestId", env: "SMARTSHEET_PROPOSALS_COL_REQUEST_ID", title: "Request ID" },
  { field: "customer", env: "SMARTSHEET_PROPOSALS_COL_CUSTOMER", title: "Customer" },
  { field: "currency", env: "SMARTSHEET_PROPOSALS_COL_CURRENCY", title: "Currency" },
  { field: "product", env: "SMARTSHEET_PROPOSALS_COL_PRODUCT", title: "Product" },
  { field: "quantity", env: "SMARTSHEET_PROPOSALS_COL_QUANTITY", title: "Quantity" },
  { field: "unitPrice", env: "SMARTSHEET_PROPOSALS_COL_UNIT_PRICE", title: "Unit Price" },
  { field: "lineItems", env: "SMARTSHEET_PROPOSALS_COL_LINE_ITEMS", title: "Line Items" },
  { field: "total", env: "SMARTSHEET_PROPOSALS_COL_TOTAL", title: "Total" },
  { field: "validUntil", env: "SMARTSHEET_PROPOSALS_COL_VALID_UNTIL", title: "Valid Until" },
  { field: "rationale", env: "SMARTSHEET_PROPOSALS_COL_RATIONALE", title: "Rationale" },
  { field: "historyRefs", env: "SMARTSHEET_PROPOSALS_COL_HISTORY_REFS", title: "History Refs" },
  { field: "stagedAt", env: "SMARTSHEET_PROPOSALS_COL_STAGED_AT", title: "Staged At" },
];

function fromEnv(name: string, fallback: string): string {
  const value = process.env[name]?.trim();
  return value ? value : fallback;
}

function titles<F extends string>(fields: FieldDefault<F>[]): ColumnTitles<F> {
  const columns = {} as ColumnTitles<F>;
  for (const field of fields) columns[field.field] = fromEnv(field.env, field.title);
  return columns;
}

export type SheetsConfig = {
  requests: { sheetName: string; columns: ColumnTitles<RequestField>; proposedStatus: string };
  history: { sheetName: string; columns: ColumnTitles<HistoryField> };
  proposals: { sheetName: string; columns: ColumnTitles<ProposalField> };
};

/** Read at call time so a test or a host can set the environment first. */
export function sheetsConfig(): SheetsConfig {
  return {
    requests: {
      sheetName: fromEnv("SMARTSHEET_REQUESTS_SHEET_NAME", "SalesQuoteRequest"),
      columns: titles(REQUEST_FIELDS),
      proposedStatus: fromEnv("SMARTSHEET_PROPOSED_STATUS", "Proposed"),
    },
    history: {
      sheetName: fromEnv("SMARTSHEET_HISTORY_SHEET_NAME", ""),
      columns: titles(HISTORY_FIELDS),
    },
    proposals: {
      sheetName: fromEnv("SMARTSHEET_PROPOSALS_SHEET_NAME", "ostestQuote"),
      columns: titles(PROPOSAL_FIELDS),
    },
  };
}
