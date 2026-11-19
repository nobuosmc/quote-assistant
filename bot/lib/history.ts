import { sheetsConfig } from "./sheets-config.js";
import { columnIds, hasSmartsheetToken, loadSheetByName, numberAt, textAt, type DataSource } from "./smartsheet.js";

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

const MOCK_HISTORY: QuoteHistoryEntry[] = [
  { quoteId: "Q-0871", date: "2026-03-02", customer: "Northwind Traders", product: "Industrial Sensor Kit", quantity: 25, unitPrice: 412, currency: "USD", outcome: "Won" },
  { quoteId: "Q-0912", date: "2026-06-18", customer: "Northwind Traders", product: "Industrial Sensor Kit", quantity: 50, unitPrice: 389, currency: "USD", outcome: "Won" },
  { quoteId: "Q-0930", date: "2026-07-07", customer: "Fabrikam Inc", product: "Industrial Sensor Kit", quantity: 10, unitPrice: 445, currency: "USD", outcome: "Lost" },
  { quoteId: "Q-0944", date: "2026-08-21", customer: "Fabrikam Inc", product: "Gateway Controller", quantity: 4, unitPrice: 1890, currency: "USD", outcome: "Won" },
  { quoteId: "Q-0967", date: "2026-09-30", customer: "Tailspin Toys", product: "Gateway Controller", quantity: 12, unitPrice: 1745, currency: "USD", outcome: "Won" },
  { quoteId: "Q-0981", date: "2026-10-14", customer: "Tailspin Toys", product: "Gateway Controller", quantity: 3, unitPrice: 1950, currency: "USD", outcome: "Pending" },
];

const matches = (value: string, filter: string | undefined) =>
  !filter || value.toLowerCase().includes(filter.toLowerCase());

/** Newest first. Uses sample rows when SMARTSHEET_ACCESS_TOKEN is absent. */
export async function readQuoteHistory(filter: { customer?: string; product?: string; limit: number }) {
  const entries = hasSmartsheetToken() ? await loadHistory() : MOCK_HISTORY;
  const matched = entries
    .filter((entry) => matches(entry.customer, filter.customer) && matches(entry.product, filter.product))
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, filter.limit);
  const source: DataSource = hasSmartsheetToken() ? "smartsheet" : "mock";
  return { source, entries: matched };
}

async function loadHistory(): Promise<QuoteHistoryEntry[]> {
  const { history } = sheetsConfig();
  if (!history.sheetName) {
    throw new Error("SMARTSHEET_HISTORY_SHEET_NAME is not set.");
  }
  const sheet = await loadSheetByName(history.sheetName);
  const columns = columnIds(sheet, history.columns);
  return sheet.rows.map((row) => ({
    quoteId: textAt(row, columns.quoteId) || `row-${row.id}`,
    date: textAt(row, columns.date),
    customer: textAt(row, columns.customer),
    product: textAt(row, columns.product),
    quantity: numberAt(row, columns.quantity),
    unitPrice: numberAt(row, columns.unitPrice),
    currency: textAt(row, columns.currency) || "USD",
    outcome: textAt(row, columns.outcome),
  }));
}
