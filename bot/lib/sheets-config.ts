/**
 * Where each logical field sits.
 *
 * Smartsheet sheets are found by name. Columns are not. Real column titles
 * are not known yet, so a field maps to Column1, Column2, Column3, and so
 * on: Column1 is the first column. A sheet or workbook with fewer columns
 * than the map needs is an error.
 *
 * History is not a Smartsheet. It is the QuoteTracking workbook.
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

export type ColumnMap<F extends string> = Record<F, string>;

type FieldDefault<F extends string> = { field: F; env?: string; column: string };

const REQUEST_FIELDS: FieldDefault<RequestField>[] = [
  { field: "requestId", env: "SMARTSHEET_REQUESTS_COL_REQUEST_ID", column: "Column1" },
  { field: "customer", env: "SMARTSHEET_REQUESTS_COL_CUSTOMER", column: "Column2" },
  { field: "contactEmail", env: "SMARTSHEET_REQUESTS_COL_CONTACT_EMAIL", column: "Column3" },
  { field: "product", env: "SMARTSHEET_REQUESTS_COL_PRODUCT", column: "Column4" },
  { field: "quantity", env: "SMARTSHEET_REQUESTS_COL_QUANTITY", column: "Column5" },
  { field: "neededBy", env: "SMARTSHEET_REQUESTS_COL_NEEDED_BY", column: "Column6" },
  { field: "notes", env: "SMARTSHEET_REQUESTS_COL_NOTES", column: "Column7" },
  { field: "status", env: "SMARTSHEET_REQUESTS_COL_STATUS", column: "Column8" },
];

const HISTORY_FIELDS: FieldDefault<HistoryField>[] = [
  { field: "quoteId", column: "Column1" },
  { field: "date", column: "Column2" },
  { field: "customer", column: "Column3" },
  { field: "product", column: "Column4" },
  { field: "quantity", column: "Column5" },
  { field: "unitPrice", column: "Column6" },
  { field: "currency", column: "Column7" },
  { field: "outcome", column: "Column8" },
];

const PROPOSAL_FIELDS: FieldDefault<ProposalField>[] = [
  { field: "requestId", env: "SMARTSHEET_PROPOSALS_COL_REQUEST_ID", column: "Column1" },
  { field: "customer", env: "SMARTSHEET_PROPOSALS_COL_CUSTOMER", column: "Column2" },
  { field: "currency", env: "SMARTSHEET_PROPOSALS_COL_CURRENCY", column: "Column3" },
  { field: "product", env: "SMARTSHEET_PROPOSALS_COL_PRODUCT", column: "Column4" },
  { field: "quantity", env: "SMARTSHEET_PROPOSALS_COL_QUANTITY", column: "Column5" },
  { field: "unitPrice", env: "SMARTSHEET_PROPOSALS_COL_UNIT_PRICE", column: "Column6" },
  { field: "lineItems", env: "SMARTSHEET_PROPOSALS_COL_LINE_ITEMS", column: "Column7" },
  { field: "total", env: "SMARTSHEET_PROPOSALS_COL_TOTAL", column: "Column8" },
  { field: "validUntil", env: "SMARTSHEET_PROPOSALS_COL_VALID_UNTIL", column: "Column9" },
  { field: "rationale", env: "SMARTSHEET_PROPOSALS_COL_RATIONALE", column: "Column10" },
  { field: "historyRefs", env: "SMARTSHEET_PROPOSALS_COL_HISTORY_REFS", column: "Column11" },
  { field: "stagedAt", env: "SMARTSHEET_PROPOSALS_COL_STAGED_AT", column: "Column12" },
];

function fromEnv(name: string, fallback: string): string {
  const value = process.env[name]?.trim();
  return value ? value : fallback;
}

function columns<F extends string>(fields: FieldDefault<F>[]): ColumnMap<F> {
  const map = {} as ColumnMap<F>;
  for (const field of fields) {
    map[field.field] = field.env ? fromEnv(field.env, field.column) : field.column;
  }
  return map;
}

/** 1-based. "Column1" is the first column. Anything else is an error. */
export function columnPosition(name: string): number {
  const match = /^Column(\d+)$/.exec(name);
  const position = match ? Number(match[1]) : Number.NaN;
  if (!Number.isInteger(position) || position < 1) {
    throw new Error(`"${name}" is not a column position. Use Column1, Column2, and so on.`);
  }
  return position;
}

export function requiredColumnCount(map: Record<string, string>): number {
  let required = 0;
  for (const name of Object.values(map)) required = Math.max(required, columnPosition(name));
  return required;
}

export type SheetsConfig = {
  requests: { sheetName: string; columns: ColumnMap<RequestField>; proposedStatus: string };
  history: { workbookName: string; columns: ColumnMap<HistoryField> };
  proposals: { sheetName: string; columns: ColumnMap<ProposalField> };
};

/** Read at call time so a test or a host can set the environment first. */
export function sheetsConfig(): SheetsConfig {
  return {
    requests: {
      sheetName: fromEnv("SMARTSHEET_REQUESTS_SHEET_NAME", "SalesQuoteRequest"),
      columns: columns(REQUEST_FIELDS),
      proposedStatus: fromEnv("SMARTSHEET_PROPOSED_STATUS", "Proposed"),
    },
    history: {
      workbookName: "QuoteTracking.xlsx",
      columns: columns(HISTORY_FIELDS),
    },
    proposals: {
      sheetName: fromEnv("SMARTSHEET_PROPOSALS_SHEET_NAME", "ostestQuote"),
      columns: columns(PROPOSAL_FIELDS),
    },
  };
}
