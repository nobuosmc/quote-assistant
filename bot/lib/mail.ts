import type { HostKvApi } from "@grok/agent-sdk";

export type MailTransport = "microsoft-graph" | "mock-outbox";

export type OutgoingMail = {
  to: string[];
  subject: string;
  body: string;
};

export type MailReceipt = {
  transport: MailTransport;
  to: string[];
  subject: string;
  sentAt: string;
};

const DEFAULT_MOCK_RECIPIENT = "sales@example.com";

type GraphConfig = {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  sender: string;
};

function graphConfig(): GraphConfig | undefined {
  const { MAIL_TENANT_ID, MAIL_CLIENT_ID, MAIL_CLIENT_SECRET, MAIL_SENDER } = process.env;
  if (!MAIL_TENANT_ID || !MAIL_CLIENT_ID || !MAIL_CLIENT_SECRET || !MAIL_SENDER) return undefined;
  return { tenantId: MAIL_TENANT_ID, clientId: MAIL_CLIENT_ID, clientSecret: MAIL_CLIENT_SECRET, sender: MAIL_SENDER };
}

export function salesRecipients(): string[] {
  const configured = (process.env.SALES_EMAIL_TO ?? "")
    .split(",")
    .map((address) => address.trim())
    .filter(Boolean);
  return configured.length > 0 ? configured : [DEFAULT_MOCK_RECIPIENT];
}

/**
 * Sends through Microsoft Graph when MAIL_* credentials are set and
 * `forceMock` is false. Otherwise writes the message to the KV outbox at
 * `outbox/<key>`, so unconfigured hosts and evals never send real mail.
 */
export async function sendMail(
  kv: HostKvApi,
  key: string,
  mail: OutgoingMail,
  options: { forceMock: boolean },
): Promise<MailReceipt> {
  const sentAt = new Date().toISOString();
  const config = options.forceMock ? undefined : graphConfig();
  if (!config) {
    await kv.put(`outbox/${key}`, { ...mail, sentAt });
    return { transport: "mock-outbox", to: mail.to, subject: mail.subject, sentAt };
  }

  const token = await graphToken(config);
  const response = await fetch(
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(config.sender)}/sendMail`,
    {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({
        message: {
          subject: mail.subject,
          body: { contentType: "Text", content: mail.body },
          toRecipients: mail.to.map((address) => ({ emailAddress: { address } })),
        },
        saveToSentItems: true,
      }),
    },
  );
  if (!response.ok) {
    throw new Error(`Graph sendMail failed: ${response.status} ${await response.text()}`);
  }
  return { transport: "microsoft-graph", to: mail.to, subject: mail.subject, sentAt };
}

async function graphToken(config: GraphConfig): Promise<string> {
  const response = await fetch(
    `https://login.microsoftonline.com/${encodeURIComponent(config.tenantId)}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: config.clientId,
        client_secret: config.clientSecret,
        scope: "https://graph.microsoft.com/.default",
      }),
    },
  );
  if (!response.ok) {
    throw new Error(`Graph token request failed: ${response.status}`);
  }
  const { access_token: accessToken } = (await response.json()) as { access_token: string };
  return accessToken;
}
