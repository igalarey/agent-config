import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const digestFile = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const SENSITIVE_ENV = /(?:API[_-]?KEY|AUTH|CREDENTIAL|TOKEN|SECRET|PASSWORD|COOKIE|PROXY|NODE_OPTIONS|NODE_PATH|OPENAI|ANTHROPIC|GEMINI|GOOGLE_APPLICATION|AWS_|AZURE_|SSH_|GNUPG|GIT_CONFIG|CLAUDE_CONFIG|NPM_CONFIG_(?:USERCONFIG|GLOBALCONFIG|CACHE|PREFIX))/i;

function hostAt(packageRoot, executable, expectedVersion) {
  const packageFile = path.join(packageRoot, 'package.json');
  const meta = JSON.parse(fs.readFileSync(packageFile, 'utf8'));
  if (meta.name !== '@earendil-works/pi-coding-agent' || meta.version !== expectedVersion) return undefined;
  const relativeCli = typeof meta.bin === 'string' ? meta.bin : meta.bin?.pi;
  if (typeof relativeCli !== 'string') return undefined;
  const cli = path.resolve(packageRoot, relativeCli);
  if (!fs.statSync(cli).isFile()) return undefined;
  return {
    package: meta.name,
    version: meta.version,
    packageRoot,
    packageSha256: digestFile(packageFile),
    executable,
    executableSha256: digestFile(executable),
    cli,
    cliSha256: digestFile(cli),
  };
}

export function identifyPiHost(expectedVersion, { packageRoot } = {}) {
  if (!packageRoot) throw new Error('A release-local Pi host package root is required');
  const host = hostAt(path.resolve(packageRoot), process.execPath, expectedVersion);
  if (host) return host;
  throw new Error(`Development tree does not contain exact Pi host ${expectedVersion}`);
}

export function identifyInstalledPiHost(expectedVersion, { env = process.env } = {}) {
  const checked = new Set();
  for (const folder of String(env.PATH ?? '').split(path.delimiter).filter(Boolean)) {
    let current = path.resolve(folder.replace(/^"|"$/g, ''));
    for (let depth = 0; depth < 3; depth++, current = path.dirname(current)) {
      let packageRoot = path.join(current, 'node_modules', '@earendil-works', 'pi-coding-agent');
      if (!fs.existsSync(packageRoot)) packageRoot = path.join(current, 'lib', 'node_modules', '@earendil-works', 'pi-coding-agent');
      if (checked.has(packageRoot)) continue;
      checked.add(packageRoot);
      try {
        const host = hostAt(packageRoot, process.execPath, expectedVersion);
        if (host) return host;
      } catch {}
    }
  }
  throw new Error(`Installed Pi host ${expectedVersion} was not found on PATH`);
}

export function runtimeEnvironment(parent, { agentDir, home, temp, cwd = home }) {
  const env = {};
  for (const [key, value] of Object.entries(parent)) {
    if (value !== undefined && !SENSITIVE_ENV.test(key)
        && !key.toUpperCase().startsWith('PI_SUBAGENT_') && key.toUpperCase() !== 'PI_SUBAGENTS_CONFIG' && !key.toUpperCase().startsWith('PI_BROWSER_')
        && !key.toUpperCase().startsWith('OLLAMA_')
        && !/^(?:PI_)?MCP_/i.test(key)) env[key] = value;
  }
  for (const key of Object.keys(env)) {
    if (['NPM_CONFIG_OFFLINE', 'PI_RUN_LIVE_SUBAGENT_TESTS', 'PI_RUN_BROWSER_TESTS'].includes(key.toUpperCase())) delete env[key];
  }
  return {
    ...env,
    HOME: home,
    USERPROFILE: home,
    APPDATA: path.join(home, 'AppData', 'Roaming'),
    LOCALAPPDATA: path.join(home, 'AppData', 'Local'),
    XDG_CONFIG_HOME: path.join(home, '.config'),
    XDG_CACHE_HOME: path.join(home, '.cache'),
    TMPDIR: temp,
    TEMP: temp,
    TMP: temp,
    PWD: cwd,
    PI_CODING_AGENT_DIR: agentDir,
    PI_OFFLINE: '1',
    OLLAMA_HOST: 'http://127.0.0.1:1',
    PI_TELEMETRY: '0',
    PI_RUN_LIVE_SUBAGENT_TESTS: '0',
    PI_RUN_BROWSER_TESTS: '0',
    npm_config_offline: 'true',
    npm_config_cache: path.join(home, '.npm-cache'),
  };
}

function result(id, started, error, details) {
  return {
    id,
    ok: error === undefined,
    durationMs: Math.round(performance.now() - started),
    ...(details === undefined ? {} : { details }),
    ...(error === undefined ? {} : { reason: error instanceof Error ? error.message : String(error) }),
  };
}

async function check(id, operation) {
  const started = performance.now();
  try {
    return result(id, started, undefined, await operation());
  } catch (error) {
    return result(id, started, error);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function loadSupplementalExtensions({ releasePath, developmentPath, manifest, work }) {
  const subagentsIndex = manifest.packages.findIndex(pkg => pkg.name === 'pi-interactive-subagents');
  assert(subagentsIndex >= 0, 'Subagents package is missing from the release manifest');
  const developmentSubagents = path.join(developmentPath, `p${subagentsIndex}`);
  const loaderPackage = path.join(developmentSubagents, 'node_modules', '@earendil-works', 'pi-coding-agent');
  const loaderPackageFile = path.join(loaderPackage, 'package.json');
  const loaderMeta = JSON.parse(fs.readFileSync(loaderPackageFile, 'utf8'));
  assert(loaderMeta.version === manifest.piVersion, `Development loader Pi ${loaderMeta.version} does not match ${manifest.piVersion}`);
  const loaderFile = path.join(loaderPackage, 'dist', 'core', 'extensions', 'loader.js');
  const require = createRequire(loaderFile);
  const jitiEntry = path.join(path.dirname(require.resolve('jiti/package.json')), 'lib', 'jiti-static.mjs');
  const { createJiti } = await import(pathToFileURL(jitiEntry));
  const dependencyRoot = name => {
    const parts = name.split('/');
    for (const modules of [path.join(loaderPackage, 'node_modules'), path.join(developmentSubagents, 'node_modules')]) {
      const candidate = path.join(modules, ...parts);
      if (fs.existsSync(path.join(candidate, 'package.json'))) return candidate;
    }
    throw new Error(`Development host dependency is missing: ${name}`);
  };
  const agentCore = dependencyRoot('@earendil-works/pi-agent-core');
  const typebox = dependencyRoot('typebox');
  const hostShim = path.join(work, 'host-shim.mjs');
  fs.writeFileSync(hostShim, [
    'export const keyHint = (_action, fallback = "") => fallback;',
    'export const StringEnum = values => ({ anyOf: values.map(value => ({ const: value, type: "string" })) });',
    'export class Text { constructor(text) { this.text = text; } }',
    'export class Box { constructor() {} addChild() {} }',
    'export const truncateToWidth = (text, width) => String(text).slice(0, width);',
    'export const visibleWidth = text => String(text).length;',
  ].join('\n'));
  const alias = {
    '@earendil-works/pi-coding-agent': hostShim,
    '@earendil-works/pi-agent-core/harness/context': path.join(agentCore, 'dist', 'harness', 'context.js'),
    '@earendil-works/pi-agent-core/harness/env/nodejs': path.join(agentCore, 'dist', 'harness', 'env', 'nodejs.js'),
    '@earendil-works/pi-agent-core/harness/runtime/reducer': path.join(agentCore, 'dist', 'harness', 'runtime', 'reducer.js'),
    '@earendil-works/pi-agent-core/harness/session/testing': path.join(agentCore, 'dist', 'harness', 'session', 'testing', 'index.js'),
    '@earendil-works/pi-agent-core/harness/session': path.join(agentCore, 'dist', 'harness', 'session', 'index.js'),
    '@earendil-works/pi-agent-core/node': path.join(agentCore, 'dist', 'node.js'),
    '@earendil-works/pi-agent-core': path.join(agentCore, 'dist', 'index.js'),
    '@earendil-works/pi-tui': hostShim,
    '@earendil-works/pi-ai/providers/all': hostShim,
    '@earendil-works/pi-ai/compat': hostShim,
    '@earendil-works/pi-ai/oauth': hostShim,
    '@earendil-works/pi-ai': hostShim,
    'typebox': path.join(typebox, 'build', 'index.mjs'),
    'typebox/compile': path.join(typebox, 'build', 'compile', 'index.mjs'),
    'typebox/value': path.join(typebox, 'build', 'value', 'index.mjs'),
  };
  const jiti = createJiti(import.meta.url, { moduleCache: false, interopDefault: true, alias });
  const loaded = { extensions: [], errors: [] };
  const paths = manifest.packages.filter(pkg => pkg.name !== 'pi-mcp').flatMap(pkg => pkg.extensions.map(extension => {
    if (typeof extension !== 'string' || !extension || extension.includes('\\') || path.posix.isAbsolute(extension)
        || extension.split('/').some(part => !part || part === '.' || part === '..')) {
      throw new Error(`Unsafe runtime extension path: ${String(extension)}`);
    }
    const packageRoot = path.resolve(releasePath, pkg.path);
    const target = path.resolve(packageRoot, ...extension.split('/'));
    const relative = path.relative(packageRoot, target);
    if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative) || !fs.statSync(target).isFile()) {
      throw new Error(`Runtime extension escapes package: ${pkg.name}:${extension}`);
    }
    return target;
  }));
  for (const extensionPath of paths) {
    const state = { path: extensionPath, tools: new Map(), commands: new Map(), handlers: new Map(), activeTools: [] };
    const api = {
      registerTool(definition) {
        state.tools.set(definition.name, { definition });
        state.activeTools.push(definition.name);
      },
      registerCommand(name, definition) { state.commands.set(name, definition); },
      registerMessageRenderer() {},
      registerShortcut() {},
      on(event, handler) {
        const handlers = state.handlers.get(event) ?? [];
        handlers.push(handler);
        state.handlers.set(event, handlers);
      },
      appendEntry() {},
      getActiveTools() { return [...state.activeTools]; },
      setActiveTools(names) { state.activeTools = [...names]; },
      sendMessage() {},
      sendUserMessage() {},
    };
    try {
      const factory = await jiti.import(extensionPath, { default: true });
      assert(typeof factory === 'function', `Extension has no default factory: ${extensionPath}`);
      await factory(api);
      loaded.extensions.push(state);
    } catch (error) {
      loaded.errors.push({ path: extensionPath, error: error instanceof Error ? error.message : String(error) });
    }
  }
  return {
    loaded,
    supplemental: {
      mode: 'mock-host-api-direct-tool-execution',
      limitation: 'Not loader evidence; official ExtensionAPI exposes tool metadata but not execute functions. MCP is excluded from this minimal host mock and checked by official RPC and its own package tests.',
      excludedPackages: manifest.packages.filter(pkg => pkg.name === 'pi-mcp').map(pkg => pkg.name),
      hostPackage: loaderMeta.name,
      hostVersion: loaderMeta.version,
      hostShimSha256: digestFile(hostShim),
    },
  };
}

async function exerciseTools(loaded, manifest) {
  assert(loaded.errors.length === 0, loaded.errors.map(item => `${item.path}: ${item.error}`).join('; '));
  const expected = manifest.packages.filter(pkg => pkg.name !== 'pi-mcp').reduce((count, pkg) => count + pkg.extensions.length, 0);
  assert(loaded.extensions.length === expected, `Expected ${expected} extensions, loaded ${loaded.extensions.length}`);
  const tools = new Map(loaded.extensions.flatMap(extension => [...extension.tools].map(([name, value]) => [name, value.definition])));
  for (const name of ['subagent', 'subagents_list', 'subagent_message', 'ask_user_question', 'web_fetch']) {
    assert(tools.has(name), `Runtime tool was not registered: ${name}`);
  }
  if (manifest.packages.some(pkg => pkg.name === 'pi-browser')) {
    for (const name of BROWSER_TOOLS) assert(tools.has(name), `Runtime browser tool missing: ${name}`);
    const browser = loaded.extensions.find(extension => extension.tools.has('browser_goto'));
    assert(browser, 'Runtime browser extension state missing');
    for (const handler of browser.handlers.get('session_start') ?? []) {
      await handler({ reason: 'startup' }, {
        sessionManager: { getBranch: () => [] },
        ui: { theme: { fg: (_color, text) => text }, setStatus() {} },
      });
    }
    let rejected = false;
    try {
      await tools.get('browser_goto').execute('runtime-browser-private', { url: 'http://127.0.0.1/' }, undefined, undefined, { hasUI: false });
    } catch (error) {
      rejected = /non-public|private|localhost/i.test(String(error?.message ?? error));
    }
    assert(rejected, 'Automatic browser policy did not reject a private URL before browser startup');
    assert(browser.activeTools.includes('browser_goto'), 'Automatic public browser tool was inactive in supplemental runtime');
    assert(browser.activeTools.includes('browser_click'), 'Safe public link-follow tool was inactive');
    assert(!browser.activeTools.includes('browser_fill'), 'Sensitive browser fill tool was active without a separate grant');
  }
  const asked = await tools.get('ask_user_question').execute('runtime-ask', {
    question: 'Choose the deterministic answer', kind: 'single', options: ['first', 'second'],
  }, undefined, undefined, { hasUI: true, ui: { select: async () => 'second' } });
  assert(asked.details?.answers?.[0] === 'second', 'ask_user_question deterministic execution failed');
  const listed = await tools.get('subagents_list').execute('runtime-list', {}, undefined, undefined, {});
  const runtimeAgent = listed.details?.agents?.find(agent => agent.name === 'runtime-fixture');
  assert(runtimeAgent, 'subagents_list did not execute against the isolated agent directory');
  if (manifest.packages.some(pkg => pkg.name === 'pi-browser')) {
    assert(runtimeAgent.capabilities?.missingExtensions?.length === 0, 'Restricted browser tool backing was not registered for subagents');
    assert(runtimeAgent.capabilities?.extensionBackedTools?.includes('browser_goto'), 'Subagent browser capability was not resolved');
  }
  let rejected = false;
  try {
    await tools.get('web_fetch').execute('runtime-web', { url: 'file:///agent-config-offline-smoke' }, undefined, undefined, {});
  } catch (error) {
    rejected = /http|https/i.test(String(error?.message ?? error));
  }
  assert(rejected, 'web_fetch did not reject a non-network-safe URL before I/O');
}

async function exerciseProcessSurface({ releasePath, developmentPath, manifest, work }) {
  const subagentsIndex = manifest.packages.findIndex(pkg => pkg.name === 'pi-interactive-subagents');
  assert(subagentsIndex >= 0, 'Subagents package is missing from the release manifest');
  const developmentSubagents = path.join(developmentPath, `p${subagentsIndex}`);
  const loaderPackage = path.join(developmentSubagents, 'node_modules', '@earendil-works', 'pi-coding-agent');
  const require = createRequire(path.join(loaderPackage, 'package.json'));
  const jitiEntry = path.join(path.dirname(require.resolve('jiti/package.json')), 'lib', 'jiti-static.mjs');
  const { createJiti } = await import(pathToFileURL(jitiEntry));
  const jiti = createJiti(import.meta.url, { moduleCache: false });
  const surfaceModule = await jiti.import(path.join(releasePath, 'packages', 'pi-interactive-subagents', 'pi-extension', 'subagents', 'surface.ts'));
  const surface = surfaceModule.createSurface('runtime-smoke');
  try {
    const marker = 'AGENT_CONFIG_RUNTIME_PROCESS_OK';
    surfaceModule.sendLongCommand(surface, `printf '%s\\n' ${surfaceModule.shellEscape(marker)}`, {
      scriptPath: path.join(work, 'runtime-process.sh'),
    });
    const deadline = Date.now() + 20_000;
    while (Date.now() < deadline) {
      const output = await surfaceModule.readScreenAsync(surface, 80);
      if (output.includes(marker)) return;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error('Process-only surface did not return its deterministic marker');
  } finally {
    surfaceModule.closeSurface(surface);
  }
}

const PACKAGE_TOOLS = ['subagent', 'subagents_list', 'subagent_message', 'subagent_cancel', 'ask_user_question', 'web_fetch'];
const PACKAGE_COMMANDS = ['subagent', 'subagent-cancel', 'om', 'om:status', 'om:compact', 'om:consolidate'];
const modernBase = manifest => manifest.packages.some(pkg => pkg.name === '@tintinweb/pi-subagents');
const nativeBase = manifest => manifest.files?.some(file => file.path === 'native/package.json');
export const HISTORICAL_BIGPOWERS_SKILL_ALLOWLIST = [
  '.pi/skills/align-grid',
  '.pi/skills/context7-mcp',
  '.pi/skills/security-review',
];
export const BIGPOWERS_SKILL_ALLOWLIST = [
  ...HISTORICAL_BIGPOWERS_SKILL_ALLOWLIST,
  '.pi/skills/design-interface',
  '.pi/skills/deepen-architecture',
  '.pi/skills/elaborate-spec',
  '.pi/skills/grill-me',
  '.pi/skills/define-language',
  '.pi/skills/diagnose-root',
  '.pi/skills/enforce-first',
  '.pi/skills/edit-document',
  '.pi/skills/simple-english',
  '.pi/skills/smoke-test',
  '.pi/skills/validate-contracts',
];
const SUPPORTED_BIGPOWERS_SKILL_ALLOWLISTS = [
  HISTORICAL_BIGPOWERS_SKILL_ALLOWLIST,
  BIGPOWERS_SKILL_ALLOWLIST,
];

function nativeSettings(releasePath) {
  return JSON.parse(fs.readFileSync(path.join(releasePath, 'config/pi.settings.json'), 'utf8'));
}

function nativePackages(releasePath, manifest) {
  if (!nativeBase(manifest)) return [];
  return nativeSettings(releasePath).packages.map(entry => {
    const spec = typeof entry === 'string' ? entry : entry.source;
    const name = spec.slice(4, spec.lastIndexOf('@'));
    const source = path.join(releasePath, 'native/node_modules', name);
    return typeof entry === 'string' ? source : { ...entry, source };
  });
}
const packageTools = manifest => modernBase(manifest)
  ? ['Agent', 'get_subagent_result', 'steer_subagent', 'TaskCreate', 'TaskList', 'TaskGet', 'TaskUpdate', 'TaskOutput', 'TaskStop', 'TaskExecute', 'start_supervision', 'ask_user_question', ...(nativeBase(manifest) ? ['web_search', 'fetch_content', 'get_search_content', 'source_check'] : ['web_fetch'])] : PACKAGE_TOOLS;
const packageCommands = manifest => modernBase(manifest)
  ? ['agents', 'tasks', 'supervise', 'om', 'om:status', 'om:compact', 'om:consolidate'] : PACKAGE_COMMANDS;
const BROWSER_TOOLS = ['browser_goto', 'browser_read', 'browser_click', 'browser_fill', 'browser_screenshot', 'browser_close'];
const INSPECT_PREFIX = 'AGENT_CONFIG_RUNTIME_INSPECT ';
export const PROJECT_PROMPT_NAMES = ['compare-designs', 'diagnose', 'edit-document', 'review'];

function releasePromptNames(manifest) {
  return (manifest.files ?? []).map(file => file.path).filter(relative => /^prompts\/[^/]+\.md$/.test(relative))
    .map(relative => path.posix.basename(relative, '.md')).sort();
}
function copyReleasePrompts(releasePath, agentDir, manifest) {
  if (releasePromptNames(manifest).length === 0) return;
  fs.cpSync(path.join(releasePath, 'prompts'), path.join(agentDir, 'prompts'), { recursive: true });
}

export function assertPromptTemplateRegistrations(evidence, manifest) {
  const expected = releasePromptNames(manifest);
  if (expected.length === 0) return;
  assert(JSON.stringify(expected) === JSON.stringify(PROJECT_PROMPT_NAMES),
    `Unexpected project prompt inventory: ${expected.join(', ')}`);
  assert(evidence.commands?.success === true && Array.isArray(evidence.commands.data?.commands),
    'Official RPC prompt template evidence is missing');
  const prompts = evidence.commands.data.commands.filter(command => command.source === 'prompt');
  const actual = prompts.map(command => command.name).sort();
  assert(JSON.stringify(actual) === JSON.stringify(expected),
    `Expected prompt template registrations ${expected.join(', ')}, got ${actual.join(', ') || '(none)'}`);
  for (const command of prompts) {
    assert(command.sourceInfo?.source === 'auto' && command.sourceInfo?.scope === 'user'
      && path.basename(command.sourceInfo?.path ?? '') === `${command.name}.md`,
    `Prompt template was not loaded from the isolated global prompt directory: ${command.name}`);
  }
}

function writeInspectorExtension(file) {
  fs.writeFileSync(file, `export default function runtimeInspector(pi) {
  pi.registerCommand("agent-config-runtime-inspect", {
    description: "Inspect tools registered by the official Pi loader",
    handler: async (_args, ctx) => {
      const bridge = globalThis[Symbol.for("pi.subagents.tool-extension-registry")];
      const payload = {
        mcpSubagentBridge: typeof bridge?.registerToolExtension === "function"
          && bridge === globalThis.__pi_interactive_subagents,
        allTools: pi.getAllTools().map(tool => ({ name: tool.name, sourceInfo: tool.sourceInfo })),
        activeTools: pi.getActiveTools(),
        commands: pi.getCommands().map(command => ({ name: command.name, sourceInfo: command.sourceInfo })),
      };
      ctx.ui.notify(${JSON.stringify(INSPECT_PREFIX)} + JSON.stringify(payload), "info");
    },
  });
}\n`);
}

function runRpc({ releasePath, manifest, host, env, agentDir, sessionDir, cwd, temp }) {
  fs.writeFileSync(path.join(agentDir, 'settings.json'), JSON.stringify({
    packages: [...manifest.packages.map(pkg => path.join(releasePath, pkg.path)), ...nativePackages(releasePath, manifest)],
  }));
  const inspector = path.join(temp, 'runtime-inspector.mjs');
  writeInspectorExtension(inspector);
  const input = [
    { id: 'state', type: 'get_state' },
    { id: 'commands', type: 'get_commands' },
    { id: 'inspect', type: 'prompt', message: '/agent-config-runtime-inspect' },
    { id: 'memory-status', type: 'prompt', message: '/om:status' },
  ].map(value => JSON.stringify(value)).join('\n') + '\n';
  const rpc = spawnSync(process.execPath, [host.cli, '--mode', 'rpc', '--session-dir', sessionDir, '--extension', inspector,
    ...(nativeBase(manifest) ? [] : ['--no-skills']),
    ...(nativeBase(manifest) || releasePromptNames(manifest).length > 0 ? [] : ['--no-prompt-templates']),
    '--no-context-files', '--no-themes'], {
    cwd, env, input, encoding: 'utf8', shell: false, timeout: 60_000, maxBuffer: 16 * 1024 * 1024,
  });
  assert(rpc.status === 0, rpc.error?.message ?? rpc.stderr?.trim() ?? `RPC exited ${rpc.status}`);
  assert(!rpc.stderr?.trim(), `RPC stderr was not empty: ${rpc.stderr.trim()}`);
  const messages = rpc.stdout.split('\n').filter(Boolean).map(line => JSON.parse(line));
  assert(!messages.some(message => message.type === 'extension_error'), 'RPC emitted extension_error');
  const notification = messages.find(message => message.type === 'extension_ui_request' && message.method === 'notify'
    && message.message?.startsWith(INSPECT_PREFIX));
  assert(notification, 'Official loader tool inspection notification missing');
  return {
    messages,
    inspection: JSON.parse(notification.message.slice(INSPECT_PREFIX.length)),
    state: messages.find(message => message.id === 'state'),
    commands: messages.find(message => message.id === 'commands'),
    inspect: messages.find(message => message.id === 'inspect'),
    status: messages.find(message => message.id === 'memory-status'),
  };
}

function assertInsideRelease(releasePath, sourceInfo, label) {
  assert(sourceInfo?.origin === 'package' && typeof sourceInfo.path === 'string', `${label} was not registered from a package`);
  const relative = path.relative(releasePath, sourceInfo.path);
  assert(relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative), `${label} loaded outside release: ${sourceInfo.path}`);
}

function sourceIsInside(root, sourceInfo) {
  if (sourceInfo?.origin !== 'package' || typeof sourceInfo.path !== 'string') return false;
  const relative = path.relative(root, sourceInfo.path);
  return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

export function assertBigpowersResourcePolicy(commands, releasePath) {
  const entry = nativeSettings(releasePath).packages.find(value => {
    const source = typeof value === 'string' ? value : value?.source;
    return /^npm:bigpowers@/.test(source ?? '');
  });
  assert(entry && typeof entry === 'object', 'Bigpowers package policy missing');
  assert(Array.isArray(entry.extensions) && entry.extensions.length === 0, 'Bigpowers extensions must be disabled');

  if (entry.skills === undefined && entry.prompts === undefined) {
    for (const name of ['using-bigpowers', 'skill:using-bigpowers']) {
      assert(commands.has(name), `Legacy Bigpowers resource missing: ${name}`);
      assertInsideRelease(releasePath, commands.get(name).sourceInfo, name);
    }
    return;
  }

  const configuredAllowlist = SUPPORTED_BIGPOWERS_SKILL_ALLOWLISTS.find(
    allowlist => JSON.stringify(entry.skills) === JSON.stringify(allowlist),
  );
  assert(configuredAllowlist, 'Unexpected Bigpowers skill allowlist');
  assert(Array.isArray(entry.prompts) && entry.prompts.length === 0, 'Bigpowers prompts must be disabled');
  const expected = new Set(configuredAllowlist.map(value => `skill:${path.posix.basename(value)}`));
  const packageRoot = path.join(releasePath, 'native/node_modules/bigpowers');
  const actual = new Set([...commands].filter(([, command]) => sourceIsInside(packageRoot, command.sourceInfo)).map(([name]) => name));
  assert(JSON.stringify([...actual].sort()) === JSON.stringify([...expected].sort()),
    `Unexpected Bigpowers commands: ${[...actual].sort().join(', ') || '(none)'}`);
  for (const name of expected) assertInsideRelease(releasePath, commands.get(name)?.sourceInfo, name);
}

export function assertOfficialLoaderEvidence(evidence, releasePath, manifest) {
  assert(evidence.inspect?.success === true, 'Official loader inspector command failed');
  const allTools = new Map(evidence.inspection.allTools.map(tool => [tool.name, tool]));
  const activeTools = new Set(evidence.inspection.activeTools);
  for (const name of packageTools(manifest)) {
    assert(allTools.has(name), `Official Pi loader tool missing: ${name}`);
    assert(activeTools.has(name), `Official Pi loader tool is inactive: ${name}`);
    assertInsideRelease(releasePath, allTools.get(name).sourceInfo, `Tool ${name}`);
  }
  const commands = new Map(evidence.inspection.commands.map(command => [command.name, command]));
  assertPromptTemplateRegistrations(evidence, manifest);
  if (manifest.packages.some(pkg => pkg.name === 'pi-browser')) {
    const automaticBrowserTools = new Set(['browser_goto', 'browser_read', 'browser_click', 'browser_screenshot', 'browser_close']);
    for (const name of BROWSER_TOOLS) {
      assert(allTools.has(name), `Official Pi loader browser tool missing: ${name}`);
      assert(activeTools.has(name) === automaticBrowserTools.has(name), `Unexpected browser startup activation: ${name}`);
      assertInsideRelease(releasePath, allTools.get(name).sourceInfo, `Tool ${name}`);
    }
    assert(commands.has('browser'), 'Official Pi loader browser command missing');
    assertInsideRelease(releasePath, commands.get('browser').sourceInfo, 'Command browser');
  }
  if (nativeBase(manifest)) {
    assert(!allTools.has('web_fetch') && !allTools.has('bigpowers_skill'), 'Retired fetch or disabled bigpowers extension loaded');
    assert(!evidence.messages.some(message => message.method === 'setStatus' && message.statusKey === 'mcp' && message.statusText), 'MCP footer was not disabled');
    assertBigpowersResourcePolicy(commands, releasePath);
    if (fs.existsSync(path.join(releasePath, 'native/node_modules/pi-ollama/package.json'))) {
      for (const name of ['ollama-refresh', 'ollama-status', 'ollama-info']) {
        assert(commands.has(name), `Official Pi loader Ollama command missing: ${name}`);
        assertInsideRelease(releasePath, commands.get(name).sourceInfo, `Command ${name}`);
      }
    }
  }
  if (nativeBase(manifest) || manifest.packages.some(pkg => pkg.name === 'pi-mcp')) {
    for (const name of ['mcp', 'mcpScript']) {
      assert(allTools.has(name) && activeTools.has(name), `Official Pi loader MCP tool missing or inactive: ${name}`);
      assertInsideRelease(releasePath, allTools.get(name).sourceInfo, `Tool ${name}`);
    }
    for (const name of ['mcp', 'pi-mcp', 'mcp-auth']) {
      assert(commands.has(name), `Official Pi loader MCP command missing: ${name}`);
      assertInsideRelease(releasePath, commands.get(name).sourceInfo, `Command ${name}`);
    }
    if (!modernBase(manifest)) assert(evidence.inspection.mcpSubagentBridge === true, 'Official Pi loader MCP subagent bridge is missing or disconnected');
  }
  if (manifest.packages.some(pkg => pkg.name === 'pi-subscription-usage')) {
    assert(commands.has('subscription-refresh'), 'Official Pi loader subscription refresh command missing');
    assertInsideRelease(releasePath, commands.get('subscription-refresh').sourceInfo, 'Command subscription-refresh');
  }
  for (const name of packageCommands(manifest)) {
    assert(commands.has(name), `Official Pi loader command missing: ${name}`);
    assertInsideRelease(releasePath, commands.get(name).sourceInfo, `Command ${name}`);
  }
}

function assertRpcEvidence(evidence, releasePath, sessionDir, manifest = { packages: [] }) {
  assert(evidence.state?.success === true && typeof evidence.state.data?.sessionFile === 'string', 'RPC get_state did not return an isolated session');
  const sessionRelative = path.relative(sessionDir, evidence.state.data.sessionFile);
  assert(sessionRelative !== '..' && !sessionRelative.startsWith(`..${path.sep}`) && !path.isAbsolute(sessionRelative), `RPC session escaped its temporary directory: ${evidence.state.data.sessionFile}`);
  assert(evidence.commands?.success === true, 'RPC get_commands failed');
  const commandNames = new Set(evidence.commands.data?.commands?.filter(command => command.source === 'extension').map(command => command.name));
  for (const name of packageCommands(manifest)) assert(commandNames.has(name), `RPC command missing: ${name}`);
  assert(evidence.status?.success === true, 'RPC /om:status did not execute without a model');
  assert(evidence.messages.some(message => message.type === 'extension_ui_request' && message.method === 'notify' && /om status/.test(message.message)), 'RPC memory status notification missing');
  for (const command of evidence.commands.data.commands.filter(item => item.source === 'extension' && item.sourceInfo?.origin === 'package')) {
    assertInsideRelease(releasePath, command.sourceInfo, `RPC command ${command.name}`);
  }
}

function fauxIntegrationProvider(pi) {
  let calls = 0;
  const streamSimple = (model, context, options) => {
    const stream = createAssistantMessageEventStream();
    queueMicrotask(async () => {
      if (policyProfiles && model.provider === 'openai-codex') {
        let captured;
        const token = `fixture.${Buffer.from(JSON.stringify({ 'https://api.openai.com/auth': { chatgpt_account_id: 'offline-fixture' } })).toString('base64url')}.fixture`;
        await codexStreamSimple(model, context, { ...options, apiKey: token, transport: 'sse', maxRetries: 0,
          fetch: async (_url, init) => {
            const body = typeof init.body === 'string' ? init.body : zlib.zstdDecompressSync(init.body).toString();
            captured = JSON.parse(body);
            throw new Error('OFFLINE_CAPTURE_ONLY');
          },
        }).result();
        const luna = model.id === 'gpt-5.6-luna';
        if (captured?.reasoning?.effort !== (luna ? 'medium' : 'high')
          || captured.service_tier !== (luna ? 'priority' : undefined)) {
          throw new Error(`Subagent model policy was not serialized for ${model.id}`);
        }
      }
      let content;
      const names = new Set((context.tools ?? []).map(tool => tool.name));
      const results = context.messages.filter(message => message.role === 'toolResult');
      const tool = (name, args) => [{ type: 'toolCall', id: `fixture-${++calls}`, name, arguments: args }];
      const text = value => [{ type: 'text', text: value }];
      if (calls > 15) throw new Error('Faux integration exceeded its turn budget');
      if (names.has('TaskExecute')) {
        const done = name => results.find(message => message.toolName === name);
        if (!done('TaskCreate')) content = tool('TaskCreate', { subject: 'Runtime fixture', description: 'Return child scope evidence', agentType: 'general-purpose' });
        else if (!done('TaskExecute')) content = tool('TaskExecute', { task_ids: ['1'], ...(policyProfiles ? {} : { model: 'agent-config-fixture/fixture' }) });
        else if (!done('TaskOutput')) content = tool('TaskOutput', { task_id: '1', block: true, timeout: 15000 });
        else if (!done('Agent')) content = tool('Agent', { subagent_type: 'Explore', description: 'Check restricted scope', prompt: 'Report scope', ...(policyProfiles ? {} : { model: 'agent-config-fixture/fixture' }), run_in_background: false });
        else if (policyProfiles && results.filter(message => message.toolName === 'Agent').length < 2) content = tool('Agent', { subagent_type: 'deep-review', description: 'Check Sol high scope', prompt: 'Report scope', run_in_background: false });
        else if (policyProfiles && results.filter(message => message.toolName === 'Agent').length < 4) content = tool('Agent', { subagent_type: results.filter(message => message.toolName === 'Agent').length === 2 ? 'Plan' : 'deep-implementation', description: 'Check remaining Sol profile', prompt: 'Report scope', run_in_background: false });
        else if (!done('start_supervision')) content = tool('start_supervision', { outcome: 'Verify offline fixture only', sensitivity: 'low', model: 'agent-config-fixture/fixture' });
        else {
          const delegated = JSON.stringify(done('TaskOutput'));
          const restricted = JSON.stringify(done('Agent'));
          const agents = results.filter(message => message.toolName === 'Agent');
          const sol = !policyProfiles || (agents.length === 4
            && agents.every(message => /READONLY_SCOPE_OK|CHILD_SCOPE_OK/.test(JSON.stringify(message)))
            && agents.some(message => JSON.stringify(message).includes('SOL_HIGH_OK')));
          content = text(delegated.includes('CHILD_SCOPE_OK') && restricted.includes('READONLY_SCOPE_OK') && sol ? 'BASE_INTEGRATION_OK' : 'BASE_INTEGRATION_FAILED');
        }
      } else if (names.size === 0) {
        content = text(JSON.stringify({ action: 'done', reasoning: 'SUPERVISOR_FIXTURE_OK', confidence: 1 }));
      } else if (names.has('mcp')) {
        const expected = ['read', 'bash', 'edit', 'write', names.has('fetch_content') ? 'fetch_content' : 'web_fetch', 'browser_goto', 'browser_read', 'browser_close', 'mcpScript', 'ask_user_question'];
        const valid = !policyProfiles && expected.every(name => names.has(name)) && !names.has('TaskExecute') && !names.has('start_supervision') && !names.has('browser_fill');
        content = text(`${valid ? 'CHILD_SCOPE_OK' : 'CHILD_SCOPE_FAILED'} pid=${process.pid} tools=${[...names].sort().join(',')}`);
      } else if (names.has('bash')) {
        const expected = ['read', 'grep', 'find', 'ls', 'bash', 'edit', 'write'];
        const valid = expected.every(name => names.has(name)) && [...names].every(name => expected.includes(name));
        content = text(`${valid ? 'CHILD_SCOPE_OK' : 'CHILD_SCOPE_FAILED'} pid=${process.pid} tools=${[...names].sort().join(',')}`);
      } else {
        const valid = ['read', 'grep', 'find', 'ls'].every(name => names.has(name))
          && [...names].every(name => ['read', 'grep', 'find', 'ls'].includes(name));
        content = text(`${valid ? 'READONLY_SCOPE_OK' : 'READONLY_SCOPE_FAILED'} pid=${process.pid} ${model.id === 'gpt-5.6-sol' ? 'SOL_HIGH_OK' : ''}`);
      }
      const message = { role: 'assistant', content, api: model.api, provider: model.provider, model: model.id,
        stopReason: content[0].type === 'toolCall' ? 'toolUse' : 'stop', timestamp: Date.now(),
        usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } } };
      stream.push({ type: 'start', partial: message });
      stream.push({ type: 'done', reason: message.stopReason, message });
      stream.end();
    });
    return stream;
  };
  if (policyProfiles) pi.registerProvider('openai-codex', { baseUrl: 'https://invalid.example', apiKey: 'offline-fixture', api: 'openai-codex-responses',
    models: ['gpt-5.6-luna', 'gpt-5.6-sol'].map(id => ({ id, name: id, reasoning: true, thinkingLevelMap: { medium: 'medium', high: 'high' },
      input: ['text'], contextWindow: 200000, maxTokens: 1024, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } })), streamSimple });
  pi.registerProvider('agent-config-fixture', { baseUrl: 'https://invalid.example', apiKey: 'offline-fixture', api: 'agent-config-fixture',
    models: [{ id: 'fixture', name: 'fixture', reasoning: false, input: ['text'], contextWindow: 200000, maxTokens: 1024,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } }], streamSimple });
}

async function runModernSmoke({ releasePath, manifest, parentEnv }) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-config-modern-smoke-'));
  const home = path.join(root, 'home'), agentDir = path.join(home, '.pi/agent');
  const cwd = path.join(root, 'cwd'), temp = path.join(root, 'tmp'), sessionDir = path.join(root, 'sessions');
  for (const folder of [home, agentDir, cwd, temp, sessionDir]) fs.mkdirSync(folder, { recursive: true });
  fs.cpSync(path.join(releasePath, 'agents'), path.join(agentDir, 'agents'), { recursive: true });
  copyReleasePrompts(releasePath, agentDir, manifest);
  for (const name of ['subagents.json', 'tasks-config.json', 'SUPERVISOR.md']) fs.copyFileSync(path.join(releasePath, 'config', name), path.join(agentDir, name));
  for (const name of ['mcp.json', 'web-search.json']) {
    const source = path.join(releasePath, 'config', name);
    if (fs.existsSync(source)) fs.copyFileSync(source, path.join(agentDir, name));
  }
  const env = runtimeEnvironment(parentEnv, { home, agentDir, temp, cwd });
  let host, rpcEvidence, integration;
  const results = [];
  try {
    results.push(await check('runtime:host', async () => {
      host = identifyInstalledPiHost(manifest.piVersion, { env });
      return { version: host.version, mode: 'installed-exact-host' };
    }));
    results.push(await check('runtime:loader', async () => {
      assert(host, 'Missing exact Pi host');
      rpcEvidence = runRpc({ releasePath, manifest, host, env, agentDir, sessionDir, cwd, temp });
      assertOfficialLoaderEvidence(rpcEvidence, releasePath, manifest);
      for (const name of PACKAGE_TOOLS.filter(name => name.startsWith('subagent'))) {
        assert(!rpcEvidence.inspection.allTools.some(tool => tool.name === name), `Legacy tool still loaded: ${name}`);
      }
      return { mode: 'official-cli-rpc' };
    }));
    results.push(await check('runtime:supplemental-tool-execution', async () => {
      assert(host, 'Missing exact Pi host');
      const fixture = path.join(temp, 'faux-integration.mjs');
      fs.writeFileSync(fixture, `import { createAssistantMessageEventStream } from '@earendil-works/pi-ai';\nimport { streamSimple as codexStreamSimple } from ${JSON.stringify(path.join(host.packageRoot, 'node_modules/@earendil-works/pi-ai/dist/api/openai-codex-responses.js'))};\nimport * as zlib from 'node:zlib';\nconst policyProfiles = ${fs.existsSync(path.join(releasePath, 'agents/luna-fast.mjs'))};\nexport default ${fauxIntegrationProvider.toString()}\n`);
      const run = spawnSync(process.execPath, [host.cli, '--mode', 'json', '--no-session', '--provider', 'agent-config-fixture', '--model', 'fixture',
        '--extension', fixture, '--no-skills', '--no-prompt-templates', '--no-context-files', '--no-themes', '-p', 'Run the deterministic integration fixture.'],
      { cwd, env, encoding: 'utf8', shell: false, timeout: 60_000, maxBuffer: 16 * 1024 * 1024 });
      assert(run.status === 0, run.error?.message ?? run.stderr ?? `exit ${run.status}`);
      assert(!run.stderr.trim(), run.stderr);
      integration = run.stdout.split('\n').filter(Boolean).map(line => JSON.parse(line));
      const ended = integration.filter(event => event.type === 'message_end').map(event => event.message);
      assert(!integration.some(event => event.type === 'extension_error'), 'Integration extension error');
      assert(!ended.some(message => message.role === 'toolResult' && message.isError), 'Integration tool failed');
      const final = ended.filter(message => message.role === 'assistant').at(-1);
      assert(ended.some(message => message.role === 'toolResult' && message.toolName === 'start_supervision' && JSON.stringify(message).includes('agent-config-fixture')), 'Supervisor did not start with the offline model');
      assert(final?.content?.some(block => block.text === 'BASE_INTEGRATION_OK'), `Faux integration failed: ${JSON.stringify(ended).slice(-12000)}`);
      return { mode: 'official-cli-faux-model-integration', networkModelCalls: 0, taskExecute: true, childExtensionScope: true, restrictedScope: true };
    }));
    results.push(await check('runtime:process-only', async () => {
      assert(integration, 'Integration did not execute');
      const output = JSON.stringify(integration);
      const pids = [...output.matchAll(/pid=(\d+)/g)].map(match => match[1]);
      assert(pids.length >= 2 && new Set(pids).size === 1, 'Children did not report a shared process');
      return { mode: 'in-process-sdk-children', modelInvocations: 'scripted-offline-only' };
    }));
    results.push(await check('runtime:rpc', async () => {
      assert(rpcEvidence, 'RPC unavailable');
      assertRpcEvidence(rpcEvidence, releasePath, sessionDir, manifest);
      return { mode: 'official-cli-rpc', modelInvocations: 0 };
    }));
    return { results, host: host && { package: host.package, version: host.version, packageSha256: host.packageSha256,
      executableSha256: host.executableSha256, cliSha256: host.cliSha256 },
      loader: host && { package: host.package, version: host.version, packageSha256: host.packageSha256, loaderSha256: host.cliSha256, mode: 'official-cli-rpc' },
      supplemental: { mode: 'official-cli-faux-model-integration' },
      runner: { name: 'scripts/runtime-smoke.mjs', sha256: digestFile(fileURLToPath(import.meta.url)) } };
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
}

export async function runRuntimeSmoke({ releasePath, developmentPath, manifest, parentEnv = process.env }) {
  if (modernBase(manifest)) return runModernSmoke({ releasePath, manifest, parentEnv });
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-config-runtime-smoke-'));
  const home = path.join(root, 'home');
  const agentDir = path.join(root, 'agent');
  const cwd = path.join(root, 'cwd');
  const sessionDir = path.join(root, 'sessions');
  const temp = path.join(root, 'tmp');
  for (const folder of [home, agentDir, cwd, sessionDir, temp, path.join(agentDir, 'agents')]) fs.mkdirSync(folder, { recursive: true });
  fs.writeFileSync(path.join(agentDir, 'agents', 'runtime-fixture.md'), '---\nname: runtime-fixture\ndescription: isolated deterministic smoke agent\ntools: read, browser_goto, browser_read, browser_click, browser_screenshot, browser_close\ndisable-model-invocation: false\n---\nRuntime smoke only.\n');
  copyReleasePrompts(releasePath, agentDir, manifest);
  const env = runtimeEnvironment(parentEnv, { agentDir, home, temp, cwd });
  const originalEnv = { ...process.env };
  const originalCwd = process.cwd();
  for (const key of Object.keys(process.env)) delete process.env[key];
  Object.assign(process.env, env);
  process.chdir(cwd);
  let host;
  let loaderEvidence;
  let rpcEvidence;
  let supplementalState;
  const results = [];
  try {
    results.push(await check('runtime:host', async () => {
      host = identifyPiHost(manifest.piVersion, {
        packageRoot: path.join(developmentPath, `p${manifest.packages.findIndex(pkg => pkg.name === 'pi-interactive-subagents')}`, 'node_modules', '@earendil-works', 'pi-coding-agent'),
      });
      return { mode: 'release-local-development-host', version: host.version };
    }));
    results.push(await check('runtime:loader', async () => {
      assert(host, 'Exact Pi host was not identified');
      rpcEvidence = runRpc({ releasePath, manifest, host, env, agentDir, sessionDir, cwd, temp });
      assertOfficialLoaderEvidence(rpcEvidence, releasePath, manifest);
      loaderEvidence = {
        package: host.package,
        version: host.version,
        packageSha256: host.packageSha256,
        loaderSha256: host.cliSha256,
        mode: 'official-cli-rpc',
        entrypoint: path.relative(host.packageRoot, host.cli).replaceAll('\\', '/'),
      };
      return {
        mode: loaderEvidence.mode,
        registeredPackageTools: [...PACKAGE_TOOLS, ...(manifest.packages.some(pkg => pkg.name === 'pi-browser') ? BROWSER_TOOLS : []),
          ...(manifest.packages.some(pkg => pkg.name === 'pi-mcp') ? ['mcp', 'mcpScript'] : [])],
      };
    }));
    results.push(await check('runtime:supplemental-tool-execution', async () => {
      supplementalState = await loadSupplementalExtensions({ releasePath, developmentPath, manifest, work: temp });
      assert(supplementalState.loaded.errors.length === 0, supplementalState.loaded.errors.map(item => item.error).join('; '));
      await exerciseTools(supplementalState.loaded, manifest);
      return supplementalState.supplemental;
    }));
    results.push(await check('runtime:process-only', async () => {
      await exerciseProcessSurface({ releasePath, developmentPath, manifest, work: temp });
      return { mode: 'release-source-process-only' };
    }));
    results.push(await check('runtime:rpc', async () => {
      assert(rpcEvidence, 'Official Pi RPC loader check did not complete');
      assertRpcEvidence(rpcEvidence, releasePath, sessionDir, manifest);
      return { mode: 'official-cli-rpc', modelInvocations: 0 };
    }));
    const hostEvidence = host && {
      package: host.package,
      version: host.version,
      packageSha256: host.packageSha256,
      executableSha256: host.executableSha256,
      cliSha256: host.cliSha256,
      cliRelative: path.relative(host.packageRoot, host.cli).replaceAll('\\', '/'),
    };
    return {
      host: hostEvidence,
      loader: loaderEvidence,
      supplemental: supplementalState?.supplemental,
      runner: { name: 'scripts/runtime-smoke.mjs', sha256: digestFile(fileURLToPath(import.meta.url)) },
      results,
    };
  } finally {
    process.chdir(originalCwd);
    for (const key of Object.keys(process.env)) delete process.env[key];
    Object.assign(process.env, originalEnv);
    fs.rmSync(root, { recursive: true, force: true });
  }
}

export async function runInstalledHostSmoke({ releasePath, manifest, parentEnv = process.env }) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-config-installed-host-smoke-'));
  const home = path.join(root, 'home');
  const agentDir = path.join(root, 'agent');
  const cwd = path.join(root, 'cwd');
  const sessionDir = path.join(root, 'sessions');
  const temp = path.join(root, 'tmp');
  for (const folder of [home, agentDir, cwd, sessionDir, temp]) fs.mkdirSync(folder, { recursive: true });
  copyReleasePrompts(releasePath, agentDir, manifest);
  const env = runtimeEnvironment(parentEnv, { agentDir, home, temp, cwd });
  try {
    const host = identifyInstalledPiHost(manifest.piVersion, { env });
    const evidence = runRpc({ releasePath, manifest, host, env, agentDir, sessionDir, cwd, temp });
    assertOfficialLoaderEvidence(evidence, releasePath, manifest);
    assertRpcEvidence(evidence, releasePath, sessionDir, manifest);
    return {
      status: 'passed',
      mode: 'installed-host-official-cli-rpc',
      modelInvocations: 0,
      host: {
        package: host.package,
        version: host.version,
        packageSha256: host.packageSha256,
        executableSha256: host.executableSha256,
        cliSha256: host.cliSha256,
        cliRelative: path.relative(host.packageRoot, host.cli).replaceAll('\\', '/'),
      },
      registeredPackageTools: [...PACKAGE_TOOLS, ...(manifest.packages.some(pkg => pkg.name === 'pi-browser') ? BROWSER_TOOLS : []),
        ...(manifest.packages.some(pkg => pkg.name === 'pi-mcp') ? ['mcp', 'mcpScript'] : [])],
      registeredPackageCommands: [...PACKAGE_COMMANDS, ...(manifest.packages.some(pkg => pkg.name === 'pi-browser') ? ['browser'] : []),
        ...(manifest.packages.some(pkg => pkg.name === 'pi-mcp') ? ['mcp', 'pi-mcp', 'mcp-auth'] : []),
        ...(manifest.packages.some(pkg => pkg.name === 'pi-subscription-usage') ? ['subscription-refresh'] : [])],
      runnerSha256: digestFile(fileURLToPath(import.meta.url)),
    };
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

async function main(argv = process.argv.slice(2)) {
  if (argv[0] === '--installed-host') {
    if (argv.length !== 2) throw new Error('Usage: node runtime-smoke.mjs --installed-host <release-path>');
    const releasePath = path.resolve(argv[1]);
    const manifest = JSON.parse(fs.readFileSync(path.join(releasePath, 'release.json'), 'utf8'));
    process.stdout.write(JSON.stringify(await runInstalledHostSmoke({ releasePath, manifest })));
    return;
  }
  const [releasePath, developmentPath] = argv;
  if (!releasePath || !developmentPath || argv.length !== 2) throw new Error('Usage: node runtime-smoke.mjs <release-path> <development-path>');
  const manifest = JSON.parse(fs.readFileSync(path.join(releasePath, 'release.json'), 'utf8'));
  const report = await runRuntimeSmoke({ releasePath: path.resolve(releasePath), developmentPath: path.resolve(developmentPath), manifest });
  process.stdout.write(JSON.stringify(report));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error?.stack ?? error); process.exitCode = 1; });
}
