import { defineEval, includes } from "@grok/agent-sdk/evals";

export default defineEval({
  tags: ["smoke"],
  description: "A poll-style prompt runs the sample flow: list requests, read history, and stage a proposal for each.",
  async test(t) {
    await t.send("Check for new quote requests and handle each one.");
    t.succeeded();
    t.calledTool("read_quote_history");
    t.calledTool("stage_quote_proposal", { count: 2 });
    t.toolOrder(["list_quote_requests", "read_quote_history", "stage_quote_proposal"]);
    t.check(t.reply, includes(/QR-1001/));
  },
});
