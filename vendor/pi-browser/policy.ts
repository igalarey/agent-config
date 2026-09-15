import { lookup as dnsLookup } from "node:dns/promises";
import { isIP } from "node:net";
import ipaddr from "ipaddr.js";

const MAX_TEST_ORIGINS = 8;
const MAX_PUBLIC_DESTINATIONS = 128;
const DNS_TIMEOUT_MS = 5_000;
const MAX_URL_BYTES = 8_192;

type Address = { address: string; family: number };
export type Resolver = (hostname: string) => Promise<Address[]>;
export type NetworkTarget = {
  hostname: string;
  port: number;
  pinnedAddress: string;
  family: number;
};
export type BrowserPolicy = {
  mode: "public" | "test-local";
  browserOrigins: readonly string[];
  resolveTarget(value: string): Promise<NetworkTarget>;
  resolveConnect(authority: string): Promise<NetworkTarget>;
  allowsUrlShape(value: string): boolean;
  chromiumArgs: readonly string[];
};

function hostnameOf(url: URL): string {
  const hostname = url.hostname.startsWith("[") && url.hostname.endsWith("]")
    ? url.hostname.slice(1, -1)
    : url.hostname;
  return hostname.toLowerCase();
}

function parseAddress(value: string): ipaddr.IPv4 | ipaddr.IPv6 | undefined {
  try {
    let parsed = ipaddr.parse(value);
    if (parsed instanceof ipaddr.IPv6 && parsed.isIPv4MappedAddress()) parsed = parsed.toIPv4Address();
    return parsed;
  } catch {
    return undefined;
  }
}

export function isPublicAddress(value: string): boolean {
  const address = parseAddress(value);
  if (!address || address.range() !== "unicast") return false;
  if (address instanceof ipaddr.IPv6) {
    const bytes = address.toByteArray();
    const deprecatedSiteLocal = bytes[0] === 0xfe && (bytes[1]! & 0xc0) === 0xc0; // fec0::/10
    const ipv4Compatible = bytes.slice(0, 12).every(byte => byte === 0); // deprecated ::/96
    if (deprecatedSiteLocal || ipv4Compatible) return false;
  }
  return true;
}

export function isExplicitLocalAddress(value: string): boolean {
  const range = parseAddress(value)?.range();
  return range === "loopback" || range === "private" || range === "uniqueLocal";
}

function parseUrl(value: string): URL {
  if (Buffer.byteLength(value) > MAX_URL_BYTES) throw new Error("Blocked browser URL exceeding the 8192-byte limit");
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`Blocked malformed browser URL: ${value}`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`Blocked browser request scheme: ${url.protocol}`);
  }
  if (url.username || url.password) throw new Error("Blocked browser URL containing credentials");
  if (!url.hostname || hostnameOf(url).endsWith(".")) throw new Error(`Blocked invalid browser hostname: ${value}`);
  return url;
}

function expectedPort(url: URL): number {
  return url.protocol === "https:" ? 443 : 80;
}

function portOf(url: URL): number {
  return Number(url.port || expectedPort(url));
}

function requirePublicUrl(value: string): URL {
  const url = parseUrl(value);
  if (url.port && Number(url.port) !== expectedPort(url)) {
    throw new Error("Automatic browser access allows only the default HTTP and HTTPS ports");
  }
  const hostname = hostnameOf(url);
  if (hostname === "localhost" || hostname.endsWith(".localhost")
      || (isIP(hostname) !== 0 && !isPublicAddress(hostname))) {
    throw new Error("Automatic browser access does not include localhost or private networks; separate explicit authorization is required");
  }
  return url;
}

function connectUrl(authority: string): URL {
  if (Buffer.byteLength(authority) > 1_000) throw new Error("Blocked oversized CONNECT authority");
  let url: URL;
  try {
    url = new URL(`https://${authority}`);
  } catch {
    throw new Error("Blocked malformed CONNECT authority");
  }
  if (url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("Blocked malformed CONNECT authority");
  }
  return url;
}

async function defaultResolver(hostname: string): Promise<Address[]> {
  return dnsLookup(hostname, { all: true, verbatim: true });
}

async function resolveWithTimeout(hostname: string, resolver: Resolver): Promise<Address[]> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      resolver(hostname),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(`DNS resolution timed out for ${hostname}`)), DNS_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function resolvePublicTarget(url: URL, resolver: Resolver): Promise<NetworkTarget> {
  const hostname = hostnameOf(url);
  if (isIP(hostname)) {
    const parsed = parseAddress(hostname)!;
    const address = parsed.toString();
    if (!isPublicAddress(address)) throw new Error(`Refusing non-public browser address: ${hostname}`);
    return { hostname, port: portOf(url), pinnedAddress: address, family: parsed instanceof ipaddr.IPv6 ? 6 : 4 };
  }
  const addresses = await resolveWithTimeout(hostname, resolver);
  if (addresses.length === 0) throw new Error(`DNS returned no addresses for ${hostname}`);
  const unsafe = addresses.find(({ address }) => !isPublicAddress(address));
  if (unsafe) throw new Error(`Refusing hostname ${hostname}: DNS returned non-public address ${unsafe.address}`);
  const selected = addresses[0]!;
  return { hostname, port: portOf(url), pinnedAddress: selected.address, family: selected.family };
}

export function buildPublicPolicy(resolver: Resolver = defaultResolver): BrowserPolicy {
  const targets = new Map<string, Promise<NetworkTarget>>();
  const resolve = (url: URL): Promise<NetworkTarget> => {
    const key = url.origin;
    const existing = targets.get(key);
    if (existing) return existing;
    if (targets.size >= MAX_PUBLIC_DESTINATIONS) {
      return Promise.reject(new Error(`Browser context exceeded the ${MAX_PUBLIC_DESTINATIONS}-destination limit`));
    }
    const pending = resolvePublicTarget(url, resolver);
    targets.set(key, pending);
    void pending.catch(() => {
      if (targets.get(key) === pending) targets.delete(key);
    });
    return pending;
  };
  return {
    mode: "public",
    browserOrigins: [],
    chromiumArgs: ["--dns-prefetch-disable", "--force-webrtc-ip-handling-policy=disable_non_proxied_udp"],
    resolveTarget(value: string) {
      return resolve(requirePublicUrl(value));
    },
    resolveConnect(authority: string) {
      return resolve(requirePublicUrl(connectUrl(authority).href));
    },
    allowsUrlShape(value: string) {
      try {
        requirePublicUrl(value);
        return true;
      } catch {
        return false;
      }
    },
  };
}

export function canonicalOrigin(value: string): URL {
  const url = parseUrl(value);
  if (url.pathname !== "/" || url.search || url.hash) {
    throw new Error(`Test allowlist entries must be origins without paths, queries, or fragments: ${value}`);
  }
  return new URL(url.origin);
}

export function normalizeAllowedOrigins(values: readonly string[]): string[] {
  if (values.length === 0) throw new Error("At least one test origin is required");
  if (values.length > MAX_TEST_ORIGINS) throw new Error(`At most ${MAX_TEST_ORIGINS} test origins may be allowed`);
  return [...new Set(values.map(value => canonicalOrigin(value).origin))];
}

async function resolveTestTarget(url: URL, resolver: Resolver): Promise<NetworkTarget> {
  const hostname = hostnameOf(url);
  if (hostname === "localhost") {
    return { hostname, port: portOf(url), pinnedAddress: "127.0.0.1", family: 4 };
  }
  if (isIP(hostname)) {
    const parsed = parseAddress(hostname)!;
    const range = parsed.range();
    if (!isPublicAddress(hostname) && !isExplicitLocalAddress(hostname)) {
      throw new Error(`Refusing reserved, link-local, multicast, or unspecified test address: ${hostname}`);
    }
    return { hostname, port: portOf(url), pinnedAddress: parsed.toString(), family: parsed instanceof ipaddr.IPv6 ? 6 : 4 };
  }
  const addresses = await resolveWithTimeout(hostname, resolver);
  if (addresses.length === 0) throw new Error(`DNS returned no addresses for ${hostname}`);
  const unsafe = addresses.find(({ address }) => !isPublicAddress(address));
  if (unsafe) throw new Error(`Refusing test hostname ${hostname}: DNS returned non-public address ${unsafe.address}`);
  const selected = addresses[0]!;
  return { hostname, port: portOf(url), pinnedAddress: selected.address, family: selected.family };
}

/** Explicit local-origin grant used only by source fixtures; the production extension never calls it. */
export async function buildTestPolicy(values: readonly string[], resolver: Resolver = defaultResolver): Promise<BrowserPolicy> {
  const normalized = normalizeAllowedOrigins(values);
  const targets = new Map<string, NetworkTarget>();
  for (const origin of normalized) {
    const url = new URL(origin);
    targets.set(origin, await resolveTestTarget(url, resolver));
  }
  return {
    mode: "test-local",
    browserOrigins: normalized,
    chromiumArgs: ["--dns-prefetch-disable", "--force-webrtc-ip-handling-policy=disable_non_proxied_udp"],
    async resolveTarget(value: string) {
      const url = parseUrl(value);
      const target = targets.get(url.origin);
      if (!target) throw new Error(`Blocked browser request to unapproved test origin: ${url.origin}`);
      return target;
    },
    async resolveConnect(authority: string) {
      const url = connectUrl(authority);
      const target = targets.get(url.origin);
      if (!target) throw new Error(`Blocked browser CONNECT to unapproved test authority: ${authority}`);
      return target;
    },
    allowsUrlShape(value: string) {
      try {
        return targets.has(parseUrl(value).origin);
      } catch {
        return false;
      }
    },
  };
}
