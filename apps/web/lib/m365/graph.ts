import { ClientCertificateCredential, ClientSecretCredential, ManagedIdentityCredential, type TokenCredential } from "@azure/identity";

const GRAPH = "https://graph.microsoft.com/v1.0";
const SCOPE = "https://graph.microsoft.com/.default";

/**
 * How the app signs in to Microsoft Graph, in order of preference:
 * 1. Managed identity when hosted in the college's Azure (no secret exists anywhere).
 * 2. A certificate on the Entra app registration.
 * 3. A client secret (development only).
 */
function credentialFromEnv(): TokenCredential {
  const tenant = process.env.M365_TENANT_ID;
  const client = process.env.M365_CLIENT_ID;
  if (process.env.M365_USE_MANAGED_IDENTITY === "true")
    return new ManagedIdentityCredential(client ? { clientId: client } : undefined);
  if (!tenant || !client) throw new Error("Microsoft 365 is not configured (M365_TENANT_ID, M365_CLIENT_ID)");
  if (process.env.M365_CERT_PATH)
    return new ClientCertificateCredential(tenant, client, { certificatePath: process.env.M365_CERT_PATH });
  if (process.env.M365_CLIENT_SECRET) {
    if (process.env.NODE_ENV === "production") throw new Error("Use a managed identity or certificate in production");
    return new ClientSecretCredential(tenant, client, process.env.M365_CLIENT_SECRET);
  }
  throw new Error("No Microsoft 365 credential configured");
}

export class GraphError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "GraphError";
  }
}

type Fetch = typeof fetch;

/** Minimal Graph client: auth, JSON, binary bodies, and retry on throttling. */
export class GraphClient {
  constructor(
    private credential: TokenCredential = credentialFromEnv(),
    private fetchImpl: Fetch = fetch,
    private sleep = (ms: number) => new Promise((r) => setTimeout(r, ms)),
  ) {}

  private async token() {
    const t = await this.credential.getToken(SCOPE);
    if (!t) throw new Error("Could not get a Microsoft Graph token");
    return t.token;
  }

  /** Raw request. `path` is relative to v1.0 or an absolute Graph URL (e.g. a nextLink). */
  async request(
    method: string,
    path: string,
    opts: { body?: BodyInit; json?: unknown; headers?: Record<string, string>; redirect?: RequestRedirect } = {},
  ): Promise<Response> {
    const url = path.startsWith("https://") ? path : `${GRAPH}${path}`;
    for (let attempt = 0; ; attempt++) {
      const headers: Record<string, string> = { Authorization: `Bearer ${await this.token()}`, ...opts.headers };
      let body = opts.body;
      if (opts.json !== undefined) {
        headers["Content-Type"] = "application/json";
        body = JSON.stringify(opts.json);
      }
      const res = await this.fetchImpl(url, { method, headers, body, redirect: opts.redirect ?? "follow" });
      if ((res.status === 429 || res.status === 503 || res.status === 504) && attempt < 4) {
        const retryAfter = Number(res.headers.get("Retry-After"));
        await this.sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 2 ** attempt * 1000);
        continue;
      }
      if (!res.ok) {
        let code = "unknown";
        let message = res.statusText;
        try {
          const err = (await res.json()) as { error?: { code?: string; message?: string } };
          code = err.error?.code ?? code;
          message = err.error?.message ?? message;
        } catch {
          // not JSON
        }
        throw new GraphError(res.status, code, `Graph ${method} ${path}: ${res.status} ${code} ${message}`);
      }
      return res;
    }
  }

  async json<T>(method: string, path: string, json?: unknown): Promise<T> {
    const res = await this.request(method, path, json === undefined ? {} : { json });
    const text = await res.text(); // 202/204 replies have no body
    return (text ? JSON.parse(text) : undefined) as T;
  }

  async bytes(path: string): Promise<Uint8Array> {
    const res = await this.request("GET", path);
    return new Uint8Array(await res.arrayBuffer());
  }
}
