import { defineTool } from "@grok/agent-sdk/tools";
import * as z from "zod/v4";
import { listNewQuoteRequests, listQuoteRequests } from "../lib/quotes.js";

export default defineTool({
  description:
    "List quote requests from the Smartsheet intake sheet. By default returns only open requests that have no staged proposal yet. `source: \"mock\"` means Smartsheet is not configured and the rows are sample data.",
  inputSchema: z.object({
    onlyNew: z.boolean().default(true).describe("Return only open requests without a staged proposal."),
  }),
  effect: "read",
  async execute({ onlyNew }, ctx) {
    const { source, requests } = onlyNew ? await listNewQuoteRequests(ctx.host.kv) : await listQuoteRequests();
    return { source, count: requests.length, requests };
  },
});
