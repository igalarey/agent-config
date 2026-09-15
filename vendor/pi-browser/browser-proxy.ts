import { randomBytes, timingSafeEqual } from "node:crypto";
import { createServer, request as httpRequest, type IncomingHttpHeaders, type IncomingMessage, type ServerResponse } from "node:http";
import { connect as netConnect } from "node:net";
import type { Duplex } from "node:stream";
import type { BrowserPolicy, NetworkTarget } from "./policy.ts";

const MAX_PROXY_REQUESTS = 500;
const MAX_PROXY_CONNECTIONS = 32;
const MAX_PROXY_BYTES = 100 * 1024 * 1024;
const MAX_REQUEST_BYTES = 10 * 1024 * 1024;
const MAX_RESPONSE_BYTES = 25 * 1024 * 1024;
const MAX_TUNNEL_BYTES = 50 * 1024 * 1024;
const CONNECT_TIMEOUT_MS = 10_000;
const SOCKET_IDLE_TIMEOUT_MS = 30_000;
const ABSOLUTE_LIFETIME_MS = 60_000;

export type LocalBrowserProxy = {
  server: string;
  username: string;
  password: string;
  close(): Promise<void>;
};

function safeEqual(actual: string | undefined, expected: string): boolean {
  if (!actual) return false;
  const left = Buffer.from(actual);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

function sanitizedHeaders(headers: IncomingHttpHeaders, host: string): Record<string, string | string[] | undefined> {
  const result: Record<string, string | string[] | undefined> = { ...headers, host, connection: "close" };
  delete result["proxy-authorization"];
  delete result["proxy-connection"];
  return result;
}

function validFraming(request: IncomingMessage): boolean {
  const lengths = request.headersDistinct["content-length"] ?? [];
  return lengths.length <= 1 && !(lengths.length > 0 && request.headers["transfer-encoding"] !== undefined);
}

function deny(response: ServerResponse, status = 403): void {
  response.writeHead(status, { "content-type": "text/plain", connection: "close" });
  response.end("Browser proxy request blocked");
}

function denySocket(socket: Duplex, status = 403): void {
  socket.end(`HTTP/1.1 ${status} Blocked\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
}

function requestPath(url: URL): string {
  return `${url.pathname}${url.search}`;
}

export async function createBrowserProxy(policy: BrowserPolicy): Promise<LocalBrowserProxy> {
  const username = "pi-browser";
  const password = randomBytes(24).toString("base64url");
  const expectedAuth = `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
  const sockets = new Set<Duplex>();
  let requestCount = 0;
  let transferred = 0;
  let exhausted = false;
  let closed = false;
  let clientConnections = 0;
  let closing: Promise<void> | undefined;

  const consume = (bytes: number): boolean => {
    transferred += bytes;
    if (transferred <= MAX_PROXY_BYTES) return true;
    exhausted = true;
    for (const socket of sockets) socket.destroy();
    return false;
  };

  const authorize = (headers: IncomingHttpHeaders): boolean => {
    const value = headers["proxy-authorization"];
    return safeEqual(typeof value === "string" ? value : undefined, expectedAuth);
  };

  const admit = (): boolean => !exhausted && ++requestCount <= MAX_PROXY_REQUESTS;

  const server = createServer((request, response) => {
    void handleRequest(request, response).catch(() => {
      if (response.headersSent) response.destroy();
      else deny(response, 502);
    });
  });

  async function handleRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
    if (closed) {
      deny(response);
      return;
    }
    if (!authorize(request.headers)) {
      response.writeHead(407, { "proxy-authenticate": 'Basic realm="pi-browser"', connection: "close" });
      response.end();
      return;
    }
    if (!admit()) {
      deny(response, 429);
      return;
    }
    if (!validFraming(request)) {
      deny(response, 400);
      return;
    }

    let url: URL;
    let target: NetworkTarget;
    try {
      url = new URL(request.url ?? "");
      if (url.protocol !== "http:") throw new Error("Plain proxy requests must use http");
      target = await policy.resolveTarget(url.href);
    } catch {
      deny(response);
      return;
    }
    if (closed) {
      deny(response);
      return;
    }

    let requestBytes = 0;
    const outgoing = httpRequest({
      host: target.pinnedAddress,
      family: target.family,
      port: target.port,
      method: request.method,
      path: requestPath(url),
      headers: sanitizedHeaders(request.headers, url.host),
      agent: false,
    }, upstream => {
      let responseBytes = 0;
      response.writeHead(upstream.statusCode ?? 502, upstream.statusMessage, upstream.headers);
      upstream.setTimeout(SOCKET_IDLE_TIMEOUT_MS, () => upstream.destroy());
      upstream.on("data", chunk => {
        const bytes = Buffer.byteLength(chunk);
        responseBytes += bytes;
        if (responseBytes > MAX_RESPONSE_BYTES || !consume(bytes)) {
          upstream.destroy();
          response.destroy();
        }
      });
      upstream.pipe(response);
    });
    const lifetime = setTimeout(() => {
      request.destroy();
      outgoing.destroy();
      response.destroy();
    }, ABSOLUTE_LIFETIME_MS);
    request.on("data", chunk => {
      requestBytes += Buffer.byteLength(chunk);
      if (requestBytes > MAX_REQUEST_BYTES || !consume(Buffer.byteLength(chunk))) {
        request.destroy();
        outgoing.destroy();
      }
    });
    outgoing.setTimeout(SOCKET_IDLE_TIMEOUT_MS, () => outgoing.destroy());
    outgoing.on("error", () => {
      if (response.headersSent) response.destroy();
      else deny(response, 502);
    });
    response.on("close", () => {
      clearTimeout(lifetime);
      outgoing.destroy();
    });
    request.pipe(outgoing);
  }

  server.on("connect", (request, client, head) => {
    void handleConnect(request, client, head).catch(() => client.destroy());
  });

  async function handleConnect(request: IncomingMessage, client: Duplex, head: Buffer): Promise<void> {
    if (closed) {
      client.destroy();
      return;
    }
    if (!authorize(request.headers)) {
      client.end('HTTP/1.1 407 Proxy Authentication Required\r\nProxy-Authenticate: Basic realm="pi-browser"\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
      return;
    }
    if (!admit()) {
      denySocket(client, 429);
      return;
    }
    client.pause();
    let target: NetworkTarget;
    try {
      target = await policy.resolveConnect(request.url ?? "");
    } catch {
      denySocket(client);
      return;
    }
    if (closed) {
      client.destroy();
      return;
    }
    connectTunnel(client, head, target);
    client.resume();
  }

  server.on("upgrade", (_request, client) => denySocket(client));

  function openPinnedSocket(client: Duplex, head: Buffer, target: NetworkTarget) {
    const upstream = netConnect({ host: target.pinnedAddress, family: target.family, port: target.port });
    sockets.add(upstream);
    let tunnelBytes = head.length;
    const lifetime = setTimeout(() => {
      upstream.destroy();
      client.destroy();
    }, ABSOLUTE_LIFETIME_MS);
    client.on("data", chunk => {
      tunnelBytes += chunk.length;
      if (tunnelBytes > MAX_TUNNEL_BYTES || !consume(chunk.length)) {
        upstream.destroy();
        client.destroy();
      }
    });
    upstream.setTimeout(CONNECT_TIMEOUT_MS, () => upstream.destroy());
    upstream.once("connect", () => upstream.setTimeout(SOCKET_IDLE_TIMEOUT_MS, () => upstream.destroy()));
    upstream.on("data", chunk => {
      tunnelBytes += chunk.length;
      if (tunnelBytes > MAX_TUNNEL_BYTES || !consume(chunk.length)) {
        upstream.destroy();
        client.destroy();
      }
    });
    upstream.on("error", () => client.destroy());
    upstream.on("close", () => {
      clearTimeout(lifetime);
      sockets.delete(upstream);
    });
    client.on("error", () => upstream.destroy());
    client.on("close", () => upstream.destroy());
    return upstream;
  }

  function connectTunnel(client: Duplex, head: Buffer, target: NetworkTarget): void {
    if (head.length > MAX_TUNNEL_BYTES || !consume(head.length)) {
      client.destroy();
      return;
    }
    const upstream = openPinnedSocket(client, head, target);
    upstream.once("connect", () => {
      client.write("HTTP/1.1 200 Connection Established\r\n\r\n");
      if (head.length) upstream.write(head);
      client.pipe(upstream);
      upstream.pipe(client);
    });
  }

  server.on("connection", socket => {
    clientConnections++;
    if (clientConnections > MAX_PROXY_CONNECTIONS) {
      clientConnections--;
      socket.destroy();
      return;
    }
    sockets.add(socket);
    socket.setTimeout(SOCKET_IDLE_TIMEOUT_MS, () => socket.destroy());
    socket.on("close", () => {
      clientConnections--;
      sockets.delete(socket);
    });
  });
  server.on("clientError", (_error, socket) => socket.destroy());
  server.maxHeadersCount = 100;
  server.headersTimeout = 5_000;
  server.requestTimeout = 30_000;
  server.keepAliveTimeout = 1;
  server.maxRequestsPerSocket = 1;

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen({ host: "127.0.0.1", port: 0, exclusive: true }, resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Browser proxy did not bind a TCP port");

  return {
    server: `http://127.0.0.1:${address.port}`,
    username,
    password,
    async close() {
      if (closing) return closing;
      closed = true;
      closing = new Promise<void>(resolve => {
        for (const socket of sockets) socket.destroy();
        server.close(() => resolve());
      });
      return closing;
    },
  };
}
