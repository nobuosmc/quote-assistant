import type { HostKvApi, JsonValue } from "@grok/agent-sdk";
import { sheetsConfig } from "./sheets-config.js";
import {
  columnIds,
  hasSmartsheetToken,
  loadSheetByName,
  numberAt,
  textAt,
  updateMatchingRow,
  upsertByKey,
  type DataSource,
  type SheetCell,
} from "./smartsheet.js";
import type { ProposalField } from "./sheets-config.js";

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
};

export type StageResult = {
  staged: true;
  target: DataSource;
  write: "created" | "updated";
  sheetName: string;
  requestStatus: string;
  proposal: QuoteProposal;
};

const OPEN_STATUSES = new Set(["", "new", "open", "requested"]);

/** Status overrides applied to the sample intake rows. */
const MOCK_STATUS_KEY = "mock/request-status";
/** Proposals keyed by Request ID. A repeat replaces the same entry. */
const MOCK_PROPOSALS_KEY = "mock/proposals";

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

export async function listQuoteRequests(kv: HostKvApi): Promise<{ source: DataSource; requests: QuoteRequest[] }> {
  if (!hasSmartsheetToken()) {
    const statuses = await readStringMap(kv, MOCK_STATUS_KEY);
    const requests = MOCK_REQUESTS.map((request) => ({
      ...request,
      status: statuses[request.requestId] ?? request.status,
    }));
    return { source: "mock", requests };
  }

  const { requests: intake } = sheetsConfig();
  const sheet = await loadSheetByName(intake.sheetName);
  const columns = columnIds(sheet, intake.columns);
  const requests = sheet.rows
    .map((row) => ({
      requestId: textAt(row, columns.requestId) || `row-${row.id}`,
      customer: textAt(row, columns.customer),
      contactEmail: textAt(row, columns.contactEmail),
      product: textAt(row, columns.product),
      quantity: numberAt(row, columns.quantity),
      neededBy: textAt(row, columns.neededBy),
      notes: textAt(row, columns.notes),
      status: textAt(row, columns.status),
    }))
    .filter((request) => request.customer || request.product);
  return { source: "smartsheet", requests };
}

/** Requests whose status is still open. A staged request is no longer open. */
export async function listNewQuoteRequests(kv: HostKvApi) {
  const { source, requests } = await listQuoteRequests(kv);
  const fresh = requests.filter((request) => OPEN_STATUSES.has(request.status.trim().toLowerCase()));
  return { source, requests: fresh };
}

export async function getQuoteRequest(kv: HostKvApi, requestId: string): Promise<QuoteRequest | undefined> {
  const { requests } = await listQuoteRequests(kv);
  return requests.find((request) => request.requestId === requestId);
}

/**
 * Write the proposal (one row per Request ID) and set the intake row's status.
 * With no token, both writes go to the mock store in KV.
 */
export async function stageProposal(kv: HostKvApi, proposal: QuoteProposal): Promise<StageResult> {
  const config = sheetsConfig();
  if (OPEN_STATUSES.has(config.requests.proposedStatus.trim().toLowerCase())) {
    throw new Error(
      `Proposed status "${config.requests.proposedStatus}" is still an open status, so the request would be polled again.`,
    );
  }

  if (!hasSmartsheetToken()) return stageMock(kv, proposal, config.proposals.sheetName, config.requests.proposedStatus);

  const proposalSheet = await loadSheetByName(config.proposals.sheetName);
  const proposalColumns = columnIds(proposalSheet, config.proposals.columns);
  const write = await upsertByKey(
    proposalSheet,
    proposalColumns.requestId,
    proposal.requestId,
    config.proposals.columns.requestId,
    proposalCells(proposal, proposalColumns),
  );

  const intake = await loadSheetByName(config.requests.sheetName);
  const intakeColumns = columnIds(intake, config.requests.columns);
  try {
    await updateMatchingRow(intake, intakeColumns.requestId, proposal.requestId, config.requests.columns.requestId, [
      { columnId: intakeColumns.status, value: config.requests.proposedStatus },
    ]);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Proposal row ${write} on "${config.proposals.sheetName}" for ${proposal.requestId}, but the intake status was not updated: ${message}`,
    );
  }

  return {
    staged: true,
    target: "smartsheet",
    write,
    sheetName: config.proposals.sheetName,
    requestStatus: config.requests.proposedStatus,
    proposal,
  };
}

export function priceLineItems(items: { product: string; quantity: number; unitPrice: number }[]) {
  const lineItems: LineItem[] = items.map((item) => ({
    ...item,
    lineTotal: roundCents(item.quantity * item.unitPrice),
  }));
  const total = roundCents(lineItems.reduce((sum, item) => sum + item.lineTotal, 0));
  return { lineItems, total };
}

async function stageMock(kv: HostKvApi, proposal: QuoteProposal, sheetName: string, requestStatus: string): Promise<StageResult> {
  const proposals = await readProposalMap(kv);
  const write = proposals[proposal.requestId] ? "updated" : "created";
  proposals[proposal.requestId] = proposal;
  await kv.put(MOCK_PROPOSALS_KEY, proposals);

  const statuses = await readStringMap(kv, MOCK_STATUS_KEY);
  statuses[proposal.requestId] = requestStatus;
  await kv.put(MOCK_STATUS_KEY, statuses);

  return { staged: true, target: "mock", write, sheetName, requestStatus, proposal };
}

function proposalCells(proposal: QuoteProposal, columns: Record<ProposalField, number>): SheetCell[] {
  const single = proposal.lineItems.length === 1 ? proposal.lineItems[0] : undefined;
  const values: Record<ProposalField, CellValue> = {
    requestId: proposal.requestId,
    customer: proposal.customer,
    currency: proposal.currency,
    product: single ? single.product : proposal.lineItems.map((item) => item.product).join("; "),
    quantity: single ? single.quantity : proposal.lineItems.reduce((sum, item) => sum + item.quantity, 0),
    unitPrice: single ? single.unitPrice : null,
    lineItems: proposal.lineItems
      .map((item) => `${item.product} x ${item.quantity} @ ${item.unitPrice} = ${item.lineTotal}`)
      .join("; "),
    total: proposal.total,
    validUntil: proposal.validUntil,
    rationale: proposal.rationale,
    historyRefs: proposal.historyRefs.join(", "),
    stagedAt: proposal.stagedAt,
  };
  return (Object.keys(values) as ProposalField[]).map((field) => ({ columnId: columns[field], value: values[field] }));
}

type CellValue = string | number | null;

async function readStringMap(kv: HostKvApi, key: string): Promise<Record<string, string>> {
  const value = await kv.get(key);
  if (!isRecord(value)) return {};
  const statuses: Record<string, string> = {};
  for (const [id, status] of Object.entries(value)) {
    if (typeof status === "string") statuses[id] = status;
  }
  return statuses;
}

async function readProposalMap(kv: HostKvApi): Promise<Record<string, QuoteProposal>> {
  const value = await kv.get(MOCK_PROPOSALS_KEY);
  if (!isRecord(value)) return {};
  return value as Record<string, QuoteProposal>;
}

function isRecord(value: JsonValue | undefined): value is { [key: string]: JsonValue } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function roundCents(value: number): number {
  return Math.round(value * 100) / 100;
}
