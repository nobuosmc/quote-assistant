import type { HostKvApi } from "@grok/agent-sdk";
import { cellNumber, cellText, fetchSheetRows, smartsheetSheetId, type DataSource } from "./smartsheet.js";

export type QuoteRequest = {
  requestId: string;
  customer: string;
  contactEmail: string;
  product: string;
  quantity: number;
  neededBy: string;
  notes: string;
  status: string;
};

export type LineItem = {
  product: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
};

export type QuoteProposal = {
  requestId: string;
  customer: string;
  currency: string;
  lineItems: LineItem[];
  total: number;
  validUntil: string;
  rationale: string;
  historyRefs: string[];
  stagedAt: string;
  emailedAt: string | null;
};

/** Column titles expected on the quote-requests sheet. */
export const REQUEST_COLUMNS = {
  requestId: "Request ID",
  customer: "Customer",
  contactEmail: "Contact Email",
  product: "Product",
  quantity: "Quantity",
  neededBy: "Needed By",
  notes: "Notes",
  status: "Status",
} as const;

const OPEN_STATUSES = new Set(["", "new", "open", "requested"]);

const MOCK_REQUESTS: QuoteRequest[] = [
  {
    requestId: "QR-1001",
    customer: "Northwind Traders",
    contactEmail: "buyer@northwind.example",
    product: "Industrial Sensor Kit",
    quantity: 40,
    neededBy: "2026-12-15",
    notes: "Repeat customer. Asked about volume discount.",
    status: "New",
  },
  {
    requestId: "QR-1002",
    customer: "Contoso Manufacturing",
    contactEmail: "procurement@contoso.example",
    product: "Gateway Controller",
    quantity: 5,
    neededBy: "2027-01-10",
    notes: "First quote for this customer.",
    status: "New",
  },
];

const proposalKey = (requestId: string) => `proposals/${requestId}`;

export async function listQuoteRequests(): Promise<{ source: DataSource; requests: QuoteRequest[] }> {
  const sheetId = smartsheetSheetId("requests");
  if (!sheetId) return { source: "mock", requests: MOCK_REQUESTS };

  const rows = await fetchSheetRows(sheetId);
  const requests = rows
    .map((row) => ({
      requestId: cellText(row, REQUEST_COLUMNS.requestId) || `row-${row.rowId}`,
      customer: cellText(row, REQUEST_COLUMNS.customer),
      contactEmail: cellText(row, REQUEST_COLUMNS.contactEmail),
      product: cellText(row, REQUEST_COLUMNS.product),
      quantity: cellNumber(row, REQUEST_COLUMNS.quantity),
      neededBy: cellText(row, REQUEST_COLUMNS.neededBy),
      notes: cellText(row, REQUEST_COLUMNS.notes),
      status: cellText(row, REQUEST_COLUMNS.status),
    }))
    .filter((request) => request.customer || request.product);
  return { source: "smartsheet", requests };
}

/** Open requests that have no staged proposal yet. */
export async function listNewQuoteRequests(kv: HostKvApi) {
  const { source, requests } = await listQuoteRequests();
  const fresh: QuoteRequest[] = [];
  for (const request of requests) {
    if (!OPEN_STATUSES.has(request.status.trim().toLowerCase())) continue;
    if ((await kv.get(proposalKey(request.requestId))) !== undefined) continue;
    fresh.push(request);
  }
  return { source, requests: fresh };
}

export async function getQuoteRequest(requestId: string): Promise<QuoteRequest | undefined> {
  const { requests } = await listQuoteRequests();
  return requests.find((request) => request.requestId === requestId);
}

export async function getProposal(kv: HostKvApi, requestId: string): Promise<QuoteProposal | undefined> {
  const value = await kv.get(proposalKey(requestId));
  return value === undefined ? undefined : (value as QuoteProposal);
}

export async function saveProposal(kv: HostKvApi, proposal: QuoteProposal): Promise<void> {
  await kv.put(proposalKey(proposal.requestId), proposal);
}

export function priceLineItems(items: { product: string; quantity: number; unitPrice: number }[]) {
  const lineItems: LineItem[] = items.map((item) => ({
    ...item,
    lineTotal: roundCents(item.quantity * item.unitPrice),
  }));
  const total = roundCents(lineItems.reduce((sum, item) => sum + item.lineTotal, 0));
  return { lineItems, total };
}

function roundCents(value: number): number {
  return Math.round(value * 100) / 100;
}
