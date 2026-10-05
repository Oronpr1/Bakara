import nodemailer from "nodemailer";

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export interface Mailer {
  send(message: MailMessage): Promise<void>;
}

/**
 * Development and test mailer. Production mail goes through the college's own Microsoft 365
 * mailbox (Graph sendMail), added with the Microsoft 365 integration.
 */
class SmtpMailer implements Mailer {
  private transport = nodemailer.createTransport(process.env.SMTP_URL!);
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

export function getMailer(): Mailer {
  mailer ??= process.env.SMTP_URL ? new SmtpMailer() : new LogMailer();
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
