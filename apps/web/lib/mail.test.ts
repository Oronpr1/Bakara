import { afterEach, describe, expect, it, vi } from "vitest";
import { getMailer, mailerFromEnv, setMailer } from "./mail";
import { GraphMailer } from "./m365/mail";

const message = { to: "a@college.ac.il", subject: "s", text: "t", html: "<p>t</p>" };

describe("choosing how mail is sent", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    setMailer(undefined);
  });

  it("sends through the Microsoft 365 shared mailbox when one is configured, even with SMTP set", () => {
    // Graph credentials are read when the client is created; no request is made here.
    vi.stubEnv("M365_TENANT_ID", "tenant");
    vi.stubEnv("M365_CLIENT_ID", "client");
    vi.stubEnv("M365_CLIENT_SECRET", "secret");
    const mailer = mailerFromEnv({ M365_MAILBOX: "letters@college.ac.il", SMTP_URL: "smtp://localhost:1025" });
    expect(mailer).toBeInstanceOf(GraphMailer);
  });

  it("uses SMTP without a mailbox, and the log without either", () => {
    expect(mailerFromEnv({ SMTP_URL: "smtp://localhost:1025" }).constructor.name).toBe("SmtpMailer");
    expect(mailerFromEnv({}).constructor.name).toBe("LogMailer");
  });

  it("refuses to drop mail silently in production", async () => {
    vi.stubEnv("M365_MAILBOX", "");
    vi.stubEnv("SMTP_URL", "");
    vi.stubEnv("NODE_ENV", "production");
    await expect(getMailer().send(message)).rejects.toThrow(/No mail transport/);
  });
});
