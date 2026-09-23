# pi-browser

A small Chromium extension for Pi 0.87.1. The user's standing authorization enables bounded browsing of general public HTTP(S) sites for the main agent and explicitly allowlisted subagents. It does not require `/browser on` or per-domain approval.

## Automatic public access

At each new session runtime, these tools are active when the Pi/tool allowlist permits them:

- `browser_goto`: navigate to a public HTTP(S) URL on its default port;
- `browser_read`: return bounded visible text and up to 80 temporary element references;
- `browser_click`: follow a public anchor by navigating directly, without running its click handler;
- `browser_screenshot`: capture only the fixed 1280x720 viewport as a JPEG capped at 2 MiB;
- `browser_close`: discard the current browser/context and sensitive-action grant while leaving public browsing available.

The extension registers its backing file with `pi-interactive-subagents`. Restricted children still receive only browser tool names declared by their agent profile; the extension does not widen a child's `--tools` allowlist. Public browsing is available in subagent processes rather than being disabled by `PI_SUBAGENT_*` identity markers.

`browser_fill` is inactive by default, and `browser_click` rejects buttons/controls while it has only the automatic grant. Public anchors are followed with direct navigation so their JavaScript click handlers do not run. An interactive parent user can separately permit control clicks and fill for the current runtime with `/browser sensitive on`; `browser_close`, internal context replacement after cancellation/timeout, `/browser sensitive off`, session replacement/reload/shutdown, and `/browser off` revoke that grant. Credentials remain forbidden even after this grant.

Commands:

```text
/browser                    # status
/browser off                # revoke every browser tool and close the context
/browser on                 # restore the standing public-web authorization
/browser sensitive on|off   # separate runtime-only grant for click/fill
```

`/browser off` writes a small non-secret state entry to the current Pi session, so reload or resume does not silently replace that revocation with the default. A new session with no such entry starts with public browsing available. Browser startup remains lazy: extension loading, session startup, and permission changes do not launch Chrome.

## Browser executable and ephemeral state

`pi-browser` uses `playwright-core` and never downloads or installs a browser. On first browser use it looks for an already installed Chrome or Edge in conventional Windows, macOS, and Linux locations and on `PATH`. It also discovers a locally installed Playwright Chromium under the standard `ms-playwright` cache or `PLAYWRIGHT_BROWSERS_PATH`. An explicit absolute path remains available when discovery is unsuitable:

```text
PI_BROWSER_EXECUTABLE_PATH=/absolute/path/to/chrome
```

Each launch uses Playwright's temporary browser profile plus a fresh context. It never points at a personal profile and does not inherit personal cookies or logged-in sessions. Closing/revoking discards context cookies, storage, pages, and element references.

## Permission and network policy

The automatic grant accepts only HTTP and HTTPS on ports 80 and 443. It rejects URL credentials, localhost names, explicit non-public addresses, and hostnames whose DNS answers include a private, loopback, link-local, multicast, unspecified, or otherwise non-public address.

For every distinct destination—including redirects and page subresources—the policy:

1. validates the URL and default port;
2. resolves DNS with a deadline;
3. rejects the destination if any answer is non-public;
4. pins the selected public address for the lifetime of that session's public-access runtime;
5. makes the proxy connection to that address while preserving the original HTTP Host/TLS hostname.

The local authenticated proxy repeats policy enforcement for plaintext requests and CONNECT tunnels; Playwright routing is an additional early check. A context is capped at 128 destinations, 32 concurrent proxy connections, 500 proxy admissions, and 100 MiB of aggregate HTTP body/tunnel traffic. Individual requests/tunnels and operations also have byte and time limits.

Local/private targets are intentionally not unlockable through an environment variable or a domain prompt. They are outside this standing authorization and require a separate, purpose-specific user authorization and implementation. Source tests use the exported `createTestBrowserExtension(...)` fixture entrypoint to grant exact loopback origins in code; the production default never calls that path.

## Sensitive actions and credentials

Automatic public access is not a read-only network guarantee: loading JavaScript can issue public requests, and unauthenticated pages can have server-side effects merely from being visited. The extension has no personal cookies, but webpage content remains untrusted.

Button/control clicks and fill operations are treated as sensitive because they can submit forms, trigger purchases, publish content, or otherwise change remote state. Their separate interactive grant is runtime-only and does not authorize credentials. Password controls are excluded from discovery; password and common credential-marked controls are also rejected at runtime. Never pass passwords, tokens, API keys, recovery codes, session cookies, or other secrets to browser tools: arguments, extracted text, and screenshots can persist in Pi session history and be sent to the active model.

There is intentionally no arbitrary JavaScript evaluation, selector input, custom headers, cookie/storage API, console/network dump, file upload, download API, TLS bypass, persistent profile, or shell execution. WebSockets, WebTransport, WebRTC peer connections, dedicated/shared workers, and service workers are disabled in this surface.

The proxy and browser flags are defense in depth, **not an SSRF or OS/network sandbox**. They cannot prove containment of every Chromium feature, browser vulnerability, non-proxied protocol, extension process, or platform behavior. `chromiumSandbox: true` asks Playwright not to disable Chromium's platform sandbox; it is not a guarantee that every service process is isolated. Strong isolation still requires an independently enforced network policy or a dedicated VM/container.

## Tests

Offline tests and typechecking do not launch a browser, access public networks, or invoke models:

```text
npm run typecheck
npm test
```

The real-browser fixture is opt-in and uses an already installed executable. It serves only loopback fixtures, obtains its exact local/sensitive grant through the source-only fixture entrypoint, creates an ephemeral profile, and performs no downloads or model calls:

```text
PI_RUN_BROWSER_TESTS=1 npm run test:live
# PI_BROWSER_EXECUTABLE_PATH=/absolute/path/to/chrome remains an optional override
```

The separate root loader fixture uses Pi's official RPC loader without opening Chrome. It verifies automatic safe-tool activation (including direct link following), sensitive-tool gating, package provenance, and `/browser off` revocation.
