import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { scopedInputs, validateNativeExport } from './scoped-inputs.mjs';
import { identifyInstalledPiHost, resolvePiHostDependency, runtimeEnvironment } from '../../scripts/runtime-smoke.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const fields = file => Object.fromEntries(fs.readFileSync(file, 'utf8').split('---')[1].trim().split('\n').map(line => {
  const colon = line.indexOf(':'); return [line.slice(0, colon), line.slice(colon + 1).trim()];
}));
test('combined canonical scoped children use actual providers and frozen native permissions through project-worker', { timeout: 180000 }, t => {
  const work = fs.mkdtempSync(path.join(root, '.scoped-check-'));
  t.after(() => fs.rmSync(work, { recursive: true, force: true }));
  const inputs = scopedInputs(process.env, { exportDirectory: path.join(work, 'native-export') });
  const harness = inputs.harness;
  t.diagnostic(JSON.stringify({ mode: inputs.mode, ...inputs.provenance, native: inputs.native, browser: inputs.browser, bridge: inputs.bridge, upstream: inputs.upstream }));
  const home = path.join(work, 'home'), agentDir = path.join(home, '.pi/agent'), temp = path.join(work, 'tmp');
  for (const dir of [agentDir, temp]) fs.mkdirSync(dir, { recursive: true });
  const env = runtimeEnvironment(process.env, { home, agentDir, temp, cwd: home });
  delete env.NODE_TEST_CONTEXT;
  const host = identifyInstalledPiHost('1.5.0', { env });
  env.PI_TEST_HOST_ROOT = host.packageRoot;
  env.PI_TEST_INTERACTIVE_ROOT = inputs.native;
  env.PI_TEST_FAUX = path.join(resolvePiHostDependency(host, '@earendil-works/pi-ai'), 'dist/providers/faux.js');
  env.PI_SUBAGENT_SURFACE_BACKEND = 'process';
  const copy = (source, dest) => fs.cpSync(source, dest, { recursive: true, filter: p => !p.split(path.sep).some(s => s === 'node_modules' || s === '.git') });
  const coordinator = path.join(work, 'coordinator');
  for (const file of inputs.coordinatorFiles) copy(path.join(inputs.coordinator, file), path.join(coordinator, file));
  // Repository-local temporary homes must not inherit the enclosing Git root or the real home's ancestor skills.
  fs.writeFileSync(path.join(temp, '.git'), 'gitdir: ' + path.join(work, 'absent-git') + '\n');
  const coordinatorProvider = path.join(coordinator, 'test/fixtures/interactive-provider.mjs');
  fs.writeFileSync(coordinatorProvider, fs.readFileSync(coordinatorProvider, 'utf8').replace('export default async function provider(pi) {',
    "export default async function provider(pi) {\n  pi.on('project_trust', () => ({ trusted: 'no' }));"));
  let browser = inputs.browser, bridge = inputs.bridge;
  if (inputs.mode === 'source') {
    browser = path.join(work, 'browser'); copy(inputs.browser, browser);
    const link = (name, target) => { const dest = path.join(browser, 'node_modules', name); fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.symlinkSync(target, dest, 'dir'); };
    for (const name of ['playwright-core', 'ipaddr.js']) link(name, path.join(inputs.browserDependencies, name));
    link('typebox', resolvePiHostDependency(host, 'typebox'));
    bridge = path.join(work, 'bridge/extensions/research-tools/index.ts'); copy(path.dirname(inputs.bridge), path.dirname(bridge));
  }
  fs.mkdirSync(path.join(agentDir, 'extensions'), { recursive: true });
  fs.writeFileSync(path.join(agentDir, 'extensions/ambient.js'), `export default function(pi) {
    if (process.env.PI_SUBAGENT_AGENT) throw new Error('Ambient extension loaded in child');
    for (const name of ['mcp_ambient_probe', 'memory_ambient_probe', 'learning_ambient_probe'])
      pi.registerTool({ name, label: name, description: name, parameters: { type: 'object', properties: {} }, execute: async () => { throw Error('Ambient tool executed'); } });
  }`);
  const contracts = {};
  for (const role of ['scout', 'worker', 'reviewer', 'oracle', 'researcher', 'evidence-auditor', 'delegate', 'ui-verifier', 'project-worker']) {
    const file = path.join(role === 'project-worker' ? coordinator : harness, 'agents', role + '.md');
    contracts[role] = fields(file);
    const dest = path.join(agentDir, 'agents', role + '.md'); fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.copyFileSync(file, dest);
  }
  copy(path.join(harness, 'pi-skills'), path.join(agentDir, 'skills'));
  fs.mkdirSync(path.join(agentDir, 'skills/ambient'), { recursive: true });
  fs.writeFileSync(path.join(agentDir, 'skills/ambient/SKILL.md'), '---\nname: ambient\ndescription: AMBIENT_SKILL\n---\nAmbient body');
  fs.writeFileSync(path.join(home, 'contracts.json'), JSON.stringify(contracts));
  const repo = path.join(home, 'repo'); fs.mkdirSync(path.join(repo, '.pi/skills/diagnose-root'), { recursive: true });
  assert.equal(spawnSync('git', ['init', '-q', repo], { env }).status, 0);
  fs.writeFileSync(path.join(repo, 'AGENTS.md'), 'Bounded synthetic fixture repository.');
  fs.writeFileSync(path.join(repo, '.pi/skills/diagnose-root/SKILL.md'), '---\nname: diagnose-root\ndescription: MALICIOUS_CWD_SKILL\n---\nUntrusted body');
  fs.mkdirSync(path.join(agentDir, 'npm/node_modules'), { recursive: true });
  fs.writeFileSync(path.join(agentDir, 'npm/package.json'), JSON.stringify({ dependencies: { 'pi-web-access': JSON.parse(fs.readFileSync(path.join(harness, 'native/package.json'))).dependencies['pi-web-access'] } }));
  fs.symlinkSync(inputs.upstream, path.join(agentDir, 'npm/node_modules/pi-web-access'), 'dir');
  fs.writeFileSync(path.join(agentDir, 'web-search.json'), JSON.stringify({ ...JSON.parse(fs.readFileSync(path.join(harness, 'config/web-search.json'))), searchProvider: 'brave', braveApiKey: 'synthetic-key' }));
  fs.copyFileSync(path.join(harness, 'config/subagents.json'), path.join(agentDir, 'subagents.json'));
  fs.writeFileSync(path.join(agentDir, 'settings.json'), JSON.stringify({ defaultProvider: 'project-faux', defaultModel: 'inherited', defaultProjectTrust: 'no', packages: [] }));
  const run = spawnSync(process.execPath, ['--import', path.join(coordinator, 'test/fixtures/offline.mjs'), path.join(root, 'test/fixtures/scoped-host.mjs'), host.packageRoot, env.PI_TEST_INTERACTIVE_ROOT, coordinator, browser, bridge], {
    cwd: home, env, encoding: 'utf8', timeout: 110000, maxBuffer: 8 * 1024 * 1024,
  });
  const logs = run.status ? fs.readdirSync(work, { recursive: true }).filter(p => p.endsWith('.log')).map(p => p + '\n' + fs.readFileSync(path.join(work, p), 'utf8').slice(-6000)).join('\n') : '';
  assert.equal(run.status, 0, `${run.error ?? ''}\n${run.stderr}\n${run.stdout}\n${logs}`);
  assert.match(run.stdout, /COMBINED_SCOPED_OK/); t.diagnostic(run.stdout.trim());
  const suite = spawnSync(process.execPath, ['--test', ...fs.readdirSync(path.join(coordinator, 'test')).filter(n => n.endsWith('.test.mjs')).map(n => path.join(coordinator, 'test', n))], {
    cwd: coordinator, env, encoding: 'utf8', timeout: 110000, maxBuffer: 8 * 1024 * 1024,
  });
  assert.equal(suite.status, 0, `${suite.error ?? ''}\n${suite.stderr}\n${suite.stdout}`);
  assert.match(suite.stdout, /# pass 37/); t.diagnostic(suite.stdout.slice(-180));
  if (inputs.mode === 'source' && inputs.provenance) validateNativeExport(path.join(work, 'native-export'));
});
