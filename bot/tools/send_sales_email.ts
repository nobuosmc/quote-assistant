import { defineTool } from "@grok/agent-sdk/tools";
import * as z from "zod/v4";
import { salesRecipients, sendMail } from "../lib/mail.js";
import { getProposal, saveProposal } from "../lib/quotes.js";

export default defineTool({
  description:
    "Email the sales team about one staged proposal. Requires a staged proposal for the request; sends at most once per request. Recipients come from configuration. `transport: \"mock-outbox\"` means mail is not configured and nothing left the host.",
  inputSchema: z.object({
    requestId: z.string(),
    subject: z.string().max(200),
    body: z.string().describe("Plain-text email body written for the sales team."),
  }),
  effect: "write",
  dryRunResult: ({ requestId, subject }) => ({ sent: false, dryRun: true, requestId, subject }),
  async execute({ requestId, subject, body }, ctx) {
    const proposal = await getProposal(ctx.host.kv, requestId);
    if (!proposal) throw new Error(`No staged proposal for ${requestId}. Call stage_quote_proposal first.`);
    if (proposal.emailedAt) {
      return { sent: false, reason: "already emailed", requestId, emailedAt: proposal.emailedAt };
    }

    const receipt = await sendMail(
      ctx.host.kv,
      requestId,
      { to: salesRecipients(), subject, body },
      { forceMock: ctx.session.purpose === "eval" },
    );
    await saveProposal(ctx.host.kv, { ...proposal, emailedAt: receipt.sentAt });
    return { sent: true, requestId, ...receipt };
  },
});
