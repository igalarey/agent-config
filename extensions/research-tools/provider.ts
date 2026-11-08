import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { NAMES, SCHEMAS, argumentsFor, policy, readObject, refuse, scope } from './policy.mjs';

function dependency(agentDir) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  const candidate = path.join(root, 'native');
  const prefix = fs.existsSync(path.join(candidate, 'package.json')) ? candidate : path.join(agentDir, 'npm');
  const expected = readObject(path.join(prefix, 'package.json'), 'pi-web-access dependency contract').dependencies?.['pi-web-access'];
  const directory = path.join(prefix, 'node_modules/pi-web-access');
  const meta = readObject(path.join(directory, 'package.json'), 'pi-web-access dependency');
  if (!/^\d+\.\d+\.\d+$/.test(expected ?? '') || meta.name !== 'pi-web-access' || meta.version !== expected
    || JSON.stringify(meta.pi?.extensions) !== '["./dist"]') refuse('pi-web-access pinned entrypoint');
  const entry = path.join(directory, 'dist/index.js');
  if (!fs.existsSync(entry)) refuse('pi-web-access dist entrypoint');
  return fs.realpathSync(entry);
}
const noop = () => {};
function context(ctx) {
  return {
    hasUI: false, mode: 'print',
    sessionManager: { getBranch: () => ctx?.sessionManager?.getBranch?.() ?? [] },
    ui: { setWidget: noop, setStatus: noop, notify: noop },
  };
}
async function nativeOpenAIContext(ctx) {
  const model = ctx?.model;
  const registry = ctx?.modelRegistry;
  const official = value => typeof value === 'string' && /^https:\/\/api\.openai\.com\/v1\/?$/.test(value);
  if (!model || model.provider !== 'openai' || typeof model.id !== 'string' || !model.id
    || !official(model.baseUrl) || typeof registry?.getApiKeyAndHeaders !== 'function'
    || typeof registry?.isUsingOAuth !== 'function') refuse('native OpenAI model/auth');
  if (['OPENAI_API_KEY', 'OPENAI_BASE_URL', 'OPENAI_API_BASE', 'OPENAI_RESPONSES_URL'].some(key => process.env[key])) {
    refuse('native OpenAI standalone auth/endpoint fallback');
  }
  const id = model.id, baseUrl = model.baseUrl;
  const exact = selected => {
    if (selected !== model || ctx.model !== model || model.provider !== 'openai'
      || model.id !== id || model.baseUrl !== baseUrl) refuse('native OpenAI model identity');
  };
  let resolved;
  try { resolved = await registry.getApiKeyAndHeaders(model); }
  catch { refuse('native OpenAI authentication'); }
  exact(model);
  if (resolved?.ok !== true || typeof resolved.apiKey !== 'string' || !resolved.apiKey
    || !official(resolved.baseUrl ?? baseUrl)) refuse('native OpenAI authentication/endpoint');
  const auth = Object.freeze({ ok: true, apiKey: resolved.apiKey, baseUrl: resolved.baseUrl ?? baseUrl,
    headers: Object.freeze({ ...resolved.headers }) });
  return {
    ...context(ctx), model,
    modelRegistry: Object.freeze({
      getAll: () => { exact(model); return [model]; },
      getAvailable: () => { exact(model); return [model]; },
      getApiKeyAndHeaders: async selected => { exact(selected); return auth; },
      isUsingOAuth(selected) {
        exact(selected);
        try { return registry.isUsingOAuth(model); }
        catch { refuse('native OpenAI OAuth status'); }
      },
    }),
  };
}
const EVENTS = new Set(['session_start', 'session_tree', 'session_shutdown', 'before_agent_start', 'agent_settled', 'tool_call']);
const DESCRIPTIONS = {
  web_search: 'Search using the configured provider or active native OpenAI model, without summaries or automatic fetching.',
  fetch_content: 'Fetch public HTTP pages as readable or raw content.',
  get_search_content: 'Retrieve bounded stored research content.',
  source_check: 'Gather search evidence about a claim without automatic page fetching.',
};
export default async function researchProvider(pi: import("@earendil-works/pi-coding-agent").ExtensionAPI) {
  const initial = scope();
  const initialPolicy = policy(initial.agentDir);
  const registered = new Set();
  const check = name => {
    const current = scope();
    if (current.session !== initial.session || current.agent !== initial.agent || current.agentDir !== initial.agentDir
      || name && (!initial.names.includes(name) || !current.names.includes(name))) refuse('saved child scope changed');
    const effective = policy(initial.agentDir);
    if (effective.fingerprint !== initialPolicy.fingerprint) refuse('personal policy changed; restart child');
    return current;
  };
  const scopedNames = () => check().names.filter(name => initial.names.includes(name));
  const facade = Object.freeze({
    registerTool(tool) {
      const allowed = scopedNames();
      if (!allowed.includes(tool.name)) return;
      if (typeof tool.execute !== 'function') refuse(`${tool.name} implementation`);
      pi.registerTool({
        name: tool.name, label: tool.label, description: DESCRIPTIONS[tool.name],
        parameters: SCHEMAS[tool.name], exposure: 'direct', defaultActive: true,
        async execute(id, args, signal, update, ctx) {
          check(tool.name);
          const forwarded = argumentsFor(tool.name, args, initialPolicy.config);
          const native = !initialPolicy.config.searchProvider && ['web_search', 'source_check'].includes(tool.name);
          const restricted = native ? await nativeOpenAIContext(ctx) : context(ctx);
          check(tool.name);
          return tool.execute(id, forwarded, signal, update, restricted);
        },
      });
      registered.add(tool.name);
    },
    on(event, handler) {
      if (!EVENTS.has(event)) return noop;
      return pi.on(event, async (value, ctx) => {
        check();
        if (event === 'tool_call' && !scopedNames().includes(value.toolName)) return;
        return handler(value, context(ctx));
      });
    },
    getAllTools: () => pi.getAllTools().filter(tool => registered.has(tool.name) && scopedNames().includes(tool.name)),
    getActiveTools: () => pi.getActiveTools().filter(name => registered.has(name) && scopedNames().includes(name)),
    setActiveTools(names) {
      const allowed = scopedNames();
      const saved = check().tools;
      const others = pi.getActiveTools().filter(name => !NAMES.includes(name) && saved.includes(name));
      pi.setActiveTools([...others, ...new Set(names.filter(name => registered.has(name) && allowed.includes(name)))]);
    },
    registerCommand: noop,
    registerShortcut: noop,
    appendEntry(type, data) {
      check();
      if (type === 'web-search-results') pi.appendEntry(type, data);
    },
    sendMessage: noop,
  });
  const entry = dependency(initial.agentDir);
  let upstream;
  try { upstream = await import(pathToFileURL(entry).href); }
  catch { refuse('pi-web-access import dependencies'); }
  check();
  if (typeof upstream.default !== 'function') refuse('pi-web-access factory');
  await upstream.default(facade);
  for (const name of initial.names) if (!registered.has(name)) refuse(`${name} upstream registration`);
}
