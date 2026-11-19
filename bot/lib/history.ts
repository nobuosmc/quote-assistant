import { graphConfig, readWorkbook, type WorkbookCell } from "./graph.js";
import { columnPosition, requiredColumnCount, sheetsConfig, type HistoryField } from "./sheets-config.js";

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

export type HistorySource = "excel" | "mock";

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

/**
 * Newest first. Uses sample rows when the Microsoft Graph variables are absent.
 * The first row of the workbook is the header row and is not used to map fields.
 */
export async function readQuoteHistory(filter: { customer?: string; product?: string; limit: number }) {
  const configured = graphConfig();
  const entries = configured ? await loadHistory() : MOCK_HISTORY;
  const matched = entries
    .filter((entry) => matches(entry.customer, filter.customer) && matches(entry.product, filter.product))
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, filter.limit);
  const source: HistorySource = configured ? "excel" : "mock";
  return { source, entries: matched };
}

async function loadHistory(): Promise<QuoteHistoryEntry[]> {
  const { history } = sheetsConfig();
  const range = await readWorkbook(history.workbookName);
  return rowsFromWorkbook(range.values, range.columnCount, history.columns);
}

/** Map data rows by column position. Row 0 is the header row and is skipped. */
export function rowsFromWorkbook(
  values: WorkbookCell[][],
  columnCount: number,
  columns: Record<HistoryField, string>,
): QuoteHistoryEntry[] {
  const needed = requiredColumnCount(columns);
  if (columnCount < needed) {
    throw new Error(`QuoteTracking.xlsx has ${columnCount} columns, which is fewer than the mapping needs (${needed}).`);
  }
  return values.slice(1).flatMap((row, index) => {
    const entry: QuoteHistoryEntry = {
      quoteId: text(row, columns.quoteId) || `row-${index + 2}`,
      date: dateText(cell(row, columns.date)),
      customer: text(row, columns.customer),
      product: text(row, columns.product),
      quantity: numberCell(cell(row, columns.quantity)),
      unitPrice: numberCell(cell(row, columns.unitPrice)),
      currency: text(row, columns.currency) || "USD",
      outcome: text(row, columns.outcome),
    };
    const blank = !entry.customer && !entry.product && entry.quoteId.startsWith("row-");
    return blank ? [] : [entry];
  });
}

function cell(row: WorkbookCell[], columnName: string): WorkbookCell | undefined {
  return row[columnPosition(columnName) - 1];
}

function text(row: WorkbookCell[], columnName: string): string {
  const value = cell(row, columnName);
  return value === null || value === undefined ? "" : String(value);
}

function numberCell(value: WorkbookCell | undefined): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Excel day 1 is 1900-01-01. Excel also treats 1900 as a leap year, so day
 * counts after that fake 29 February are one day ahead. A string date is kept.
 */
function dateText(value: WorkbookCell | undefined): string {
  if (typeof value === "number" && Number.isFinite(value)) {
    const serial = Math.floor(value);
    const days = serial >= 60 ? serial - 1 : serial;
    const epoch = Date.UTC(1899, 11, 31);
    return new Date(epoch + days * 86400000).toISOString().slice(0, 10);
  }
  if (value === null || value === undefined || value === "") return "";
  const textValue = String(value);
  const iso = /^(\d{4}-\d{2}-\d{2})/.exec(textValue);
  return iso ? iso[1] : textValue;
}
