import { defineSchedule } from "@grok/agent-sdk/schedules";

export default defineSchedule({
  cron: "*/15 * * * *",
  async run({ callTool, receive, waitUntil, appAuth }) {
    const outcome = await callTool("list_quote_requests", { onlyNew: true });
    if (outcome.isError) throw new Error(`list_quote_requests failed: ${JSON.stringify(outcome.result)}`);

    const { count, requests } = outcome.result as { count: number; requests: { requestId: string }[] };
    if (count === 0) return;

    const ids = requests.map((request) => request.requestId).join(", ");
    waitUntil(
      receive("http", {
        message: `Scheduled poll found ${count} new quote request(s): ${ids}. Follow the quote-proposal skill for each one: read history, stage a proposal, and email sales. Then summarize what you did.`,
        auth: appAuth,
      }),
    );
  },
});
