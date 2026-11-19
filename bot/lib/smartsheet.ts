import { columnPosition } from "./sheets-config.js";

const API_BASE = "https://api.smartsheet.com/2.0";

export type CellValue = string | number | boolean | null;

/** Where a read or write went: the live API, or sample data when no token is set. */
export type DataSource = "smartsheet" | "mock";

export type SheetCell = { columnId: number; value: CellValue };

export type SheetRow = { id: number; cells: { columnId: number; value?: CellValue }[] };

export type LoadedSheet = {
  id: number;
  name: string;
  columns: { id: number; index: number }[];
  rows: SheetRow[];
};

type ListedSheet = { id: number; name: string };

type SheetPage = {
  id: number;
  name: string;
  columns: { id: number; index?: number }[];
  rows?: SheetRow[];
  totalPages?: number;
};

export function hasSmartsheetToken(): boolean {
  return Boolean(process.env.SMARTSHEET_ACCESS_TOKEN?.trim());
}

/** Exact name match. Zero matches or more than one match is an error. */
export function matchSheetName(sheets: ListedSheet[], name: string): number {
  const matches = sheets.filter((sheet) => sheet.name === name);
  if (matches.length === 0) throw new Error(`No Smartsheet is named "${name}".`);
  if (matches.length > 1) {
    const ids = matches.map((sheet) => sheet.id).join(", ");
    throw new Error(`More than one Smartsheet is named "${name}" (ids ${ids}).`);
  }
  return matches[0].id;
}

/**
 * Column ids by position. Column1 is index 0. A sheet with fewer columns
 * than the map needs is an error. Titles are not consulted.
 */
export function columnIds<F extends string>(sheet: LoadedSheet, positions: Record<F, string>): Record<F, number> {
  const byIndex = new Map<number, number>();
  for (const column of sheet.columns) {
    if (byIndex.has(column.index)) {
      throw new Error(`Sheet "${sheet.name}" has two columns at index ${column.index}.`);
    }
    byIndex.set(column.index, column.id);
  }

  const missing: string[] = [];
  const ids = {} as Record<F, number>;
  for (const field of Object.keys(positions) as F[]) {
    const name = positions[field];
    const id = byIndex.get(columnPosition(name) - 1);
    if (id === undefined) missing.push(`${field} (${name})`);
    else ids[field] = id;
  }

  if (missing.length > 0) {
    throw new Error(
      `Sheet "${sheet.name}" has ${sheet.columns.length} columns, which is fewer than the mapping needs: ${missing.join(", ")}.`,
    );
  }
  return ids;
}

export function textAt(row: SheetRow, columnId: number): string {
  const value = row.cells.find((cell) => cell.columnId === columnId)?.value;
  return value === null || value === undefined ? "" : String(value);
}

export function numberAt(row: SheetRow, columnId: number): number {
  const value = Number(textAt(row, columnId));
  return Number.isFinite(value) ? value : 0;
}

/** Resolve `name` with GET /sheets, then load the sheet and every row page. */
export async function loadSheetByName(name: string): Promise<LoadedSheet> {
  const listed = await listSheets();
  return loadSheet(matchSheetName(listed, name));
}

/**
 * Update the row whose key cell equals `keyValue`, or add one row when none
 * matches. Two matching rows is an error, so a repeat cannot leave a duplicate.
 */
export async function upsertByKey(
  sheet: LoadedSheet,
  keyColumnId: number,
  keyValue: string,
  keyLabel: string,
  cells: SheetCell[],
): Promise<"created" | "updated"> {
  const matches = rowsWithKey(sheet, keyColumnId, keyValue);
  if (matches.length > 1) {
    throw new Error(`Sheet "${sheet.name}" has ${matches.length} rows with ${keyLabel} "${keyValue}".`);
  }
  if (matches.length === 1) {
    await api(`/sheets/${sheet.id}/rows`, "PUT", { rows: [{ id: matches[0].id, cells }] });
    return "updated";
  }
  await api(`/sheets/${sheet.id}/rows`, "POST", { toBottom: true, rows: [{ cells }] });
  return "created";
}

/** Set cells on the one row with this key. Missing or duplicate keys are errors. */
export async function updateMatchingRow(
  sheet: LoadedSheet,
  keyColumnId: number,
  keyValue: string,
  keyLabel: string,
  cells: SheetCell[],
): Promise<void> {
  const matches = rowsWithKey(sheet, keyColumnId, keyValue);
  if (matches.length === 0) {
    throw new Error(`Sheet "${sheet.name}" has no row with ${keyLabel} "${keyValue}".`);
  }
  if (matches.length > 1) {
    throw new Error(`Sheet "${sheet.name}" has ${matches.length} rows with ${keyLabel} "${keyValue}".`);
  }
  await api(`/sheets/${sheet.id}/rows`, "PUT", { rows: [{ id: matches[0].id, cells }] });
}

function rowsWithKey(sheet: LoadedSheet, keyColumnId: number, keyValue: string): SheetRow[] {
  return sheet.rows.filter((row) => textAt(row, keyColumnId) === keyValue);
}

async function listSheets(): Promise<ListedSheet[]> {
  const sheets: ListedSheet[] = [];
  for (let page = 1; page <= 100; page++) {
    const body = (await api(`/sheets?pageSize=100&page=${page}`, "GET")) as {
      data?: ListedSheet[];
      totalPages?: number;
    };
    sheets.push(...(body.data ?? []));
    if (page >= (body.totalPages ?? 1)) break;
  }
  return sheets;
}

async function loadSheet(id: number): Promise<LoadedSheet> {
  const pageSize = 500;
  const first = (await api(`/sheets/${id}?pageSize=${pageSize}&page=1`, "GET")) as SheetPage;
  const rows = [...(first.rows ?? [])];
  const totalPages = first.totalPages ?? 1;
  for (let page = 2; page <= totalPages && page <= 100; page++) {
    const next = (await api(`/sheets/${id}?pageSize=${pageSize}&page=${page}`, "GET")) as SheetPage;
    rows.push(...(next.rows ?? []));
  }
  if (first.columns.some((column) => typeof column.index !== "number")) {
    throw new Error(`Sheet "${first.name}" column response has no index.`);
  }
  return {
    id: first.id,
    name: first.name,
    columns: first.columns.map((column) => ({ id: column.id, index: column.index as number })),
    rows,
  };
}

async function api(path: string, method: "GET" | "POST" | "PUT", body?: unknown): Promise<unknown> {
  const token = process.env.SMARTSHEET_ACCESS_TOKEN?.trim();
  if (!token) throw new Error("SMARTSHEET_ACCESS_TOKEN is not set");

  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 300);
    throw new Error(`Smartsheet ${method} ${path} failed: ${response.status} ${detail}`);
  }
  if (response.status === 204) return {};
  return response.json();
}
