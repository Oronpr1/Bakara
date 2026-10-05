// A tiny stand-in for the parts of Office.js the pane uses, for the browser dev preview and
// unit tests. It mimics Word's behaviour where it matters to us: files come in slices,
// slices must be read from an open file, and only a couple of files may be open at once
// (forgetting closeAsync makes the next getFileAsync fail, as in Word).

export interface MockOfficeOptions {
  url: string;
  platform?: "PC" | "Mac" | "OfficeOnline";
  nestedAppAuth?: boolean;
  docx: Uint8Array;
  pdf: Uint8Array;
  /** Milliseconds per call, so the preview shows its progress steps. */
  delay?: { save?: number; slice?: number; pdf?: number };
  /** Make the next getFileAsync of this type fail. */
  failOn?: "compressed" | "pdf";
  /** Make reading this slice index fail (any file). */
  failSlice?: number;
}

export interface MockOfficeState {
  saves: number;
  openFiles: number;
  opened: number;
  closed: number;
  slicesRead: number;
  /** Writes to the document. The add-in must never make any. */
  writes: number;
  url: string;
}

const MAX_OPEN_FILES = 2;
const wait = (ms = 0) => new Promise((r) => setTimeout(r, ms));

export function installMockOffice(opts: MockOfficeOptions): MockOfficeState {
  const state: MockOfficeState = { saves: 0, openFiles: 0, opened: 0, closed: 0, slicesRead: 0, writes: 0, url: opts.url };
  const delay = opts.delay ?? {};
  const ok = <T>(value: T) => ({ status: "succeeded", value }) as unknown as Office.AsyncResult<T>;
  const fail = <T>(message: string, code = 5001) =>
    ({ status: "failed", error: { message, code, name: "Error" } }) as unknown as Office.AsyncResult<T>;

  const document = {
    get url() {
      return state.url;
    },
    getFileAsync(
      type: string,
      options: { sliceSize?: number } | ((r: Office.AsyncResult<Office.File>) => void),
      maybeCallback?: (r: Office.AsyncResult<Office.File>) => void,
    ) {
      const callback = (typeof options === "function" ? options : maybeCallback)!;
      const sliceSize = (typeof options === "object" && options?.sliceSize) || 4 * 1024 * 1024;
      void (async () => {
        await wait(type === "pdf" ? delay.pdf : delay.slice);
        if (opts.failOn === type) return callback(fail("An internal error has occurred."));
        if (state.openFiles >= MAX_OPEN_FILES) return callback(fail("Too many files are open.", 5001));
        const bytes = type === "pdf" ? opts.pdf : type === "compressed" ? opts.docx : null;
        if (!bytes) return callback(fail("Unsupported file type"));
        state.openFiles++;
        state.opened++;
        let open = true;
        const file = {
          size: bytes.byteLength,
          sliceCount: Math.max(1, Math.ceil(bytes.byteLength / sliceSize)),
          getSliceAsync(index: number, cb: (r: Office.AsyncResult<Office.Slice>) => void) {
            void (async () => {
              await wait(delay.slice);
              if (!open) return cb(fail("The file is closed."));
              if (index < 0 || index >= file.sliceCount) return cb(fail("Invalid slice index."));
              if (index === opts.failSlice) return cb(fail("An internal error has occurred."));
              state.slicesRead++;
              // Word hands binary slices over as plain arrays of byte values.
              const data = Array.from(bytes.subarray(index * sliceSize, (index + 1) * sliceSize));
              cb(ok({ data, index, size: data.length } as unknown as Office.Slice));
            })();
          },
          closeAsync(cb?: (r: Office.AsyncResult<void>) => void) {
            if (open) {
              open = false;
              state.openFiles--;
              state.closed++;
            }
            cb?.(ok(undefined));
          },
        };
        callback(ok(file as unknown as Office.File));
      })();
    },
    // Any attempt to write into the document is counted, so tests can prove there is none.
    setSelectedDataAsync: () => void state.writes++,
    customXmlParts: { addAsync: () => void state.writes++ },
    settings: { set: () => void state.writes++, saveAsync: () => void state.writes++ },
  };

  const office = {
    FileType: { Compressed: "compressed", Pdf: "pdf", Text: "text" },
    AsyncResultStatus: { Succeeded: "succeeded", Failed: "failed" },
    PlatformType: { PC: "PC", Mac: "Mac", OfficeOnline: "OfficeOnline", iOS: "iOS", Android: "Android", Universal: "Universal" },
    HostType: { Word: "Word", Excel: "Excel", PowerPoint: "PowerPoint", Outlook: "Outlook" },
    onReady: async () => ({ host: "Word", platform: opts.platform ?? "PC" }),
    context: {
      document,
      diagnostics: { platform: opts.platform ?? "PC", host: "Word", version: "16.0.mock" },
      requirements: {
        isSetSupported: (name: string) =>
          name === "NestedAppAuth" ? opts.nestedAppAuth !== false : name === "WordApi" || name === "File",
      },
    },
  };

  const word = {
    run: async <T>(fn: (ctx: unknown) => Promise<T>) => {
      const ctx = {
        document: {
          save: () => {
            state.saves++;
          },
          body: new Proxy({}, { get: () => () => void state.writes++ }),
        },
        sync: () => wait(delay.save),
      };
      return fn(ctx);
    },
  };

  const g = globalThis as Record<string, unknown>;
  g.Office = office;
  g.Word = word;
  return state;
}
