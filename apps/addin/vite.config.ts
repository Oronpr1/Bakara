import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv, type Plugin } from "vite";

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Stable add-in id. Change it only to register a separate add-in (e.g. a test copy). */
const DEFAULT_ADDIN_ID = "ae6084bb-df48-4745-9830-6550629c6958";
const DEV_BASE_URL = "https://localhost:3001";

interface AddinSettings {
  baseUrl: string;
  apiBaseUrl: string;
  clientId: string;
  tenantId: string;
  apiUri: string;
  apiScope: string;
  values: Record<string, string>;
}

function trimSlash(s: string) {
  return s.replace(/\/+$/, "");
}

function escapeXml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Reads the VITE_* settings once, with the derived values the manifest and the app share. */
function settings(env: Record<string, string>, isBuild: boolean): AddinSettings {
  const problems: string[] = [];
  const baseUrl = trimSlash(env.VITE_ADDIN_BASE_URL || DEV_BASE_URL);
  const apiBaseUrl = trimSlash(env.VITE_API_BASE_URL || "http://localhost:3000");
  const clientId = env.VITE_ENTRA_CLIENT_ID || "00000000-0000-0000-0000-000000000000";
  const tenantId = env.VITE_ENTRA_TENANT_ID || "organizations";
  const apiUri = trimSlash(env.VITE_ENTRA_API_URI || `api://${new URL(baseUrl).host}/${clientId}`);
  const apiScope = env.VITE_API_SCOPE || `${apiUri}/access_as_user`;
  const addinId = env.VITE_ADDIN_ID || DEFAULT_ADDIN_ID;

  if (!baseUrl.startsWith("https://")) problems.push("VITE_ADDIN_BASE_URL must be an https:// URL");
  if (!GUID.test(addinId)) problems.push("VITE_ADDIN_ID must be a GUID");
  if (isBuild && !env.VITE_ADDIN_BASE_URL) problems.push(`VITE_ADDIN_BASE_URL is not set; using ${DEV_BASE_URL} (sideloading only)`);
  if (isBuild && !GUID.test(env.VITE_ENTRA_CLIENT_ID ?? "")) problems.push("VITE_ENTRA_CLIENT_ID is not set; sign-in will not work");
  if (isBuild && !GUID.test(env.VITE_ENTRA_TENANT_ID ?? "")) problems.push("VITE_ENTRA_TENANT_ID is not set; sign-in will not work");
  if (isBuild && !env.VITE_API_BASE_URL) problems.push("VITE_API_BASE_URL is not set; using http://localhost:3000");
  for (const p of problems) console.warn(`\x1b[33m[addin] ${p}\x1b[0m`);
  if (env.VITE_ADDIN_STRICT === "true" && problems.length) throw new Error("Add-in configuration incomplete (VITE_ADDIN_STRICT)");

  return {
    baseUrl,
    apiBaseUrl,
    clientId,
    tenantId,
    apiUri,
    apiScope,
    values: {
      ADDIN_ID: addinId,
      ADDIN_VERSION: env.VITE_ADDIN_VERSION || "1.0.0.0",
      PROVIDER_NAME: env.VITE_ADDIN_PROVIDER || "מחלקת בקרה",
      BASE_URL: baseUrl,
      API_ORIGIN: new URL(apiBaseUrl).origin,
      SUPPORT_URL: env.VITE_ADDIN_SUPPORT_URL || `${baseUrl}/support.html`,
      ENTRA_CLIENT_ID: clientId,
      ENTRA_API_URI: apiUri,
    },
  };
}

/** Emits dist/manifest.xml from manifest.xml, filled with this build's URLs and ids. */
function manifestPlugin(s: AddinSettings): Plugin {
  return {
    name: "al-addin-manifest",
    generateBundle() {
      const template = readFileSync(here("./manifest.xml"), "utf8");
      const xml = template.replace(/\{\{([A-Z_]+)\}\}/g, (_, key: string) => {
        const value = s.values[key];
        if (value === undefined) throw new Error(`manifest.xml: unknown placeholder {{${key}}}`);
        return escapeXml(value);
      });
      this.emitFile({ type: "asset", fileName: "manifest.xml", source: xml });
    },
  };
}

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  const s = settings(env, command === "build");
  return {
    base: command === "build" ? `${new URL(s.baseUrl).pathname.replace(/\/?$/, "/")}` : "/",
    plugins: [react(), manifestPlugin(s)],
    define: {
      __ADDIN_CONFIG__: JSON.stringify({
        apiBaseUrl: s.apiBaseUrl,
        clientId: s.clientId,
        tenantId: s.tenantId,
        apiScope: s.apiScope,
      }),
      /** Dev preview (Office and the API mocked) is compiled in for `vite` dev only, unless asked for. */
      __PREVIEW__: JSON.stringify(command === "serve" || env.VITE_ENABLE_PREVIEW === "true"),
    },
    build: {
      target: "es2020",
      rolldownOptions: { input: { index: here("./index.html"), commands: here("./commands.html"), support: here("./support.html") } },
      // MSAL is most of the bundle; the pane loads it once per Word session.
      chunkSizeWarningLimit: 700,
    },
    server: { port: 3001, strictPort: true },
    preview: { port: 3001 },
  };
});
