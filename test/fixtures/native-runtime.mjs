import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import tls from 'node:tls';
import http from 'node:http';
import https from 'node:https';
import { syncBuiltinESMExports } from 'node:module';
import { pathToFileURL } from 'node:url';
import { resolvePiHostDependency } from '../../scripts/runtime-smoke.mjs';

const [host, repo] = process.argv.slice(2);
const attemptedFetches = [];
globalThis.fetch = async url => {
  attemptedFetches.push(String(url));
  throw new TypeError('fetch failed');
};
let networkAttempts = 0;
const forbidden = () => { networkAttempts++; throw new Error('NETWORK_DISABLED'); };
net.connect = net.createConnection = tls.connect = http.request = https.request = forbidden;
syncBuiltinESMExports();
const sdk = await import(pathToFileURL(path.join(host, 'dist/index.js')));
const { createAssistantMessageEventStream } = await import(pathToFileURL(path.join(resolvePiHostDependency({ cli: path.join(host, 'dist/cli.js') }, '@earendil-works/pi-ai'), 'dist/index.js')));
const settings = JSON.parse(fs.readFileSync(path.join(repo, 'config/pi.settings.json')));
const webTools = ['web_search', 'source_check', 'fetch_content', 'get_search_content'];
const text = message => message.content.filter(item => item.type === 'text').map(item => item.text).join('\n');
const reports = [];
for (const decision of ['headless', 'Continue', 'Decline', 'cancel']) {
  const agentDir = path.join(process.env.PI_CODING_AGENT_DIR, decision);
  fs.mkdirSync(agentDir, { recursive: true });
  const log = path.join(agentDir, 'fake-calls.jsonl');
  fs.writeFileSync(log, '');
  fs.writeFileSync(path.join(agentDir, 'settings.json'), JSON.stringify({
    ...settings, defaultProvider: 'native-fixture', defaultModel: 'fixture',
    packages: settings.packages.map(spec => path.join(repo, 'native/node_modules', spec.slice(4, spec.lastIndexOf('@')))),
  }));
  fs.writeFileSync(path.join(agentDir, 'web-search.json'), JSON.stringify({
    ...JSON.parse(fs.readFileSync(path.join(repo, 'config/web-search.json'))), toolActivation: 'dynamic',
  }));
  fs.writeFileSync(path.join(agentDir, 'mcp-adapter.json'), JSON.stringify({
    mcpServers: { fixture: { command: process.execPath, args: [path.join(repo, 'test/fixtures/native-mcp-server.mjs'), log], lifecycle: 'lazy-keep-alive', inheritEnv: false, requestTimeoutMs: 5000 } },
    settings: { mcpFooterStatus: 'off', semanticSearch: false, autoAuth: false },
  }));
  process.env.PI_CODING_AGENT_DIR = agentDir;
  let pi, requests = 0, dialogs = 0;
  const errors = [], nested = [];
  const loader = new sdk.DefaultResourceLoader({
    cwd: process.cwd(), agentDir, noSkills: true, noPromptTemplates: true, noThemes: true, noContextFiles: true,
    extensionFactories: [sdk.createCodemodeExtension(), sdk.createToolSearchExtension(), api => {
      pi = api;
      api.on('tool_call', event => { if (event.parentToolCallId) nested.push(event.toolName); });
      api.registerProvider('native-fixture', {
        baseUrl: 'https://invalid.example', apiKey: 'offline-fixture', api: 'native-fixture',
        models: [{ id: 'fixture', name: 'fixture', reasoning: false, input: ['text'], contextWindow: 200000, maxTokens: 1024,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } }],
        streamSimple(model, context) {
          const stream = createAssistantMessageEventStream();
          const results = context.messages.filter(message => message.role === 'toolResult');
          const step = ++requests;
          assert(step <= 5, 'unexpected model loop');
          let content;
          if (step === 1) {
            assert(pi.getActiveTools().includes('codemode'), 'codemode must be explicitly enabled for adapter');
            assert(pi.getActiveTools().includes('web_enable'), 'web activation must be deferred');
            for (const name of webTools) assert(!pi.getActiveTools().includes(name));
            content = [{ type: 'toolCall', id: 'connect', name: 'mcp', arguments: { connect: 'fixture' } }];
          } else if (step === 2) {
            assert(!results.at(-1).isError, text(results.at(-1)));
            const deferred = pi.getAllTools().find(tool => tool.name === 'mcp__fixture__execute');
            assert.equal(deferred?.exposure, 'deferred');
            assert(!pi.getActiveTools().includes(deferred.name));
            content = [{ type: 'toolCall', id: 'approval', name: 'codemode', arguments: { code: 'const result = await tools.mcp__fixture__execute({}); text(result);' } }];
          } else if (step === 3) {
            const output = text(results.at(-1));
            assert(!output.includes('FIXTURE_PRIVATE_PAUSE_ID'), 'pause ID leaked to model');
            if (decision === 'headless') assert.match(output, /interactive Pi session/);
            else assert.match(output, /FAKE_EXECUTOR_FINISHED/);
            content = [{ type: 'toolCall', id: 'model-resume', name: 'codemode', arguments: {
              code: 'text(await tools.mcp__fixture__resume({requestId: "MODEL_GUESSED_ID", response: {action: "accept"}}));',
            } }];
          } else if (step === 4) {
            assert.match(text(results.at(-1)), /do not call `resume`/);
            content = [{ type: 'toolCall', id: 'enable-web', name: 'web_enable', arguments: {} }];
          } else {
            for (const name of webTools) assert(pi.getActiveTools().includes(name), name);
            assert(!results.at(-1).isError);
            content = [{ type: 'text', text: 'NATIVE_RUNTIME_OK' }];
          }
          const message = { role: 'assistant', content, api: model.api, provider: model.provider, model: model.id,
            stopReason: step === 5 ? 'stop' : 'toolUse', timestamp: Date.now(), usage: { input: 1, output: 1, cacheRead: 0,
              cacheWrite: 0, totalTokens: 2, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } } };
          stream.push({ type: 'start', partial: message });
          stream.push({ type: 'done', reason: message.stopReason, message });
          stream.end();
          return stream;
        },
      });
    }],
  });
  await loader.reload();
  assert.deepEqual(loader.getExtensions().errors, []);
  const { session } = await sdk.createAgentSession({ cwd: process.cwd(), agentDir, resourceLoader: loader,
    sessionManager: sdk.SessionManager.inMemory(process.cwd()) });
  try {
    const uiContext = decision === 'headless' ? undefined : {
      select: async (title, choices) => {
        assert.match(title, /MCP Input Request/);
        assert.deepEqual(choices, ['Continue', 'Decline']);
        dialogs++;
        return decision === 'cancel' ? undefined : decision;
      },
      notify() {}, setStatus() {}, setWidget() {},
    };
    await session.bindExtensions({ mode: decision === 'headless' ? 'print' : 'rpc', uiContext, onError: error => errors.push(error) });
    await session.setModel(session.modelRuntime.getModel('native-fixture', 'fixture'));
    assert(!pi.getAllTools().some(tool => tool.name === 'mcpScript'));
    const commands = pi.getCommands().map(command => command.name);
    for (const name of ['mcp', 'mcp-adapter', 'mcp-auth', 'ollama-refresh', 'ollama-status', 'ollama-info', 'ollama-warm-up']) assert(commands.includes(name), name);
    await session.prompt('Run the synthetic native migration regression.');
    assert.equal(session.getLastAssistantText(), 'NATIVE_RUNTIME_OK', JSON.stringify(session.messages.filter(message => message.role !== 'system')));
    assert.deepEqual(errors, []);
    assert(nested.includes('mcp__fixture__execute') && nested.includes('mcp__fixture__resume'));
    const calls = fs.readFileSync(log, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
    assert.deepEqual(calls.map(call => call.name), decision === 'headless' ? ['execute'] : ['execute', 'resume']);
    assert.equal(dialogs, decision === 'headless' ? 0 : 1);
    if (decision !== 'headless') assert.deepEqual(calls[1].arguments, { requestId: 'FIXTURE_PRIVATE_PAUSE_ID', response: {
      action: decision === 'Continue' ? 'accept' : decision === 'Decline' ? 'decline' : 'cancel',
    } });
    reports.push({ decision, requests, dialogs, calls: calls.map(call => call.name) });
  } finally {
    await session.extensionRunner.emit({ type: 'session_shutdown', reason: 'quit' });
    session.dispose();
  }
}
assert.equal(networkAttempts, 0);
assert(attemptedFetches.every(url => url === 'http://127.0.0.1:1/api/tags'), JSON.stringify(attemptedFetches));
console.log(JSON.stringify({ piVersion: '1.5.0', networkAttempts, blockedOllamaDiscovery: attemptedFetches.length, reports }));
