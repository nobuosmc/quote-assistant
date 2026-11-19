const API_BASE = "https://api.smartsheet.com/2.0";

export type CellValue = string | number | boolean | null;

/** Where a read came from: the live sheet, or built-in sample data when Smartsheet is not configured. */
export type DataSource = "smartsheet" | "mock";

export type SheetRow = {
  rowId: number;
  values: Record<string, CellValue>;
};

type SmartsheetSheet = {
  columns: { id: number; title: string }[];
  rows: { id: number; cells: { columnId: number; value?: CellValue }[] }[];
};

export type SmartsheetSheetKind = "requests" | "history";

const SHEET_ENV: Record<SmartsheetSheetKind, string> = {
  requests: "SMARTSHEET_REQUESTS_SHEET_ID",
  history: "SMARTSHEET_HISTORY_SHEET_ID",
};

/** Sheet id for `kind`, or undefined when the token or the sheet id is absent. */
export function smartsheetSheetId(kind: SmartsheetSheetKind): string | undefined {
  if (!process.env.SMARTSHEET_ACCESS_TOKEN) return undefined;
  return process.env[SHEET_ENV[kind]] || undefined;
}

/** Rows keyed by column title. */
export async function fetchSheetRows(sheetId: string): Promise<SheetRow[]> {
  const token = process.env.SMARTSHEET_ACCESS_TOKEN;
  if (!token) throw new Error("SMARTSHEET_ACCESS_TOKEN is not set");

  const response = await fetch(`${API_BASE}/sheets/${encodeURIComponent(sheetId)}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw new Error(`Smartsheet GET sheet ${sheetId} failed: ${response.status} ${await response.text()}`);
  }
  const sheet = (await response.json()) as SmartsheetSheet;
  const titles = new Map(sheet.columns.map((column) => [column.id, column.title]));

  return sheet.rows.map((row) => {
    const values: Record<string, CellValue> = {};
    for (const cell of row.cells) {
      const title = titles.get(cell.columnId);
      if (title) values[title] = cell.value ?? null;
    }
    return { rowId: row.id, values };
  });
}

export function cellText(row: SheetRow, column: string): string {
  const value = row.values[column];
  return value === null || value === undefined ? "" : String(value);
}

export function cellNumber(row: SheetRow, column: string): number {
  const value = Number(row.values[column]);
  return Number.isFinite(value) ? value : 0;
}
