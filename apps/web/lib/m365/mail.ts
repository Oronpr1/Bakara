import type { Mailer, MailMessage } from "../mail";
import type { GraphClient } from "./graph";

/**
 * Sends mail as the college's shared mailbox through Microsoft Graph, so messages never pass
 * through a third-party mail service. IT should limit the app's Mail.Send permission to this
 * one mailbox (Exchange RBAC for Applications / application access policy).
 */
export class GraphMailer implements Mailer {
  constructor(
    private graph: GraphClient,
    private mailbox: string = process.env.M365_MAILBOX ?? "",
  ) {
    if (!mailbox) throw new Error("M365_MAILBOX is not configured");
  }

  async send(m: MailMessage) {
    await this.graph.json("POST", `/users/${encodeURIComponent(this.mailbox)}/sendMail`, {
      message: {
        subject: m.subject,
        body: { contentType: "HTML", content: m.html },
        toRecipients: [{ emailAddress: { address: m.to } }],
      },
      saveToSentItems: false,
    });
  }
}
