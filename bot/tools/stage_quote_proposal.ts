import { defineTool } from "@grok/agent-sdk/tools";
import * as z from "zod/v4";
import { getProposal, getQuoteRequest, priceLineItems, saveProposal, type QuoteProposal } from "../lib/quotes.js";

export default defineTool({
  description:
    "Stage (save) a draft quote proposal for one request. Totals are computed here; pass unit prices only. Re-staging the same request replaces the draft unless it was already emailed. Does not contact anyone.",
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
  async execute(input, ctx) {
    const request = await getQuoteRequest(input.requestId);
    if (!request) throw new Error(`Unknown quote request ${input.requestId}. Call list_quote_requests first.`);

    const existing = await getProposal(ctx.host.kv, input.requestId);
    if (existing?.emailedAt) {
      return { staged: false, reason: "already emailed to sales", proposal: existing };
    }

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
      emailedAt: null,
    };
    await saveProposal(ctx.host.kv, proposal);
    return { staged: true, proposal };
  },
});
