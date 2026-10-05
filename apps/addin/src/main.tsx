import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { HttpApi } from "./api";
import { App, type Host } from "./App";
import { getApiToken } from "./auth";
import { isWordOnWeb, supportsNestedAppAuth } from "./office";
import { ApiError, type Api } from "./types";
import { wordDocument } from "./word";
import "./styles.css";

const unavailable: Api = {
  findLetter: () => Promise.reject(new ApiError("unavailable", 0)),
  upload: () => Promise.reject(new ApiError("unavailable", 0)),
  snapshot: () => Promise.reject(new ApiError("unavailable", 0)),
};

const outsideWord: Host = {
  word: { documentUrl: () => "", saveDocument: async () => {}, getFile: async () => new Uint8Array() },
  api: unavailable,
  inWord: false,
  wordOnWeb: false,
  nestedAuth: false,
};

async function resolveHost(): Promise<Host> {
  const scenario = new URLSearchParams(window.location.search).get("preview");
  if (__PREVIEW__ && scenario) {
    const { installPreview } = await import("./preview/install");
    return installPreview(scenario);
  }
  // office.js did not load (opened in a plain browser offline, or blocked).
  if (typeof Office === "undefined") return outsideWord;
  const info = await Office.onReady();
  if (info.host !== Office.HostType.Word) return outsideWord;
  return {
    word: wordDocument(),
    api: new HttpApi(__ADDIN_CONFIG__.apiBaseUrl, getApiToken),
    inWord: true,
    wordOnWeb: isWordOnWeb(),
    nestedAuth: supportsNestedAppAuth(),
  };
}

void resolveHost().then((host) => {
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App host={host} />
    </StrictMode>,
  );
});
