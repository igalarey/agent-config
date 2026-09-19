import { readdir, stat } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { chromium, type Browser, type BrowserContext, type ElementHandle, type Page } from "playwright-core";
import { createBrowserProxy, type LocalBrowserProxy } from "./browser-proxy.ts";
import type { BrowserPolicy } from "./policy.ts";

const DEFAULT_ACTION_TIMEOUT_MS = 15_000;
const MAX_ACTION_TIMEOUT_MS = 30_000;
const MAX_INTERACTIVE_ELEMENTS = 80;
const MAX_SCANNED_ELEMENTS = 300;
const MAX_SCREENSHOT_BYTES = 2 * 1024 * 1024;
const MAX_TEXT_LINES = 500;
const INTERACTIVE_SELECTOR = "a[href],button,input:not([type=hidden]):not([type=password]),textarea,select,[role=button],[contenteditable=true]";

type RuntimeInstance = { browser: Browser; context: BrowserContext; page: Page; proxy: LocalBrowserProxy };
type ElementReference = { handle: ElementHandle<Element>; kind: string };

export type PageSummary = { url: string; title: string };
export type ReadResult = PageSummary & { text: string; elements: string[]; truncated: boolean };

export function actionTimeout(value?: number): number {
  return Math.min(MAX_ACTION_TIMEOUT_MS, Math.max(1_000, value ?? DEFAULT_ACTION_TIMEOUT_MS));
}

export async function validateExecutablePath(value: string | undefined): Promise<string> {
  if (!value?.trim()) throw new Error("Browser executable path is empty");
  const path = value.trim();
  if (!isAbsolute(path)) throw new Error("PI_BROWSER_EXECUTABLE_PATH must be an absolute path");
  let info;
  try {
    info = await stat(path);
  } catch {
    throw new Error(`Browser executable does not exist: ${path}`);
  }
  if (!info.isFile()) throw new Error(`Browser executable is not a file: ${path}`);
  return path;
}

function envValue(env: NodeJS.ProcessEnv, name: string): string | undefined {
  const entry = Object.entries(env).find(([key]) => key.toUpperCase() === name.toUpperCase());
  return entry?.[1];
}

export function executableCandidates(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): string[] {
  const candidates: string[] = [];
  const add = (value: string | undefined) => { if (value) candidates.push(value); };
  const pathFolders = String(envValue(env, "PATH") ?? "").split(platform === "win32" ? ";" : ":").filter(Boolean);
  if (platform === "win32") {
    for (const root of [envValue(env, "ProgramFiles"), envValue(env, "ProgramW6432"), envValue(env, "ProgramFiles(x86)")]) {
      add(root && join(root, "Google", "Chrome", "Application", "chrome.exe"));
      add(root && join(root, "Microsoft", "Edge", "Application", "msedge.exe"));
    }
    const local = envValue(env, "LOCALAPPDATA");
    add(local && join(local, "Google", "Chrome", "Application", "chrome.exe"));
    add(local && join(local, "Microsoft", "Edge", "Application", "msedge.exe"));
    for (const folder of pathFolders) {
      add(join(folder, "chrome.exe"));
      add(join(folder, "msedge.exe"));
    }
  } else if (platform === "darwin") {
    add("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome");
    add("/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge");
    const home = envValue(env, "HOME");
    add(home && join(home, "Applications", "Google Chrome.app", "Contents", "MacOS", "Google Chrome"));
    add(home && join(home, "Applications", "Microsoft Edge.app", "Contents", "MacOS", "Microsoft Edge"));
    for (const folder of pathFolders) {
      add(join(folder, "google-chrome"));
      add(join(folder, "chromium"));
      add(join(folder, "microsoft-edge"));
    }
  } else {
    for (const name of ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser", "microsoft-edge", "microsoft-edge-stable"]) {
      add(join("/usr/bin", name));
      for (const folder of pathFolders) add(join(folder, name));
    }
  }
  return [...new Set(candidates)];
}

function playwrightBrowserRoot(env: NodeJS.ProcessEnv, platform: NodeJS.Platform): string | undefined {
  const configured = envValue(env, "PLAYWRIGHT_BROWSERS_PATH");
  if (configured?.trim() && configured.trim() !== "0") return configured.trim();
  const home = envValue(env, "HOME");
  if (platform === "linux") return home && join(home, ".cache", "ms-playwright");
  if (platform === "darwin") return home && join(home, "Library", "Caches", "ms-playwright");
  if (platform === "win32") {
    const local = envValue(env, "LOCALAPPDATA") ?? (home && join(home, "AppData", "Local"));
    return local && join(local, "ms-playwright");
  }
  return undefined;
}

async function playwrightExecutableCandidates(
  env: NodeJS.ProcessEnv,
  platform: NodeJS.Platform,
): Promise<string[]> {
  const root = playwrightBrowserRoot(env, platform);
  if (!root) return [];
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return [];
  }
  const browsers = entries
    .filter(entry => entry.isDirectory() && /^chromium-\d/.test(entry.name))
    .map(entry => entry.name)
    .sort((left, right) => right.localeCompare(left, undefined, { numeric: true }));
  const executable = platform === "win32"
    ? ["chrome-win", "chrome-win64"].map(folder => [folder, "chrome.exe"])
    : platform === "darwin"
      ? [["chrome-mac", "Chromium.app", "Contents", "MacOS", "Chromium"], ["chrome-mac", "Google Chrome for Testing.app", "Contents", "MacOS", "Google Chrome for Testing"]]
      : [["chrome-linux", "chrome"], ["chrome-linux64", "chrome"]];
  return browsers.flatMap(browser => executable.map(parts => join(root, browser, ...parts)));
}

export async function resolveExecutablePath(
  explicit?: string,
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): Promise<string> {
  const configured = explicit ?? envValue(env, "PI_BROWSER_EXECUTABLE_PATH");
  if (configured?.trim()) return validateExecutablePath(configured);
  const candidates = [...executableCandidates(env, platform), ...(await playwrightExecutableCandidates(env, platform))];
  for (const candidate of candidates) {
    try {
      return await validateExecutablePath(candidate);
    } catch {}
  }
  throw new Error(
    "No installed Chrome, Edge, or Playwright-managed Chromium executable was found. " +
    "pi-browser never downloads a browser; install one separately or set " +
    "PI_BROWSER_EXECUTABLE_PATH to an absolute executable path.",
  );
}

export function boundText(value: string, maxBytes: number): { text: string; truncated: boolean } {
  const lineLimited = value.split(/\r?\n/).slice(0, MAX_TEXT_LINES);
  let output = lineLimited.join("\n");
  let truncated = value.split(/\r?\n/).length > MAX_TEXT_LINES;
  if (Buffer.byteLength(output) > maxBytes) {
    let used = 0;
    let bounded = "";
    for (const character of output) {
      const bytes = Buffer.byteLength(character);
      if (used + bytes > maxBytes) break;
      bounded += character;
      used += bytes;
    }
    output = bounded;
    truncated = true;
  }
  return { text: output, truncated };
}

export class BrowserRuntime {
  private instancePromise?: Promise<RuntimeInstance>;
  private closePromise?: Promise<void>;
  private epoch = 0;
  private revoked = false;
  private references = new Map<string, ElementReference>();
  private serial = Promise.resolve();

  private readonly executablePath: string;
  private readonly policy: BrowserPolicy;
  private readonly onContextClosed?: () => void;

  constructor(executablePath: string, policy: BrowserPolicy, onContextClosed?: () => void) {
    this.executablePath = executablePath;
    this.policy = policy;
    this.onContextClosed = onContextClosed;
  }

  async run<T>(operation: (page: Page) => Promise<T>, signal?: AbortSignal, timeoutMs?: number): Promise<T> {
    this.assertAvailable();
    let release!: () => void;
    const previous = this.serial;
    this.serial = new Promise<void>(resolve => { release = resolve; });
    try {
      await this.waitForTurn(previous, signal);
    } catch (error) {
      // Cancellation must not unlock successors before the preceding operation finishes.
      void previous.then(release);
      throw error;
    }
    try {
      this.assertAvailable();
      if (signal?.aborted) throw new Error("Browser operation cancelled");
      const timeout = actionTimeout(timeoutMs);
      let rejectInterrupted!: (error: Error) => void;
      const interrupted = new Promise<never>((_resolve, reject) => { rejectInterrupted = reject; });
      const onAbort = () => {
        rejectInterrupted(new Error("Browser operation cancelled"));
        void this.close().catch(() => undefined);
      };
      const timer = setTimeout(() => {
        rejectInterrupted(new Error(`Browser operation timed out after ${timeout}ms`));
        void this.close().catch(() => undefined);
      }, timeout);
      signal?.addEventListener("abort", onAbort, { once: true });
      try {
        const work = this.ensureInstance().then(({ page }) => operation(page));
        return await Promise.race([work, interrupted]);
      } finally {
        clearTimeout(timer);
        signal?.removeEventListener("abort", onAbort);
      }
    } finally {
      release();
    }
  }

  async goto(url: string, timeoutMs?: number, signal?: AbortSignal): Promise<PageSummary> {
    await this.policy.resolveTarget(url);
    return this.run(async page => {
      await this.clearReferences();
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: actionTimeout(timeoutMs) });
      return this.summary(page);
    }, signal, timeoutMs);
  }

  async read(maxBytes: number, timeoutMs?: number, signal?: AbortSignal): Promise<ReadResult> {
    return this.run(async page => {
      page.setDefaultTimeout(actionTimeout(timeoutMs));
      await this.assertCurrentPage(page);
      await this.clearReferences();
      const rawText = await page.locator("body").innerText().catch(() => "");
      const bounded = boundText(rawText, maxBytes);
      const elements: string[] = [];
      const locator = page.locator(INTERACTIVE_SELECTOR);
      const count = Math.min(await locator.count(), MAX_SCANNED_ELEMENTS);
      for (let index = 0; index < count && elements.length < MAX_INTERACTIVE_ELEMENTS; index++) {
        const candidate = locator.nth(index);
        if (!await candidate.isVisible().catch(() => false)) continue;
        const handle = await candidate.elementHandle();
        if (!handle) continue;
        const kind = await handle.evaluate(element => element.tagName.toLowerCase()).catch(() => "control");
        if (kind === "a" && !await this.isAllowedAnchor(handle, page.url())) {
          await handle.dispose().catch(() => undefined);
          continue;
        }
        const label = await this.elementLabel(handle);
        const ref = `e${elements.length + 1}`;
        this.references.set(ref, { handle, kind });
        elements.push(`[${ref}] ${kind}${label ? `: ${label}` : ""}`);
      }
      const summary = await this.summary(page);
      return { ...summary, text: bounded.text, elements, truncated: bounded.truncated };
    }, signal, timeoutMs);
  }

  async click(ref: string, allowSensitive: boolean, timeoutMs?: number, signal?: AbortSignal): Promise<PageSummary> {
    return this.run(async page => {
      const target = this.reference(ref);
      if (!allowSensitive) {
        if (target.kind !== "a") {
          throw new Error("This control click can change remote state and requires separate explicit user authorization");
        }
        const href = await target.handle.getAttribute("href");
        if (!href) throw new Error(`${ref} has no navigable public URL`);
        const destination = new URL(href, page.url()).href;
        await this.policy.resolveTarget(destination);
        await this.clearReferences();
        await page.goto(destination, { waitUntil: "domcontentloaded", timeout: actionTimeout(timeoutMs) });
        return this.summary(page);
      }
      await target.handle.click({ timeout: actionTimeout(timeoutMs) });
      await this.clearReferences();
      return this.summary(page);
    }, signal, timeoutMs);
  }

  async fill(ref: string, value: string, timeoutMs?: number, signal?: AbortSignal): Promise<PageSummary & { ref: string }> {
    return this.run(async page => {
      const target = this.reference(ref);
      const credentialAttributes = await Promise.all(
        ["type", "autocomplete", "name", "id", "placeholder", "aria-label"]
          .map(attribute => target.handle.getAttribute(attribute)),
      );
      const credentialMarker = credentialAttributes.filter(Boolean).join(" ");
      if (/password|passwd|one[-_ ]?time|otp|recovery|credential|secret|token|api[-_ ]?key|session|cookie|cvv|cvc/i.test(credentialMarker)) {
        throw new Error("Credential-like controls cannot be filled by pi-browser");
      }
      if (!new Set(["input", "textarea"]).has(target.kind)) {
        const editable = await target.handle.getAttribute("contenteditable");
        if (editable !== "true" && editable !== "") throw new Error(`${ref} is not a fillable control`);
      }
      await target.handle.fill(value, { timeout: actionTimeout(timeoutMs) });
      return { ...(await this.summary(page)), ref };
    }, signal, timeoutMs);
  }

  async screenshot(timeoutMs?: number, signal?: AbortSignal): Promise<{ summary: PageSummary; data: Buffer }> {
    return this.run(async page => {
      await this.assertCurrentPage(page);
      const data = await page.screenshot({
        type: "jpeg",
        quality: 60,
        fullPage: false,
        animations: "disabled",
        scale: "css",
        timeout: actionTimeout(timeoutMs),
      });
      if (data.length > MAX_SCREENSHOT_BYTES) {
        throw new Error(`Screenshot exceeds the ${MAX_SCREENSHOT_BYTES}-byte limit`);
      }
      return { summary: await this.summary(page), data };
    }, signal, timeoutMs);
  }

  async revoke(): Promise<void> {
    this.revoked = true;
    await this.close();
  }

  async close(): Promise<void> {
    this.onContextClosed?.();
    this.epoch++;
    const pending = this.instancePromise;
    this.instancePromise = undefined;
    this.references.clear();
    if (!pending) {
      await this.closePromise;
      return;
    }
    const previousClose = this.closePromise;
    const closing = (async () => {
      await previousClose;
      let instance: RuntimeInstance;
      try {
        instance = await pending;
      } catch {
        return;
      }
      const closed = await Promise.allSettled([instance.context.close(), instance.browser.close(), instance.proxy.close()]);
      const failure = closed.find(result => result.status === "rejected");
      if (failure?.status === "rejected") throw failure.reason;
    })();
    this.closePromise = closing;
    try {
      await closing;
    } finally {
      if (this.closePromise === closing) this.closePromise = undefined;
    }
  }

  private assertAvailable(): void {
    if (this.revoked) throw new Error("Browser grant was revoked");
  }

  private async waitForTurn(previous: Promise<void>, signal?: AbortSignal): Promise<void> {
    if (!signal) return previous;
    if (signal.aborted) throw new Error("Browser operation cancelled");
    let onAbort!: () => void;
    const aborted = new Promise<never>((_resolve, reject) => {
      onAbort = () => reject(new Error("Browser operation cancelled"));
      signal.addEventListener("abort", onAbort, { once: true });
    });
    try {
      await Promise.race([previous, aborted]);
    } finally {
      signal.removeEventListener("abort", onAbort);
    }
  }

  private async ensureInstance(): Promise<RuntimeInstance> {
    this.assertAvailable();
    if (this.instancePromise) return this.instancePromise;
    await this.closePromise;
    this.assertAvailable();
    if (this.instancePromise) return this.instancePromise;
    const expectedEpoch = this.epoch;
    const creating = this.createInstance(expectedEpoch);
    this.instancePromise = creating;
    try {
      return await creating;
    } catch (error) {
      if (this.instancePromise === creating) this.instancePromise = undefined;
      throw error;
    }
  }

  private async createInstance(expectedEpoch: number): Promise<RuntimeInstance> {
    let proxy: LocalBrowserProxy | undefined;
    let browser: Browser | undefined;
    let context: BrowserContext | undefined;
    try {
      proxy = await createBrowserProxy(this.policy);
      if (expectedEpoch !== this.epoch || this.revoked) throw new Error("Browser startup cancelled");
      browser = await chromium.launch({
        executablePath: this.executablePath,
        headless: true,
        chromiumSandbox: true,
        ignoreDefaultArgs: ["--enable-unsafe-swiftshader"],
        args: ["--enable-automation", "--disable-external-intent-requests", "--disable-http2", "--disable-quic", "--disable-webgl", ...this.policy.chromiumArgs],
        proxy: { server: proxy.server, bypass: "<-loopback>", username: proxy.username, password: proxy.password },
        timeout: DEFAULT_ACTION_TIMEOUT_MS,
      });
      if (expectedEpoch !== this.epoch) throw new Error("Browser startup cancelled");
      await this.verifyLaunchArguments(browser, proxy.server);
      context = await browser.newContext({
        acceptDownloads: false,
        serviceWorkers: "block",
        viewport: { width: 1280, height: 720 },
        ignoreHTTPSErrors: false,
      });
      if (expectedEpoch !== this.epoch || this.revoked) throw new Error("Browser startup cancelled");
      await context.route("**/*", async route => {
        try {
          await this.policy.resolveTarget(route.request().url());
          await route.continue();
        } catch {
          await route.abort("blockedbyclient").catch(() => undefined);
        }
      });
      await context.addInitScript(({ mode, origins }) => {
        const allowed = new Set(origins);
        const permits = (value: string, base: string) => {
          try {
            const url = new URL(value, base);
            if (url.username || url.password || (url.protocol !== "http:" && url.protocol !== "https:")) return false;
            if (mode === "test-local") return allowed.has(url.origin);
            const expectedPort = url.protocol === "https:" ? "443" : "80";
            return !url.port || url.port === expectedPort;
          } catch {
            return false;
          }
        };
        globalThis.addEventListener("click", event => {
          const anchor = event.composedPath().find(item => item instanceof HTMLAnchorElement);
          if (anchor instanceof HTMLAnchorElement && !permits(anchor.href, document.baseURI)) {
            event.preventDefault();
            event.stopImmediatePropagation();
          }
        }, true);
        globalThis.addEventListener("submit", event => {
          const form = event.target;
          if (form instanceof HTMLFormElement && !permits(form.action, document.baseURI)) {
            event.preventDefault();
            event.stopImmediatePropagation();
          }
        }, true);
        const removeRefresh = () => {
          for (const meta of document.querySelectorAll('meta[http-equiv="refresh" i]')) meta.remove();
        };
        new MutationObserver(removeRefresh).observe(document, { childList: true, subtree: true });
        removeRefresh();
        const DeniedNetworkPrimitive = class {
          constructor() { throw new Error("Direct network primitives and workers are disabled by pi-browser"); }
        };
        for (const name of ["WebSocket", "Worker", "SharedWorker", "WebTransport", "RTCPeerConnection", "webkitRTCPeerConnection"]) {
          Object.defineProperty(globalThis, name, { value: DeniedNetworkPrimitive, configurable: false, writable: false });
        }
      }, { mode: this.policy.mode, origins: this.policy.browserOrigins });
      await context.routeWebSocket(/.*/, socket => socket.close({ code: 1008, reason: "WebSockets disabled" }));
      const page = await context.newPage();
      const cdp = await context.newCDPSession(page);
      await cdp.send("Page.enable");
      await cdp.send("Network.enable");
      await cdp.send("Network.setBlockedURLs", {
        urls: ["about:*", "blob:*", "chrome:*", "file:*", "data:*", "javascript:*", "mailto:*", "ftp:*", "intent:*", "tel:*", "sms:*", "view-source:*", "webcal:*"],
      });
      const stopUnsafeNavigation = (event: { url: string }) => {
        if (!this.policy.allowsUrlShape(event.url)) void cdp.send("Page.stopLoading").catch(() => undefined);
      };
      cdp.on("Page.frameRequestedNavigation", stopUnsafeNavigation);
      cdp.on("Page.frameScheduledNavigation", stopUnsafeNavigation);
      page.setDefaultTimeout(DEFAULT_ACTION_TIMEOUT_MS);
      page.setDefaultNavigationTimeout(DEFAULT_ACTION_TIMEOUT_MS);
      page.on("dialog", dialog => { void dialog.dismiss().catch(() => undefined); });
      page.on("framenavigated", frame => {
        if (frame === page.mainFrame() && !this.policy.allowsUrlShape(frame.url())) {
          void this.close().catch(() => undefined);
        }
      });
      page.on("download", download => { void download.cancel().catch(() => undefined); });
      page.on("popup", popup => { void popup.close().catch(() => undefined); });
      if (expectedEpoch !== this.epoch) throw new Error("Browser startup cancelled");
      return { browser, context, page, proxy };
    } catch (error) {
      await context?.close().catch(() => undefined);
      await browser?.close().catch(() => undefined);
      await proxy?.close().catch(() => undefined);
      throw error;
    }
  }

  private async verifyLaunchArguments(browser: Browser, proxyServer: string): Promise<void> {
    const session = await browser.newBrowserCDPSession();
    try {
      const result = await session.send("Browser.getBrowserCommandLine") as { arguments?: string[] };
      const args = result.arguments ?? [];
      for (const expected of ["--disable-http2", "--disable-quic", "--dns-prefetch-disable"]) {
        if (!args.includes(expected)) throw new Error(`Chromium did not report required launch flag: ${expected}`);
      }
      if (args.some(value => value === "--no-sandbox" || value === "--ignore-certificate-errors" || value === "--disable-web-security")) {
        throw new Error("Chromium reported a forbidden security-disabling launch flag");
      }
      const proxyUrl = new URL(proxyServer);
      const acceptedProxyValues = new Set([proxyServer, proxyUrl.host]);
      const proxyArguments = args.filter(value => value.startsWith("--proxy-server="));
      if (proxyArguments.length !== 1 || !acceptedProxyValues.has(proxyArguments[0]!.slice("--proxy-server=".length))) {
        throw new Error("Chromium did not report the exact authenticated local proxy server");
      }
      const bypassArguments = args.filter(value => value.startsWith("--proxy-bypass-list="));
      if (bypassArguments.length !== 1 || bypassArguments[0] !== "--proxy-bypass-list=<-loopback>") {
        throw new Error("Chromium did not report the exact loopback proxy rule");
      }
      if (args.some(value => value === "--no-proxy-server" || value === "--proxy-auto-detect" || value.startsWith("--proxy-pac-url="))) {
        throw new Error("Chromium reported a proxy-bypass configuration");
      }
    } finally {
      await session.detach();
    }
  }

  private async summary(page: Page): Promise<PageSummary> {
    await this.assertCurrentPage(page);
    return { url: page.url(), title: (await page.title()).slice(0, 500) };
  }

  private async assertCurrentPage(page: Page): Promise<void> {
    await this.policy.resolveTarget(page.url());
  }

  private reference(ref: string): ElementReference {
    const target = this.references.get(ref);
    if (!target) throw new Error(`Unknown or stale element reference: ${ref}. Call browser_read again.`);
    return target;
  }

  private async clearReferences(): Promise<void> {
    const handles = [...this.references.values()].map(item => item.handle);
    this.references.clear();
    if (handles.length === 0) return;
    let timer: NodeJS.Timeout | undefined;
    await Promise.race([
      Promise.all(handles.map(handle => handle.dispose().catch(() => undefined))),
      new Promise<void>(resolve => { timer = setTimeout(resolve, 1_000); }),
    ]);
    if (timer) clearTimeout(timer);
  }

  private async isAllowedAnchor(handle: ElementHandle<Element>, base: string): Promise<boolean> {
    const href = await handle.getAttribute("href");
    if (!href) return false;
    try {
      return this.policy.allowsUrlShape(new URL(href, base).href);
    } catch {
      return false;
    }
  }

  private async elementLabel(handle: ElementHandle<Element>): Promise<string> {
    const values = await Promise.all([
      handle.getAttribute("aria-label"),
      handle.getAttribute("placeholder"),
      handle.getAttribute("name"),
      handle.textContent(),
      handle.getAttribute("type"),
    ]);
    const label = values.find(value => value?.trim())?.trim().replace(/\s+/g, " ") ?? "";
    return label.slice(0, 200);
  }
}
