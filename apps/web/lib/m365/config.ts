import { SharePointDocumentHost, type DocumentHost } from "./documents";
import { GraphClient } from "./graph";

type Env = Record<string, string | undefined>;

/** Whether the app can sign in to Microsoft Graph at all (see credentialFromEnv). */
export function graphConfigured(env: Env = process.env): boolean {
  return env.M365_USE_MANAGED_IDENTITY === "true" || Boolean(env.M365_TENANT_ID && env.M365_CLIENT_ID);
}

/** SharePoint working files are on when Graph is configured and the letters site is named. */
export function documentsConfigured(env: Env = process.env): boolean {
  return graphConfigured(env) && Boolean(env.M365_SITE_ID);
}

let graph: GraphClient | undefined;

export function getGraphClient(): GraphClient {
  graph ??= new GraphClient();
  return graph;
}

// undefined = not decided yet; null = Microsoft 365 is not configured.
let host: DocumentHost | null | undefined;

/**
 * The live document store, or null when Microsoft 365 is not configured (local development,
 * tests). Every SharePoint feature checks this and hides itself when it is null.
 */
export function getDocumentHost(): DocumentHost | null {
  if (host === undefined) host = documentsConfigured() ? new SharePointDocumentHost(getGraphClient()) : null;
  return host;
}

/** Lets tests use a fake host. `undefined` goes back to reading the environment. */
export function setDocumentHost(h: DocumentHost | null | undefined) {
  host = h;
}
