import { defineEval, includes } from "@grok/agent-sdk/evals";

export default defineEval({
  tags: ["smoke"],
  description: "A poll-style prompt runs the full flow on the sample requests: list, history, stage, email sales.",
  async test(t) {
    await t.send("Check for new quote requests and handle each one.");
    t.succeeded();
    t.calledTool("read_quote_history");
    t.calledTool("stage_quote_proposal", { count: 2 });
    t.toolOrder(["list_quote_requests", "stage_quote_proposal", "send_sales_email"]);
    t.check(t.reply, includes(/QR-1001/));
  },
});
