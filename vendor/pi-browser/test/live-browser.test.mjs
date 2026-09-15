import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import { AUTOMATIC_BROWSER_TOOL_NAMES, BROWSER_TOOL_NAMES, createTestBrowserExtension } from '../index.ts';
import { resolveExecutablePath } from '../browser-runtime.ts';

const enabled = process.env.PI_RUN_BROWSER_TESTS === '1';
const executable = enabled ? await resolveExecutablePath().catch(() => undefined) : undefined;
const inheritedIdentity = Object.entries(process.env).filter(([key]) =>
  /^(?:PI_SUBAGENT_(?:AGENT|DEPTH|ID|IDENTITY|NAME|SESSION))$/i.test(key));
for (const [key] of inheritedIdentity) delete process.env[key];
test.after(() => {
  for (const [key, value] of inheritedIdentity) process.env[key] = value;
});

function fixtureApi() {
  const tools = new Map();
  const commands = new Map();
  const events = new Map();
  let active = ['read', ...BROWSER_TOOL_NAMES];
  return {
    api: {
      registerTool(definition) { tools.set(definition.name, definition); },
      registerCommand(name, definition) { commands.set(name, definition); },
      on(name, handler) { events.set(name, handler); },
      appendEntry() {},
      getActiveTools() { return [...active]; },
      setActiveTools(names) { active = [...names]; },
    },
    tools,
    commands,
    events,
    active: () => [...active],
  };
}

function context() {
  return {
    hasUI: true,
    ui: {
      theme: { fg: (_color, text) => text },
      confirm: async () => true,
      notify() {},
      setStatus() {},
    },
  };
}

async function invoke(tool, params = {}, signal) {
  return tool.execute('live-fixture', params, signal, undefined, context());
}

test('opt-in real Chromium exercises automatic link following, sensitive-action gating, navigation, read, screenshot, and close', {
  skip: !enabled || !executable || !fs.existsSync(executable)
    ? 'set PI_RUN_BROWSER_TESTS=1 with installed Chrome/Edge or PI_BROWSER_EXECUTABLE_PATH'
    : false,
  timeout: 60_000,
}, async t => {
  const blockedRequests = [];
  let blockedUpgrades = 0;
  const blockedServer = http.createServer((request, response) => {
    blockedRequests.push(request.url);
    response.writeHead(200).end('must not be reached');
  });
  blockedServer.on('upgrade', (_request, socket) => {
    blockedUpgrades++;
    socket.destroy();
  });
  await new Promise((resolve, reject) => {
    blockedServer.once('error', reject);
    blockedServer.listen(0, '127.0.0.1', resolve);
  });
  t.after(() => {
    blockedServer.closeAllConnections();
    return new Promise(resolve => blockedServer.close(resolve));
  });
  const blockedAddress = blockedServer.address();
  assert.equal(typeof blockedAddress, 'object');
  const blockedOrigin = `http://localhost:${blockedAddress.port}`;

  const blockedIpv6Requests = [];
  const blockedIpv6Server = http.createServer((request, response) => {
    blockedIpv6Requests.push(request.url);
    response.writeHead(200).end('must not be reached');
  });
  await new Promise((resolve, reject) => {
    blockedIpv6Server.once('error', reject);
    blockedIpv6Server.listen(0, '::1', resolve);
  });
  t.after(() => {
    blockedIpv6Server.closeAllConnections();
    return new Promise(resolve => blockedIpv6Server.close(resolve));
  });
  const blockedIpv6Address = blockedIpv6Server.address();
  assert.equal(typeof blockedIpv6Address, 'object');
  const blockedIpv6Origin = `http://[::1]:${blockedIpv6Address.port}`;

  let slowStarted;
  const server = http.createServer((request, response) => {
    if (request.url === '/slow') {
      slowStarted?.();
      slowStarted = undefined;
      request.once('close', () => response.destroy());
      return;
    }
    if (request.url === '/favicon.ico') {
      response.writeHead(204).end();
      return;
    }
    if (request.url === '/redirect') {
      response.writeHead(302, { location: `${blockedOrigin}/redirect-target` }).end();
      return;
    }
    if (request.url === '/redirect-ip') {
      response.writeHead(302, { location: `http://127.0.0.1:${blockedAddress.port}/redirect-ip-target` }).end();
      return;
    }
    if (request.url === '/redirect-ipv6') {
      response.writeHead(302, { location: `${blockedIpv6Origin}/redirect-ipv6-target` }).end();
      return;
    }
    if (request.url === '/same-origin-redirect') {
      response.writeHead(302, { location: '/redirect-target' }).end();
      return;
    }
    if (request.url === '/redirect-chain') {
      response.writeHead(302, { location: '/redirect-hop' }).end();
      return;
    }
    if (request.url === '/redirect-hop') {
      response.writeHead(302, { location: `${blockedOrigin}/redirect-chain-target` }).end();
      return;
    }
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(`<!doctype html>
      <html><head><title>Local browser fixture</title></head>
      <body>
        <label>Message <input name="message" placeholder="Message"></label>
        <input type="password" placeholder="Secret password must not be exposed">
        <button type="button" onclick="document.querySelector('main').textContent = document.querySelector('input').value">Show message</button>
        <a href="/linked">safe linked page</a>
        <a href="data:text/html,blocked">unsafe data link</a>
        <a href="file:///C:/Windows/win.ini">unsafe file link</a>
        <form action="mailto:nobody@example.invalid"><button type="submit">unsafe external submit</button></form>
        <main>initial fixture text</main>
        <div id="socket-status">pending socket</div>
        <div id="worker-status">pending worker</div>
        <img src="${blockedOrigin}/subresource">
        <script>
          try { new WebSocket(${JSON.stringify(blockedOrigin.replace('http:', 'ws:') + '/socket')}); }
          catch { document.querySelector('#socket-status').textContent = 'websocket-blocked'; }
          try { new Worker(URL.createObjectURL(new Blob(['postMessage(1)'], { type: 'text/javascript' }))); }
          catch { document.querySelector('#worker-status').textContent = 'worker-blocked'; }
        </script>
      </body></html>`);
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  t.after(() => {
    server.closeAllConnections();
    return new Promise(resolve => server.close(resolve));
  });
  const address = server.address();
  assert.equal(typeof address, 'object');
  const origin = `http://127.0.0.1:${address.port}`;

  const fixture = fixtureApi();
  createTestBrowserExtension({
    executablePath: executable,
    origins: [origin],
    allowSensitiveActions: false,
  })(fixture.api);
  const ctx = context();
  ctx.sessionManager = { getBranch: () => [] };
  await fixture.events.get('session_start')({ reason: 'startup' }, ctx);
  t.after(async () => {
    await invoke(fixture.tools.get('browser_close')).catch(() => undefined);
    await fixture.commands.get('browser').handler('off', ctx);
  });
  assert.deepEqual(fixture.active(), ['read', ...AUTOMATIC_BROWSER_TOOL_NAMES]);

  const gone = await invoke(fixture.tools.get('browser_goto'), { url: `${origin}/` });
  assert.match(gone.content[0].text, /Local browser fixture/);

  const firstRead = await invoke(fixture.tools.get('browser_read'));
  assert.match(firstRead.content[0].text, /initial fixture text/);
  assert.match(firstRead.content[0].text, /websocket-blocked/);
  assert.match(firstRead.content[0].text, /worker-blocked/);
  assert.match(firstRead.content[0].text, /\[e1\] input/);
  assert.match(firstRead.content[0].text, /\[e2\] button/);
  assert.match(firstRead.content[0].text, /\[e3\] a: safe linked page/);
  assert.match(firstRead.content[0].text, /\[e4\] button: unsafe external submit/);
  assert.doesNotMatch(firstRead.content[0].text, /\[e\d+\] a: unsafe/);
  assert.doesNotMatch(firstRead.content[0].text, /Secret password/);

  const followed = await invoke(fixture.tools.get('browser_click'), { ref: 'e3' });
  assert.match(followed.content[0].text, /\/linked/);
  await invoke(fixture.tools.get('browser_goto'), { url: `${origin}/` });
  await invoke(fixture.tools.get('browser_read'));
  await assert.rejects(invoke(fixture.tools.get('browser_click'), { ref: 'e2' }), /separate explicit user authorization/);
  await fixture.commands.get('browser').handler('sensitive on', ctx);
  assert.deepEqual(fixture.active(), ['read', ...BROWSER_TOOL_NAMES]);
  const externalBlocked = await invoke(fixture.tools.get('browser_click'), { ref: 'e4' });
  assert.match(externalBlocked.content[0].text, new RegExp(origin.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  await invoke(fixture.tools.get('browser_read'));
  await invoke(fixture.tools.get('browser_fill'), { ref: 'e1', value: 'updated by fixture' });
  await invoke(fixture.tools.get('browser_click'), { ref: 'e2' });
  const secondRead = await invoke(fixture.tools.get('browser_read'));
  assert.match(secondRead.content[0].text, /updated by fixture/);

  const screenshot = await invoke(fixture.tools.get('browser_screenshot'));
  assert.equal(screenshot.content[1].type, 'image');
  assert.equal(screenshot.content[1].mimeType, 'image/jpeg');
  assert.ok(Buffer.from(screenshot.content[1].data, 'base64').length <= 2 * 1024 * 1024);

  const redirected = await invoke(fixture.tools.get('browser_goto'), { url: `${origin}/same-origin-redirect` });
  assert.match(redirected.content[0].text, /redirect-target/);
  const blockedNavigation = /unapproved origin|ERR_(?:FAILED|BLOCKED_BY_CLIENT)|interrupted|aborted|closed/i;
  await assert.rejects(
    invoke(fixture.tools.get('browser_goto'), { url: `${origin}/redirect` }),
    blockedNavigation,
  );
  await assert.rejects(
    invoke(fixture.tools.get('browser_goto'), { url: `${origin}/redirect-chain` }),
    blockedNavigation,
  );
  await assert.rejects(
    invoke(fixture.tools.get('browser_goto'), { url: `${origin}/redirect-ip` }),
    blockedNavigation,
  );
  await assert.rejects(
    invoke(fixture.tools.get('browser_goto'), { url: `${origin}/redirect-ipv6` }),
    blockedNavigation,
  );
  assert.deepEqual(blockedRequests, []);
  assert.deepEqual(blockedIpv6Requests, []);
  assert.equal(blockedUpgrades, 0);

  let markSlowStarted;
  let started = new Promise(resolve => { markSlowStarted = resolve; });
  slowStarted = markSlowStarted;
  const controller = new AbortController();
  const cancelledNavigation = invoke(
    fixture.tools.get('browser_goto'), { url: `${origin}/slow` }, controller.signal,
  );
  await started;
  const cancellationObserved = assert.rejects(cancelledNavigation, /cancelled|closed/i);
  controller.abort();
  await cancellationObserved;
  await invoke(fixture.tools.get('browser_goto'), { url: `${origin}/` });

  started = new Promise(resolve => { markSlowStarted = resolve; });
  slowStarted = markSlowStarted;
  const interruptedByOff = invoke(fixture.tools.get('browser_goto'), { url: `${origin}/slow` });
  await started;
  const interruptionObserved = assert.rejects(interruptedByOff, /closed|cancelled|failed|aborted/i);
  await fixture.commands.get('browser').handler('off', ctx);
  await interruptionObserved;
  assert.deepEqual(fixture.active(), ['read']);
});
