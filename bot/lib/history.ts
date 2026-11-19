import { cellNumber, cellText, fetchSheetRows, smartsheetSheetId, type DataSource } from "./smartsheet.js";

export type QuoteHistoryEntry = {
  quoteId: string;
  date: string;
  customer: string;
  product: string;
  quantity: number;
  unitPrice: number;
  currency: string;
  outcome: string;
};

/** Column titles expected on the quote-history sheet. */
export const HISTORY_COLUMNS = {
  quoteId: "Quote ID",
  date: "Date",
  customer: "Customer",
  product: "Product",
  quantity: "Quantity",
  unitPrice: "Unit Price",
  currency: "Currency",
  outcome: "Outcome",
} as const;

const MOCK_HISTORY: QuoteHistoryEntry[] = [
  { quoteId: "Q-0871", date: "2026-03-02", customer: "Northwind Traders", product: "Industrial Sensor Kit", quantity: 25, unitPrice: 412, currency: "USD", outcome: "Won" },
  { quoteId: "Q-0912", date: "2026-06-18", customer: "Northwind Traders", product: "Industrial Sensor Kit", quantity: 50, unitPrice: 389, currency: "USD", outcome: "Won" },
  { quoteId: "Q-0930", date: "2026-07-07", customer: "Fabrikam Inc", product: "Industrial Sensor Kit", quantity: 10, unitPrice: 445, currency: "USD", outcome: "Lost" },
  { quoteId: "Q-0944", date: "2026-08-21", customer: "Fabrikam Inc", product: "Gateway Controller", quantity: 4, unitPrice: 1890, currency: "USD", outcome: "Won" },
  { quoteId: "Q-0967", date: "2026-09-30", customer: "Tailspin Toys", product: "Gateway Controller", quantity: 12, unitPrice: 1745, currency: "USD", outcome: "Won" },
  { quoteId: "Q-0981", date: "2026-10-14", customer: "Tailspin Toys", product: "Gateway Controller", quantity: 3, unitPrice: 1950, currency: "USD", outcome: "Pending" },
];

async function loadHistory(): Promise<{ source: DataSource; entries: QuoteHistoryEntry[] }> {
  const sheetId = smartsheetSheetId("history");
  if (!sheetId) return { source: "mock", entries: MOCK_HISTORY };

  const rows = await fetchSheetRows(sheetId);
  const entries = rows.map((row) => ({
    quoteId: cellText(row, HISTORY_COLUMNS.quoteId) || `row-${row.rowId}`,
    date: cellText(row, HISTORY_COLUMNS.date),
    customer: cellText(row, HISTORY_COLUMNS.customer),
    product: cellText(row, HISTORY_COLUMNS.product),
    quantity: cellNumber(row, HISTORY_COLUMNS.quantity),
    unitPrice: cellNumber(row, HISTORY_COLUMNS.unitPrice),
    currency: cellText(row, HISTORY_COLUMNS.currency) || "USD",
    outcome: cellText(row, HISTORY_COLUMNS.outcome),
  }));
  return { source: "smartsheet", entries };
}

const matches = (value: string, filter: string | undefined) =>
  !filter || value.toLowerCase().includes(filter.toLowerCase());

/** Newest first. */
export async function readQuoteHistory(filter: { customer?: string; product?: string; limit: number }) {
  const { source, entries } = await loadHistory();
  const matched = entries
    .filter((entry) => matches(entry.customer, filter.customer) && matches(entry.product, filter.product))
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, filter.limit);
  return { source, entries: matched };
}
