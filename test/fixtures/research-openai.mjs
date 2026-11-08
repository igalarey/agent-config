import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import cp from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { pathToFileURL } from 'node:url';

const [loaderFile, provider, configSource] = process.argv.slice(2);
const agentDir = process.env.PI_CODING_AGENT_DIR;
const configFile = path.join(agentDir, 'web-search.json');
fs.copyFileSync(configSource, configFile);
const unchanged = fs.readFileSync(configFile, 'utf8');
let sockets = 0, processes = 0, requests = 0, authCalls = 0;
net.Socket.prototype.connect = function () { sockets++; throw Error('Network forbidden'); };
for (const key of ['spawn', 'spawnSync', 'exec', 'execSync', 'execFile', 'execFileSync']) {
  cp[key] = () => { processes++; throw Error('Processes forbidden'); };
}
syncBuiltinESMExports();
const { loadExtensions } = await import(pathToFileURL(loaderFile));
const model = { provider: 'openai', id: 'active-child-model', baseUrl: 'https://api.openai.com/v1', api: 'openai-responses' };
let auth = { ok: true, apiKey: 'synthetic-native-auth', headers: { 'X-Fixture': 'native' } };
const ctx = {
  hasUI: false, model, sessionManager: { getBranch: () => [] }, ui: {},
  modelRegistry: {
    getAll() { throw Error('Full model inventory must never be read'); },
    getAvailable() { throw Error('Available model inventory must never be read'); },
    async getApiKeyAndHeaders(selected) { assert.equal(selected, ctx.model); authCalls++; return auth; },
    isUsingOAuth(selected) { assert.equal(selected, ctx.model); return true; },
  },
};
globalThis.fetch = async (input, init) => {
  assert.equal(String(input), 'https://api.openai.com/v1/responses');
  const headers = new Headers(init.headers);
  assert.equal(headers.get('Authorization'), 'Bearer synthetic-native-auth');
  const body = JSON.parse(init.body);
  assert.equal(body.model, ctx.model.id);
  assert.equal(body.tools[0].type, 'web_search');
  requests++;
  return new Response(JSON.stringify({ output: [
    { type: 'web_search_call', action: { sources: [{ type: 'url', url: 'https://example.org/evidence', title: 'Local evidence' }] } },
    { type: 'message', content: [{ type: 'output_text', text: 'Native active-model evidence', annotations: [] }] },
  ] }), { headers: { 'content-type': 'application/json' } });
};
const loaded = await loadExtensions([provider], process.cwd());
assert.deepEqual(loaded.errors, []);
const ext = loaded.extensions[0];
let active = [...ext.tools.keys(), 'ask_question', 'subagent_done', 'independent_tool'];
loaded.runtime.getActiveTools = () => active;
loaded.runtime.setActiveTools = names => { active = names; };
loaded.runtime.getAllTools = () => active.map(name => ({ name }));
loaded.runtime.appendEntry = () => {};
for (const hook of ext.handlers.get('session_start') ?? []) await hook({}, ctx);
const invoke = (name, args, context = ctx) => ext.tools.get(name).definition.execute('native', args, undefined, undefined, context);
for (const [name, args] of [['web_search', { query: 'synthetic' }], ['source_check', { claim: 'synthetic' }]]) {
  const result = await invoke(name, args);
  assert.ok(!result.isError, JSON.stringify(result));
  assert.match(JSON.stringify(result), /Native active-model evidence/);
}
assert.equal(requests, 2);
assert.equal(authCalls, 2, 'one exact native identity auth resolution per execution');
for (const name of ['ask_question', 'subagent_done', 'independent_tool']) assert.ok(active.includes(name));
const before = requests;
for (const bad of [undefined, { ...model, provider: 'openai-codex' }, { ...model, provider: 'gateway' },
  { ...model, baseUrl: 'https://gateway.example/v1' }, { ...model, baseUrl: 'https://api.openai.com.evil.example/v1' },
  { ...model, baseUrl: 'https://api.openai.com/v1?secret=x' }, { ...model, baseUrl: undefined }]) {
  const calls = authCalls;
  await assert.rejects(() => invoke('web_search', { query: 'denied' }, { ...ctx, model: bad }), /Research.*OpenAI/i);
  assert.equal(authCalls, calls, 'bad model rejected before auth access');
}
for (const bad of [{ ok: false }, { ok: true }, { ok: true, apiKey: '' },
  { ok: true, apiKey: 'synthetic-native-auth', baseUrl: 'https://gateway.example/v1' }]) {
  auth = bad;
  await assert.rejects(() => invoke('source_check', { claim: 'denied' }), /Research.*OpenAI/i);
}
auth = { ok: true, apiKey: 'synthetic-native-auth' };
await assert.rejects(() => invoke('web_search', { query: 'denied' }, { ...ctx, modelRegistry: undefined }), /Research.*OpenAI/i);
for (const args of [{ query: 'denied', model: 'other' }, { query: 'denied', provider: 'openai-codex' }]) {
  const calls = authCalls;
  await assert.rejects(() => invoke('web_search', args), /Research/i);
  assert.equal(authCalls, calls, 'invalid arguments rejected before auth access');
}
process.env.OPENAI_API_KEY = 'synthetic-fallback-forbidden';
await assert.rejects(() => invoke('web_search', { query: 'denied' }), /Research.*OpenAI/i);
delete process.env.OPENAI_API_KEY;
assert.equal(requests, before);
assert.equal(sockets, 0);
assert.equal(processes, 0);
assert.equal(fs.readFileSync(configFile, 'utf8'), unchanged);
for (const hook of ext.handlers.get('session_shutdown') ?? []) await hook({}, ctx);
console.log('SDK native OpenAI active-model search/source_check and auth/endpoint denials passed');
