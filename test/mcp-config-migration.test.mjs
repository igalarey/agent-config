import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { planMcpConfigMigration } from '../scripts/mcp-config-migration.mjs';
import { identifyInstalledPiHost, resolvePiHostDependency, runtimeEnvironment } from '../scripts/runtime-smoke.mjs';

const repo = fileURLToPath(new URL('../', import.meta.url));
const defaults = { settings: { mcpFooterStatus: 'off' } };
test('migration preserves opaque values, fills only missing defaults, and never mutates inputs', () => {
  const legacyConfig = { settings: { mcpFooterStatus: 'full', custom: 1 }, futureKey: { opaque: true }, imports: ['cursor'] };
  const before = structuredClone(legacyConfig);
  const plan = planMcpConfigMigration({ legacyConfig, defaults });
  assert.equal(plan.action, 'create');
  assert.deepEqual(plan.content, before);
  assert.deepEqual(legacyConfig, before);
  assert.deepEqual(planMcpConfigMigration({ defaults }).content, defaults);
  assert.deepEqual(planMcpConfigMigration({ legacyConfig: { imports: ['cursor'] }, defaults }).content,
    { imports: ['cursor'], ...defaults });
});
test('existing adapter destination is adopted only when legacy values already match', () => {
  const legacyConfig = { settings: { autoAuth: false }, imports: ['cursor'], mcpServers: { local: { command: 'fake', env: { TOKEN: 'FAKE_SECRET' } } } };
  const adapterConfig = { ...structuredClone(legacyConfig), unrelated: true };
  assert.equal(planMcpConfigMigration({ legacyConfig, adapterConfig, defaults }).action, 'adopt');
  assert.deepEqual(planMcpConfigMigration({ legacyConfig, adapterConfig, defaults }).content, adapterConfig);
  for (const destination of [{}, { ...adapterConfig, imports: ['codex'] }, { ...adapterConfig, settings: { autoAuth: true } }]) {
    const result = planMcpConfigMigration({ legacyConfig, adapterConfig: destination, defaults });
    assert.equal(result.action, 'conflict');
    assert.equal(result.content, undefined);
    assert(!JSON.stringify(result.conflicts).includes('FAKE_SECRET'));
  }
  assert.equal(planMcpConfigMigration({ adapterConfig, defaults }).action, 'adopt');
});
test('invalid shapes and removed settings require explicit resolution', () => {
  for (const legacyConfig of [null, [], { settings: [] }, { imports: 'cursor' }, { mcpServers: [] },
    { settings: { jev: false } }, { settings: { scriptMode: true } }, { settings: { scriptSkill: true } }]) {
    assert.equal(planMcpConfigMigration({ legacyConfig, defaults }).action, 'conflict');
  }
});
test('real adapter 7 loads migrated settings, imports, plugins, scripts and server options once', { timeout: 30000 }, t => {
  if (!fs.existsSync(path.join(repo, 'native/node_modules/pi-mcp-adapter/config.ts'))) {
    assert.notEqual(process.env.PI_NATIVE_REQUIRED, '1');
    return t.skip('native dependencies not prepared');
  }
  const host = identifyInstalledPiHost('1.5.0');
  const jiti = resolvePiHostDependency(host, 'jiti');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-config-migration-'));
  try {
    const home = path.join(root, 'home'), agentDir = path.join(home, '.pi/agent'), cwd = path.join(root, 'cwd'), temp = path.join(root, 'tmp');
    for (const dir of [agentDir, cwd, temp, path.join(home, '.cursor')]) fs.mkdirSync(dir, { recursive: true });
    const legacyConfig = {
      settings: { mcpFooterStatus: 'off', autoAuth: false, semanticSearch: false, hostConfigDiscovery: 'off' },
      scriptTools: { inspect: { description: 'Never executed', file: './inspect.mjs', declare: false } },
      imports: ['cursor'], claudePlugins: [{ path: path.join(root, 'plugin'), mcp: true }],
      mcpServers: { fixture: { command: 'never-execute', env: { TOKEN: 'FAKE_SECRET' }, lifecycle: 'lazy-keep-alive', inheritEnv: false, requestTimeoutMs: 4321, directTools: ['read'], excludeTools: ['delete'], customOption: 'preserved' } },
    };
    fs.mkdirSync(path.join(root, 'plugin'), { recursive: true });
    fs.writeFileSync(path.join(root, 'plugin/.mcp.json'), JSON.stringify({ mcpServers: { plugin: { command: 'never-execute-plugin' } } }));
    fs.writeFileSync(path.join(home, '.cursor/mcp.json'), JSON.stringify({ mcpServers: { imported: { command: 'never-execute-import' } } }));
    const original = JSON.stringify(legacyConfig);
    fs.writeFileSync(path.join(agentDir, 'mcp.json'), original);
    const plan = planMcpConfigMigration({ legacyConfig, defaults });
    assert.equal(plan.action, 'create');
    fs.writeFileSync(path.join(agentDir, 'mcp-adapter.json'), JSON.stringify(plan.content));
    const code = `
      import assert from 'node:assert/strict';
      import { createRequire, syncBuiltinESMExports } from 'node:module';
      import net from 'node:net'; import tls from 'node:tls'; import http from 'node:http'; import https from 'node:https';
      const forbidden = () => { throw new Error('NETWORK_DISABLED'); };
      globalThis.fetch = forbidden; net.connect = net.createConnection = tls.connect = http.request = https.request = forbidden;
      syncBuiltinESMExports();
      const { createJiti } = createRequire(${JSON.stringify(path.join(repo, 'package.json'))})(${JSON.stringify(jiti)});
      const adapter = await createJiti(import.meta.url, { moduleCache: false, alias: { 'typebox/value': ${JSON.stringify(createRequire(path.join(host.packageRoot, 'package.json')).resolve('typebox/value'))} } }).import(${JSON.stringify(path.join(repo, 'native/node_modules/pi-mcp-adapter/config.ts'))});
      adapter.setPiMcpConfigEnabled(true);
      const loaded = adapter.loadMcpConfig(undefined, process.cwd());
      assert.deepEqual(loaded.settings, ${JSON.stringify(legacyConfig.settings)});
      assert.deepEqual(loaded.mcpServers.fixture, ${JSON.stringify(legacyConfig.mcpServers.fixture)});
      assert.deepEqual(Object.keys(loaded.mcpServers).sort(), ['fixture', 'imported', 'plugin']);
      assert.deepEqual(loaded.imports, ['cursor']);
      assert.deepEqual(loaded.scriptTools, { inspect: { description: 'Never executed', file: ${JSON.stringify(path.join(agentDir, 'inspect.mjs'))}, declare: false } });
      assert.deepEqual(loaded.claudePlugins, ${JSON.stringify(legacyConfig.claudePlugins)});
    `;
    const run = spawnSync(process.execPath, ['--input-type=module', '-e', code], { cwd,
      env: { ...runtimeEnvironment(process.env, { home, agentDir, cwd, temp }), JITI_FS_CACHE: path.join(temp, 'jiti') },
      encoding: 'utf8', timeout: 25000 });
    assert.equal(run.status, 0, `${run.error?.message ?? ''}\n${run.stderr}\n${run.stdout}`);
    assert.equal(fs.readFileSync(path.join(agentDir, 'mcp.json'), 'utf8'), original);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
