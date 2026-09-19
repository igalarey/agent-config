import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { discoverAndLoadExtensions } from '@earendil-works/pi-coding-agent';
import browserExtension, {
  AUTOMATIC_BROWSER_TOOL_NAMES,
  BROWSER_TOOL_NAMES,
  createTestBrowserExtension,
} from '../index.ts';
import {
  BrowserRuntime,
  boundText,
  executableCandidates,
  resolveExecutablePath,
  validateExecutablePath,
} from '../browser-runtime.ts';
import {
  buildPublicPolicy,
  buildTestPolicy,
  canonicalOrigin,
  isExplicitLocalAddress,
  isPublicAddress,
} from '../policy.ts';

const root = path.resolve(import.meta.dirname, '..');

function fakeApi(initialEntries = []) {
  const tools = new Map();
  const commands = new Map();
  const events = new Map();
  const entries = [...initialEntries];
  let active = ['read', ...BROWSER_TOOL_NAMES];
  let activeCalls = 0;
  return {
    api: {
      registerTool(definition) { tools.set(definition.name, definition); },
      registerCommand(name, definition) { commands.set(name, definition); },
      on(name, handler) { events.set(name, handler); },
      getActiveTools() { activeCalls++; return [...active]; },
      setActiveTools(names) { active = [...names]; },
      appendEntry(customType, data) { entries.push({ type: 'custom', customType, data }); },
    },
    tools,
    commands,
    events,
    entries,
    active: () => [...active],
    activeCalls: () => activeCalls,
  };
}

function fakeContext(fixture, { hasUI = true, confirm = async () => true } = {}) {
  const notifications = [];
  const statuses = [];
  return {
    ctx: {
      hasUI,
      sessionManager: { getBranch: () => [...fixture.entries] },
      ui: {
        theme: { fg: (_color, text) => text },
        confirm,
        notify: (message, level) => notifications.push({ message, level }),
        setStatus: (key, value) => statuses.push({ key, value }),
      },
    },
    notifications,
    statuses,
  };
}

async function withExecutable(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'pi-browser-test-'));
  const executable = path.join(directory, process.platform === 'win32' ? 'chrome.exe' : 'chrome');
  fs.writeFileSync(executable, 'fixture');
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return executable;
}

function testExtension(executable, origins = ['http://localhost:3456']) {
  return createTestBrowserExtension({ executablePath: executable, origins, allowSensitiveActions: true });
}

test('Pi 0.85.1 loads six tools and /browser without eager browser or active-tool work', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'pi-browser-load-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const loaded = await discoverAndLoadExtensions([path.join(root, 'index.ts')], directory, directory);
  assert.deepEqual(loaded.errors, []);
  assert.equal(loaded.extensions.length, 1);
  assert.deepEqual([...loaded.extensions[0].tools.keys()], [...BROWSER_TOOL_NAMES]);
  assert.ok(loaded.extensions[0].commands.has('browser'));

  const fixture = fakeApi();
  browserExtension(fixture.api);
  assert.equal(fixture.activeCalls(), 0);
});

test('automatic public policy validates and pins every public destination while rejecting private/local and nonstandard targets', async () => {
  const calls = [];
  const policy = buildPublicPolicy(async hostname => {
    calls.push(hostname);
    if (hostname === 'private.example') return [{ address: '127.0.0.1', family: 4 }];
    if (hostname === 'mixed.example') return [
      { address: '93.184.216.36', family: 4 },
      { address: '10.0.0.1', family: 4 },
    ];
    return [{ address: hostname === 'cdn.example.com' ? '93.184.216.35' : '93.184.216.34', family: 4 }];
  });
  assert.equal((await policy.resolveTarget('https://example.com/docs')).pinnedAddress, '93.184.216.34');
  assert.equal((await policy.resolveTarget('https://example.com/again')).pinnedAddress, '93.184.216.34');
  assert.equal((await policy.resolveTarget('https://cdn.example.com/file.js')).pinnedAddress, '93.184.216.35');
  assert.equal((await policy.resolveConnect('example.com:443')).pinnedAddress, '93.184.216.34');
  assert.deepEqual(calls, ['example.com', 'cdn.example.com']);
  await assert.rejects(async () => policy.resolveTarget('http://localhost/'), /does not include localhost/);
  await assert.rejects(async () => policy.resolveTarget('http://127.0.0.1/'), /non-public|private networks/);
  await assert.rejects(async () => policy.resolveTarget('https://private.example/'), /non-public address/);
  await assert.rejects(async () => policy.resolveTarget('https://mixed.example/subresource.js'), /non-public address/);
  await assert.rejects(async () => policy.resolveTarget('https://example.com:8443/'), /default HTTP/);
  await assert.rejects(async () => policy.resolveTarget('https://user:secret@example.com/'), /credentials/);
  await assert.rejects(async () => policy.resolveTarget('file:///tmp/x'), /scheme/);
});

test('the explicit test-only policy is canonical, exact, and can grant a fixture loopback origin', async () => {
  const policy = await buildTestPolicy(
    ['https://Example.COM', 'http://127.0.0.1:3000'],
    async () => [{ address: '93.184.216.34', family: 4 }],
  );
  assert.equal(canonicalOrigin('https://EXAMPLE.com:443').origin, 'https://example.com');
  assert.equal((await policy.resolveTarget('https://example.com/docs')).hostname, 'example.com');
  assert.equal((await policy.resolveTarget('http://127.0.0.1:3000/')).pinnedAddress, '127.0.0.1');
  await assert.rejects(async () => policy.resolveTarget('https://cdn.example.com/file.js'), /unapproved test origin/);
  await assert.rejects(async () => policy.resolveConnect('127.0.0.1:3000'), /unapproved test authority/);
  for (const value of ['https://example.com/path', 'https://user:secret@example.com', 'file:///tmp/a']) {
    assert.throws(() => canonicalOrigin(value));
  }
  assert.equal(isPublicAddress('8.8.8.8'), true);
  assert.equal(isPublicAddress('127.0.0.1'), false);
  assert.equal(isPublicAddress('fec0::1'), false);
  assert.equal(isPublicAddress('::192.0.2.1'), false);
  assert.equal(isPublicAddress('2606:4700:4700::1111'), true);
  assert.equal(isExplicitLocalAddress('192.168.1.10'), true);
});

test('automatic browser_click follows anchors without running handlers and rejects control clicks', async () => {
  const policy = await buildTestPolicy(['http://localhost:3456']);
  const runtime = new BrowserRuntime('/unused-fixture', policy);
  let currentUrl = 'http://localhost:3456/start';
  let handlerClicks = 0;
  const page = {
    url: () => currentUrl,
    title: async () => 'fixture',
    goto: async destination => { currentUrl = destination; },
  };
  runtime.ensureInstance = async () => ({ page });
  runtime.references.set('e1', {
    kind: 'a',
    handle: {
      getAttribute: async name => name === 'href' ? '/next' : null,
      click: async () => { handlerClicks++; },
      dispose: async () => {},
    },
  });
  const followed = await runtime.click('e1', false);
  assert.equal(followed.url, 'http://localhost:3456/next');
  assert.equal(handlerClicks, 0);
  runtime.references.set('e1', { kind: 'button', handle: { dispose: async () => {} } });
  await assert.rejects(runtime.click('e1', false), /change remote state/);
  runtime.references.set('e2', {
    kind: 'input',
    handle: {
      getAttribute: async name => name === 'autocomplete' ? 'one-time-code' : null,
      fill: async () => { throw new Error('credential control must not be filled'); },
    },
  });
  await assert.rejects(runtime.fill('e2', '123456'), /Credential-like controls/);
});

test('cancelling a queued operation does not let its successor overtake the running operation', async () => {
  const policy = await buildTestPolicy(['http://localhost:3456']);
  const runtime = new BrowserRuntime('/unused-fixture', policy);
  runtime.ensureInstance = async () => ({ page: {} });
  let releaseFirst;
  let firstStarted;
  const started = new Promise(resolve => { firstStarted = resolve; });
  const hold = new Promise(resolve => { releaseFirst = resolve; });
  const first = runtime.run(async () => { firstStarted(); await hold; });
  await started;
  const controller = new AbortController();
  const second = runtime.run(async () => assert.fail('cancelled operation executed'), controller.signal);
  const cancelled = assert.rejects(second, /cancelled/);
  let thirdStarted = false;
  const third = runtime.run(async () => { thirdStarted = true; });
  controller.abort();
  await cancelled;
  await new Promise(resolve => setImmediate(resolve));
  const overtookFirst = thirdStarted;
  releaseFirst();
  await Promise.all([first, third]);
  assert.equal(overtookFirst, false);
});

test('text bounds and installed-browser discovery are portable and explicit-path-first', async t => {
  const bounded = boundText(`${'á'.repeat(20_000)}\n${'line\n'.repeat(600)}`, 10_000);
  assert.equal(bounded.truncated, true);
  assert.ok(Buffer.byteLength(bounded.text) <= 10_000);
  await assert.rejects(validateExecutablePath(undefined), /empty/);
  const executable = await withExecutable(t);
  assert.equal(await validateExecutablePath(executable), executable);
  assert.equal(await resolveExecutablePath(executable, {}, process.platform), executable);
  const programFiles = fs.mkdtempSync(path.join(os.tmpdir(), 'pi-browser-program-files-'));
  t.after(() => fs.rmSync(programFiles, { recursive: true, force: true }));
  const discovered = path.join(programFiles, 'Google', 'Chrome', 'Application', 'chrome.exe');
  fs.mkdirSync(path.dirname(discovered), { recursive: true });
  fs.writeFileSync(discovered, 'fixture');
  assert.ok(executableCandidates({ ProgramFiles: programFiles }, 'win32').includes(discovered));
  assert.equal(await resolveExecutablePath(undefined, { ProgramFiles: programFiles }, 'win32'), discovered);

  const playwrightRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pi-browser-playwright-'));
  t.after(() => fs.rmSync(playwrightRoot, { recursive: true, force: true }));
  const playwrightExecutable = path.join(playwrightRoot, 'chromium-1243', 'chrome-linux64', 'chrome');
  fs.mkdirSync(path.dirname(playwrightExecutable), { recursive: true });
  fs.writeFileSync(playwrightExecutable, 'fixture');
  assert.equal(
    await resolveExecutablePath(undefined, { HOME: '/unused', PLAYWRIGHT_BROWSERS_PATH: playwrightRoot }, 'linux'),
    playwrightExecutable,
  );
});

test('session startup automatically enables only public read/navigation tools and rejects local access before browser discovery', async () => {
  const fixture = fakeApi();
  browserExtension(fixture.api);
  const ui = fakeContext(fixture);
  await fixture.events.get('session_start')({ reason: 'startup' }, ui.ctx);
  assert.deepEqual(fixture.active(), ['read', ...AUTOMATIC_BROWSER_TOOL_NAMES]);
  assert.equal(fixture.active().includes('browser_fill'), false);
  await assert.rejects(
    fixture.tools.get('browser_goto').execute('id', { url: 'http://127.0.0.1/' }, undefined, undefined, ui.ctx),
    /non-public|private networks/,
  );
});

test('/browser off persists revocation across reload/resume defaults and /browser on restores automatic tools', async () => {
  const fixture = fakeApi();
  browserExtension(fixture.api);
  const ui = fakeContext(fixture);
  await fixture.events.get('session_start')({ reason: 'startup' }, ui.ctx);
  await fixture.commands.get('browser').handler('off', ui.ctx);
  assert.deepEqual(fixture.active(), ['read']);

  const reloaded = fakeApi(fixture.entries);
  browserExtension(reloaded.api);
  const resumedUi = fakeContext(reloaded);
  await reloaded.events.get('session_start')({ reason: 'resume' }, resumedUi.ctx);
  assert.deepEqual(reloaded.active(), ['read']);
  await assert.rejects(reloaded.tools.get('browser_read').execute('id', {}, undefined, undefined, resumedUi.ctx), /off for this session/);
  await reloaded.commands.get('browser').handler('on', resumedUi.ctx);
  assert.deepEqual(reloaded.active(), ['read', ...AUTOMATIC_BROWSER_TOOL_NAMES]);
});

test('state-changing click/fill behavior requires a separate interactive grant and is revoked by off', async () => {
  const fixture = fakeApi();
  browserExtension(fixture.api);
  const ui = fakeContext(fixture, { confirm: async (title, message) => {
    assert.match(title, /sensitive/i);
    assert.match(message, /change remote state/);
    assert.match(message, /credentials remain forbidden/);
    return true;
  } });
  await fixture.events.get('session_start')({ reason: 'startup' }, ui.ctx);
  assert.equal(fixture.active().includes('browser_click'), true);
  assert.equal(fixture.active().includes('browser_fill'), false);
  await assert.rejects(fixture.tools.get('browser_fill').execute('id', { ref: 'e1', value: 'fixture' }), /separate explicit user authorization/);
  await fixture.commands.get('browser').handler('sensitive on', ui.ctx);
  assert.deepEqual(fixture.active(), ['read', ...BROWSER_TOOL_NAMES]);
  await fixture.tools.get('browser_close').execute('id', {});
  assert.deepEqual(fixture.active(), ['read', ...AUTOMATIC_BROWSER_TOOL_NAMES]);
  await fixture.commands.get('browser').handler('sensitive on', ui.ctx);
  assert.deepEqual(fixture.active(), ['read', ...BROWSER_TOOL_NAMES]);
  await fixture.commands.get('browser').handler('off', ui.ctx);
  assert.deepEqual(fixture.active(), ['read']);
});

test('public browser has no persistent status while sensitive grants remain visible', async () => {
  const fixture = fakeApi();
  browserExtension(fixture.api);
  const ui = fakeContext(fixture);
  await fixture.events.get('session_start')({ reason: 'startup' }, ui.ctx);
  assert.deepEqual(ui.statuses.at(-1), { key: 'pi-browser', value: undefined });
  await fixture.commands.get('browser').handler('sensitive on', ui.ctx);
  assert.equal(ui.statuses.at(-1).value, 'browser sensitive actions');
  await fixture.tools.get('browser_close').execute('id', {});
  assert.equal(ui.statuses.at(-1).value, undefined);
  await fixture.commands.get('browser').handler('off', ui.ctx);
  assert.equal(ui.statuses.at(-1).value, 'browser off');
  await fixture.commands.get('browser').handler('on', ui.ctx);
  assert.equal(ui.statuses.at(-1).value, undefined);
});

test('no-UI or denied sensitive grants stay inactive', async () => {
  for (const settings of [{ confirm: async () => false }, { hasUI: false }]) {
    const fixture = fakeApi();
    browserExtension(fixture.api);
    const ui = fakeContext(fixture, settings);
    await fixture.events.get('session_start')({ reason: 'startup' }, ui.ctx);
    await fixture.commands.get('browser').handler('sensitive on', ui.ctx);
    assert.equal(fixture.active().includes('browser_fill'), false);
  }
});

test('off and shutdown invalidate a sensitive confirmation still pending', async () => {
  for (const revoke of ['off', 'shutdown']) {
    let releaseConfirm;
    let confirmationStarted;
    const started = new Promise(resolve => { confirmationStarted = resolve; });
    const fixture = fakeApi();
    browserExtension(fixture.api);
    const ui = fakeContext(fixture, { confirm: async () => {
      confirmationStarted();
      return new Promise(resolve => { releaseConfirm = resolve; });
    } });
    await fixture.events.get('session_start')({ reason: 'startup' }, ui.ctx);
    const enabling = fixture.commands.get('browser').handler('sensitive on', ui.ctx);
    await started;
    if (revoke === 'off') await fixture.commands.get('browser').handler('off', ui.ctx);
    else await fixture.events.get('session_shutdown')({ reason: 'quit' }, ui.ctx);
    releaseConfirm(true);
    await enabling;
    assert.equal(fixture.active().includes('browser_fill'), false);
  }
});

test('browser_read preserves runtime truncation under an explicit source-fixture grant', async t => {
  const executable = await withExecutable(t);
  const original = BrowserRuntime.prototype.read;
  BrowserRuntime.prototype.read = async () => ({
    url: 'http://localhost:3456/', title: 'fixture', text: 'bounded text', elements: [], truncated: true,
  });
  t.after(() => { BrowserRuntime.prototype.read = original; });
  const fixture = fakeApi();
  testExtension(executable)(fixture.api);
  const ui = fakeContext(fixture);
  await fixture.events.get('session_start')({ reason: 'startup' }, ui.ctx);
  const result = await fixture.tools.get('browser_read').execute('id', {}, undefined, undefined, ui.ctx);
  assert.match(result.content[0].text, /Browser output truncated/);
  assert.equal(result.details.truncated, true);
});

test('browser ignores retired subagent globals and preserves public-only activation', async () => {
  const registered = [];
  const previousRegistry = globalThis.__pi_interactive_subagents;
  const previousIdentity = process.env.PI_SUBAGENT_AGENT;
  globalThis.__pi_interactive_subagents = { registerToolExtension: (name, extensionPath) => registered.push([name, extensionPath]) };
  process.env.PI_SUBAGENT_AGENT = 'researcher';
  try {
    const fixture = fakeApi();
    browserExtension(fixture.api);
    const ui = fakeContext(fixture);
    await fixture.events.get('session_start')({ reason: 'startup' }, ui.ctx);
    assert.deepEqual([...fixture.tools.keys()], [...BROWSER_TOOL_NAMES]);
    assert.deepEqual(registered, []);
    assert.deepEqual(fixture.active(), ['read', ...AUTOMATIC_BROWSER_TOOL_NAMES]);
  } finally {
    if (previousRegistry === undefined) delete globalThis.__pi_interactive_subagents;
    else globalThis.__pi_interactive_subagents = previousRegistry;
    if (previousIdentity === undefined) delete process.env.PI_SUBAGENT_AGENT;
    else process.env.PI_SUBAGENT_AGENT = previousIdentity;
  }
});
