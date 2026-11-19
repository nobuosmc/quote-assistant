import { defineTool } from "@grok/agent-sdk/tools";
import * as z from "zod/v4";
import { getQuoteRequest, priceLineItems, stageProposal, type QuoteProposal } from "../lib/quotes.js";

export default defineTool({
  description:
    "Stage a quote proposal for one request. Totals are computed here; pass unit prices only. Writes one row on the proposals sheet, keyed by Request ID, and sets the intake row's status. A repeat updates that same row. With no Smartsheet token, both writes go to the mock sheet. Does not contact anyone.",
  inputSchema: z.object({
    requestId: z.string(),
    currency: z.string().length(3).default("USD"),
    lineItems: z
      .array(
        z.object({
          product: z.string(),
          quantity: z.number().int().positive(),
          unitPrice: z.number().nonnegative(),
        }),
      )
      .min(1),
    validUntil: z.string().describe("ISO date the price is valid until."),
    rationale: z.string().describe("Why this price, citing the history quotes used."),
    historyRefs: z.array(z.string()).default([]).describe("Quote IDs from read_quote_history that informed the price."),
  }),
  effect: "idempotent",
  dryRunResult: ({ requestId }) => ({ staged: false, dryRun: true, requestId }),
  async execute(input, ctx) {
    const request = await getQuoteRequest(ctx.host.kv, input.requestId);
    if (!request) throw new Error(`Unknown quote request ${input.requestId}. Call list_quote_requests first.`);

    const { lineItems, total } = priceLineItems(input.lineItems);
    const proposal: QuoteProposal = {
      requestId: request.requestId,
      customer: request.customer,
      currency: input.currency.toUpperCase(),
      lineItems,
      total,
      validUntil: input.validUntil,
      rationale: input.rationale,
      historyRefs: input.historyRefs,
      stagedAt: new Date().toISOString(),
    };
    return stageProposal(ctx.host.kv, proposal);
  },
});
