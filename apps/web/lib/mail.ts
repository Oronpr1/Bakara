import nodemailer from "nodemailer";
import { getGraphClient } from "./m365/config";
import { GraphMailer } from "./m365/mail";

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export interface Mailer {
  send(message: MailMessage): Promise<void>;
}

/** Development mailer (Mailpit), or a plain SMTP relay where Microsoft 365 is not used. */
class SmtpMailer implements Mailer {
  private transport;
  constructor(url: string) {
    this.transport = nodemailer.createTransport(url);
  }
  async send(m: MailMessage) {
    await this.transport.sendMail({ from: process.env.MAIL_FROM ?? "letters@example.test", ...m });
  }
}

class LogMailer implements Mailer {
  async send(m: MailMessage) {
    if (process.env.NODE_ENV === "production") throw new Error("No mail transport configured");
    console.info(`[mail] to=${m.to} subject=${m.subject}\n${m.text}`);
  }
}

let mailer: Mailer | undefined;

/**
 * Production mail goes through the college's own Microsoft 365 shared mailbox (Graph sendMail)
 * when M365_MAILBOX is set; otherwise SMTP_URL; otherwise the log (refused in production).
 */
export function mailerFromEnv(env: Record<string, string | undefined> = process.env): Mailer {
  if (env.M365_MAILBOX) return new GraphMailer(getGraphClient(), env.M365_MAILBOX);
  if (env.SMTP_URL) return new SmtpMailer(env.SMTP_URL);
  return new LogMailer();
}

export function getMailer(): Mailer {
  mailer ??= mailerFromEnv();
  return mailer;
}

/** Lets tests capture outgoing mail. */
export function setMailer(m: Mailer | undefined) {
  mailer = m;
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/** Hebrew RTL email wrapper. */
export function rtlEmail(bodyHtml: string): string {
  return `<div dir="rtl" style="font-family:Arial,sans-serif;font-size:15px;line-height:1.6;color:#1d2430">${bodyHtml}</div>`;
}
