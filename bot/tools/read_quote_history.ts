import { defineTool } from "@grok/agent-sdk/tools";
import * as z from "zod/v4";
import { readQuoteHistory } from "../lib/history.js";

export default defineTool({
  description:
    "Read past quotes, newest first, filtered by customer and/or product (case-insensitive substring). Use before pricing a proposal. `source: \"mock\"` means the rows are sample data.",
  inputSchema: z.object({
    customer: z.string().optional(),
    product: z.string().optional(),
    limit: z.number().int().min(1).max(50).default(10),
  }),
  effect: "read",
  async execute(filter) {
    const { source, entries } = await readQuoteHistory(filter);
    return { source, count: entries.length, entries };
  },
});
