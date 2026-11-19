/**
 * App-only Microsoft Graph client for the QuoteTracking workbook.
 *
 * The app registration needs Files.Read.All, with admin consent, and the
 * workbook must be in a OneDrive or SharePoint drive that registration can
 * read. Client credentials use the /.default scope, so the granted
 * application permissions are what the token carries.
 */

export type WorkbookCell = string | number | boolean | null;

export type WorkbookHit = { name?: string; id?: string; driveId?: string };

export type WorkbookRange = { columnCount: number; values: WorkbookCell[][] };

export type GraphConfig = { tenantId: string; clientId: string; clientSecret: string };

type SearchHit = {
  resource?: { name?: string; id?: string; parentReference?: { driveId?: string } };
};

type SearchResponse = {
  value?: { hitsContainers?: { hits?: SearchHit[]; moreResultsAvailable?: boolean }[] }[];
};

const GRAPH = "https://graph.microsoft.com/v1.0";

/**
 * All three variables, or none. A partial set is a configuration error.
 * None means the caller should use sample history.
 */
export function graphConfig(): GraphConfig | undefined {
  const tenantId = process.env.MS_GRAPH_TENANT_ID?.trim() ?? "";
  const clientId = process.env.MS_GRAPH_CLIENT_ID?.trim() ?? "";
  const clientSecret = process.env.MS_GRAPH_CLIENT_SECRET?.trim() ?? "";
  const set = [tenantId, clientId, clientSecret].filter(Boolean).length;
  if (set === 0) return undefined;
  if (set < 3) {
    throw new Error("Set all of MS_GRAPH_TENANT_ID, MS_GRAPH_CLIENT_ID, and MS_GRAPH_CLIENT_SECRET, or none of them.");
  }
  return { tenantId, clientId, clientSecret };
}

/**
 * Exact file name. The same drive item reported twice counts once.
 * Zero matches or more than one distinct file is an error.
 */
export function matchWorkbook(hits: WorkbookHit[], fileName: string): { itemId: string; driveId: string } {
  const named = new Map<string, WorkbookHit>();
  for (const hit of hits) {
    if (hit.name !== fileName) continue;
    named.set(`${hit.driveId ?? ""}:${hit.id ?? ""}`, hit);
  }
  if (named.size === 0) throw new Error(`No workbook named "${fileName}" was found.`);
  if (named.size > 1) throw new Error(`More than one workbook is named "${fileName}" (${named.size}).`);
  const hit = [...named.values()][0];
  if (!hit.id || !hit.driveId) throw new Error(`Workbook "${fileName}" was found, but its drive id is missing.`);
  return { itemId: hit.id, driveId: hit.driveId };
}

/** The worksheet with the lowest position. */
export function firstWorksheet(sheets: { id?: string; position?: number }[]): string {
  if (sheets.length === 0) throw new Error("QuoteTracking.xlsx has no worksheets.");
  if (sheets.some((sheet) => typeof sheet.position !== "number" || !sheet.id)) {
    throw new Error("QuoteTracking.xlsx worksheet response has no position.");
  }
  const sorted = [...sheets].sort((a, b) => a.position! - b.position!);
  const first = sorted[0];
  if (sorted.some((sheet) => sheet !== first && sheet.position === first.position)) {
    throw new Error("QuoteTracking.xlsx has more than one worksheet in the first position.");
  }
  return first.id!;
}

/** Search the drives the app can read, then return the first worksheet's used range. */
export async function readWorkbook(fileName: string): Promise<WorkbookRange> {
  const config = graphConfig();
  if (!config) throw new Error("MS_GRAPH_TENANT_ID, MS_GRAPH_CLIENT_ID, and MS_GRAPH_CLIENT_SECRET are not set.");

  const token = await accessToken(config);
  const located = matchWorkbook(await searchWorkbooks(token, fileName), fileName);
  const worksheetId = firstWorksheet(await listWorksheets(token, located));
  return readUsedRange(token, located, worksheetId);
}

async function accessToken(config: GraphConfig): Promise<string> {
  const response = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(config.tenantId)}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: config.clientId,
      client_secret: config.clientSecret,
      scope: "https://graph.microsoft.com/.default",
    }),
  });
  if (!response.ok) throw new Error(`Microsoft Graph token request failed: ${response.status}`);
  const body = (await response.json()) as { access_token?: string };
  if (!body.access_token) throw new Error("Microsoft Graph token response had no access_token.");
  return body.access_token;
}

async function searchWorkbooks(token: string, fileName: string): Promise<WorkbookHit[]> {
  const hits: WorkbookHit[] = [];
  const pageSize = 25;
  for (let page = 0; page < 20; page++) {
    const body = (await graph(token, "/search/query", "POST", {
      requests: [
        {
          entityTypes: ["driveItem"],
          query: { queryString: `filename:"${fileName}"` },
          from: page * pageSize,
          size: pageSize,
        },
      ],
    })) as SearchResponse;
    const container = body.value?.[0]?.hitsContainers?.[0];
    for (const hit of container?.hits ?? []) {
      hits.push({
        name: hit.resource?.name,
        id: hit.resource?.id,
        driveId: hit.resource?.parentReference?.driveId,
      });
    }
    const named = hits.filter((hit) => hit.name === fileName);
    const distinct = new Set(named.map((hit) => `${hit.driveId ?? ""}:${hit.id ?? ""}`));
    if (distinct.size > 1 || !container?.moreResultsAvailable) return hits;
  }
  throw new Error(`Search for "${fileName}" did not finish.`);
}

async function listWorksheets(token: string, item: { driveId: string; itemId: string }) {
  const body = (await graph(
    token,
    `/drives/${encodeURIComponent(item.driveId)}/items/${encodeURIComponent(item.itemId)}/workbook/worksheets?$select=id,position`,
    "GET",
  )) as { value?: { id?: string; position?: number }[] };
  return body.value ?? [];
}

async function readUsedRange(token: string, item: { driveId: string; itemId: string }, worksheetId: string): Promise<WorkbookRange> {
  const path =
    `/drives/${encodeURIComponent(item.driveId)}/items/${encodeURIComponent(item.itemId)}` +
    `/workbook/worksheets/${encodeURIComponent(worksheetId)}/usedRange`;
  const body = (await graph(token, path, "GET")) as { columnCount?: number; values?: WorkbookCell[][] };
  if (!body.values) throw new Error("QuoteTracking.xlsx used range had no values.");
  const columnCount =
    typeof body.columnCount === "number"
      ? body.columnCount
      : body.values.reduce((max, row) => Math.max(max, row.length), 0);
  return { columnCount, values: body.values };
}

async function graph(token: string, path: string, method: "GET" | "POST", body?: unknown): Promise<unknown> {
  const response = await fetch(`${GRAPH}${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 300);
    throw new Error(`Microsoft Graph ${method} ${path} failed: ${response.status} ${detail}`);
  }
  return response.json();
}
