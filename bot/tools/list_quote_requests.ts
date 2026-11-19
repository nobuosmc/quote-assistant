import { defineTool } from "@grok/agent-sdk/tools";
import * as z from "zod/v4";
import { listNewQuoteRequests, listQuoteRequests } from "../lib/quotes.js";

export default defineTool({
  description:
    "List quote requests from the intake sheet. By default returns only open rows (blank, new, open, or requested). Staging a proposal changes that status, so the row drops off this list. `source: \"mock\"` means no Smartsheet token is set and the rows are sample data.",
  inputSchema: z.object({
    onlyNew: z.boolean().default(true).describe("Return only requests whose status is still open."),
  }),
  effect: "read",
  async execute({ onlyNew }, ctx) {
    const { source, requests } = onlyNew ? await listNewQuoteRequests(ctx.host.kv) : await listQuoteRequests(ctx.host.kv);
    return { source, count: requests.length, requests };
  },
});
