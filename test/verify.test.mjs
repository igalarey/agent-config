import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { main, planVerification, resolveNpmExecPath, runVerification } from '../scripts/verify.mjs';
import { verificationEnvironment } from '../scripts/verify-env.mjs';
import {
  assertBigpowersResourcePolicy,
  assertOfficialLoaderEvidence,
  assertPromptTemplateRegistrations,
  BIGPOWERS_SKILL_ALLOWLIST,
  HISTORICAL_BIGPOWERS_SKILL_ALLOWLIST,
  identifyInstalledPiHost,
  runtimeEnvironment,
  offlineRuntimeStderr,
} from '../scripts/runtime-smoke.mjs';

test('offline runtime accepts only the expected Ollama discovery notice', () => {
  const expected = '[pi-ollama] Ollama not reachable and no cache available (TypeError: fetch failed). Run /ollama-refresh when Ollama is available.';
  assert.equal(offlineRuntimeStderr(`${expected}\n${expected}\n`), '');
  assert.equal(offlineRuntimeStderr(`${expected}\nUnexpected extension failure\n`), 'Unexpected extension failure');
  assert.equal(offlineRuntimeStderr('[pi-ollama] unknown failure'), '[pi-ollama] unknown failure');
});

function fixture(t) {
  const source = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-config-verify-'));
  t.after(() => fs.rmSync(source, { recursive: true, force: true }));
  fs.mkdirSync(path.join(source, 'manifests'), { recursive: true });
  for (const folder of ['vendor/alpha', 'vendor/beta']) fs.mkdirSync(path.join(source, folder), { recursive: true });
  fs.writeFileSync(path.join(source, 'manifests/packages.json'), JSON.stringify({
    packages: [
      { name: 'alpha', path: 'vendor/alpha' },
      { name: 'beta', path: 'vendor/beta' },
    ],
  }));
  return source;
}

function capture() {
  const lines = [];
  return {
    lines,
    reporter: {
      log: line => lines.push(String(line)),
      error: line => lines.push(String(line)),
    },
  };
}

test('MCP release evidence requires its commands from the official loader inside the candidate', () => {
  const releasePath = path.resolve('fixture-release');
  const sourceInfo = { origin: 'package', path: path.join(releasePath, 'packages/fixture/index.ts') };
  const tools = ['subagent', 'subagents_list', 'subagent_message', 'subagent_cancel', 'ask_user_question', 'web_fetch'];
  const commands = ['subagent', 'subagent-cancel', 'om', 'om:status', 'om:compact', 'om:consolidate'];
  const evidence = { inspect: { success: true }, inspection: {
    allTools: tools.map(name => ({ name, sourceInfo })), activeTools: tools,
    commands: commands.map(name => ({ name, sourceInfo })),
  } };
  assert.doesNotThrow(() => assertOfficialLoaderEvidence(evidence, releasePath, { packages: [] }));
  const missingCancel = structuredClone(evidence);
  missingCancel.inspection.activeTools = tools.filter(name => name !== 'subagent_cancel');
  assert.throws(() => assertOfficialLoaderEvidence(missingCancel, releasePath, { packages: [] }), /subagent_cancel/);
  const manifest = { packages: [{ name: 'pi-mcp' }] };
  assert.throws(() => assertOfficialLoaderEvidence(evidence, releasePath, manifest), /MCP tool missing/);
  evidence.inspection.allTools.push(...['mcp', 'mcpScript'].map(name => ({ name, sourceInfo })));
  evidence.inspection.activeTools.push('mcp', 'mcpScript');
  assert.throws(() => assertOfficialLoaderEvidence(evidence, releasePath, manifest), /MCP command missing/);
  evidence.inspection.commands.push(...['mcp', 'pi-mcp', 'mcp-auth'].map(name => ({ name, sourceInfo })));
  assert.throws(() => assertOfficialLoaderEvidence(evidence, releasePath, manifest), /MCP subagent bridge/);
  evidence.inspection.mcpSubagentBridge = true;
  assert.doesNotThrow(() => assertOfficialLoaderEvidence(evidence, releasePath, manifest));
  evidence.inspection.commands.at(-1).sourceInfo = { origin: 'package', path: path.resolve('outside.ts') };
  assert.throws(() => assertOfficialLoaderEvidence(evidence, releasePath, manifest), /loaded outside release/);
});

test('runtime prompt evidence requires every release-owned template and ignores releases without prompts', () => {
  const prompt = name => ({
    name, source: 'prompt',
    sourceInfo: { source: 'auto', scope: 'user', origin: 'top-level', path: `/isolated/.pi/agent/prompts/${name}.md` },
  });
  const evidence = { commands: { success: true, data: { commands: [
    prompt('review'), prompt('diagnose'), prompt('compare-designs'), prompt('edit-document'),
  ] } } };
  const manifest = { files: ['review', 'diagnose', 'compare-designs', 'edit-document']
    .map(name => ({ path: `prompts/${name}.md` })) };
  assert.doesNotThrow(() => assertPromptTemplateRegistrations(evidence, manifest));
  evidence.commands.data.commands.push({ name: 'using-bigpowers', source: 'prompt', sourceInfo: {
    source: 'package', scope: 'user', origin: 'package', path: '/release/native/node_modules/bigpowers/prompts/using-bigpowers.md',
  } });
  assert.throws(() => assertPromptTemplateRegistrations(evidence, manifest), /prompt template registrations/i);
  evidence.commands.data.commands.pop();
  assert.doesNotThrow(() => assertPromptTemplateRegistrations({}, { files: [] }));
  evidence.commands.data.commands.pop();
  assert.throws(() => assertPromptTemplateRegistrations(evidence, manifest), /prompt template registrations/i);
});

test('runtime policy excludes Bigpowers while retaining historical release checks', t => {
  const releasePath = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-config-bigpowers-policy-'));
  t.after(() => fs.rmSync(releasePath, { recursive: true, force: true }));
  const config = path.join(releasePath, 'config/pi.settings.json');
  fs.mkdirSync(path.dirname(config), { recursive: true });
  const packageRoot = path.join(releasePath, 'native/node_modules/bigpowers');
  const command = name => [name, { sourceInfo: { origin: 'package', path: path.join(packageRoot, name, 'SKILL.md') } }];

  fs.writeFileSync(config, JSON.stringify({ packages: [{ source: 'npm:bigpowers@2.88.6', extensions: [] }] }));
  assert.doesNotThrow(() => assertBigpowersResourcePolicy(new Map([
    command('using-bigpowers'), command('skill:using-bigpowers'),
  ]), releasePath));

  const policy = skills => ({ packages: [{
    source: 'npm:bigpowers@2.88.6', extensions: [], skills, prompts: [],
  }] });
  const commandsFor = skills => new Map(skills.map(skill => command(`skill:${path.posix.basename(skill)}`)));

  fs.writeFileSync(config, JSON.stringify(policy(HISTORICAL_BIGPOWERS_SKILL_ALLOWLIST)));
  assert.doesNotThrow(() => assertBigpowersResourcePolicy(
    commandsFor(HISTORICAL_BIGPOWERS_SKILL_ALLOWLIST), releasePath,
  ));

  fs.writeFileSync(config, fs.readFileSync(new URL('../config/pi.settings.json', import.meta.url)));
  assert.doesNotThrow(() => assertBigpowersResourcePolicy(new Map(), releasePath));
  assert.throws(() => assertBigpowersResourcePolicy(commandsFor(BIGPOWERS_SKILL_ALLOWLIST), releasePath), /Removed Bigpowers resources/);
  fs.writeFileSync(config, JSON.stringify(policy(BIGPOWERS_SKILL_ALLOWLIST)));
  const current = commandsFor(BIGPOWERS_SKILL_ALLOWLIST);
  assert.doesNotThrow(() => assertBigpowersResourcePolicy(current, releasePath));
  current.set(...command('using-bigpowers'));
  assert.throws(() => assertBigpowersResourcePolicy(current, releasePath), /Unexpected Bigpowers commands/);

  const widened = [...BIGPOWERS_SKILL_ALLOWLIST, '.pi/skills/using-bigpowers'];
  fs.writeFileSync(config, JSON.stringify(policy(widened)));
  assert.throws(() => assertBigpowersResourcePolicy(commandsFor(widened), releasePath), /Unexpected Bigpowers skill allowlist/);
});

test('subscription footer requires its refresh command from the official loader inside the release', () => {
  const releasePath = path.resolve('fixture-release');
  const sourceInfo = { origin: 'package', path: path.join(releasePath, 'packages/fixture/index.ts') };
  const tools = ['subagent', 'subagents_list', 'subagent_message', 'subagent_cancel', 'ask_user_question', 'web_fetch'];
  const commands = ['subagent', 'subagent-cancel', 'om', 'om:status', 'om:compact', 'om:consolidate'];
  const evidence = { inspect: { success: true }, inspection: {
    allTools: tools.map(name => ({ name, sourceInfo })), activeTools: tools,
    commands: commands.map(name => ({ name, sourceInfo })),
  } };
  assert.doesNotThrow(() => assertOfficialLoaderEvidence(evidence, releasePath, { packages: [] }));
  const manifest = { packages: [{ name: 'pi-subscription-usage' }] };
  assert.throws(() => assertOfficialLoaderEvidence(evidence, releasePath, manifest), /subscription.*command missing/i);
  evidence.inspection.commands.push({ name: 'subscription-refresh', sourceInfo });
  assert.doesNotThrow(() => assertOfficialLoaderEvidence(evidence, releasePath, manifest));
  evidence.inspection.commands.at(-1).sourceInfo = { origin: 'package', path: path.resolve('outside.ts') };
  assert.throws(() => assertOfficialLoaderEvidence(evidence, releasePath, manifest), /loaded outside release/);
});

test('verification removes ambient MCP configuration and test switches', () => {
  const parent = { PATH: '/fixture', OLLAMA_HOST: 'https://not-contacted.example', OLLAMA_NATIVE_DEBUG_LOG: '/private/log',
    MCP_CONFIG: '/private/config', Mcp_Oauth_Dir: '/private/oauth',
    PI_MCP_ADAPTER_TEST_AUTH_STORE: 'disk', Pi_Mcp_Custom: 'contaminated' };
  for (const env of [verificationEnvironment(parent), runtimeEnvironment(parent, {
    agentDir: '/fixture/agent', home: '/fixture/home', temp: '/fixture/temp',
  })]) {
    assert.equal(env.PATH, '/fixture');
    assert.equal(Object.keys(env).some(key => /^(?:PI_)?MCP_/i.test(key)), false);
    assert.equal(env.OLLAMA_HOST, 'http://127.0.0.1:1');
    assert.equal(env.OLLAMA_NATIVE_DEBUG_LOG, undefined);
  }
});

test('repository default verification covers only root and harness-owned packages', () => {
  assert.deepEqual(planVerification().map(check => check.id), [
    'root', 'pi-ask-user-question', 'pi-browser', 'pi-subscription-usage', '@tintinweb/pi-tasks', 'pi-supervisor',
  ]);
  const { lines, reporter } = capture();
  const exitCode = main({
    argv: [],
    spawn: () => ({ status: 0 }),
    nodePath: '/fixture/node',
    npmExecPath: '/fixture/npm-cli.js',
    env: {},
    reporter,
  });
  assert.equal(exitCode, 0);
  assert.match(lines[0], /Local harness only; external package sources are checked through release verification/);
  assert.match(lines.at(-1), /All 6 checks passed/);
});

test('plans root tests and ordered typecheck/test chains from the package manifest', t => {
  const source = fixture(t);
  const checks = planVerification({ source });
  assert.deepEqual(checks.map(check => ({
    id: check.id,
    cwd: path.relative(source, check.cwd),
    commands: check.commands.map(command => command.args),
  })), [
    { id: 'root', cwd: '', commands: [['test']] },
    { id: 'alpha', cwd: path.join('vendor', 'alpha'), commands: [['run', 'typecheck'], ['test']] },
    { id: 'beta', cwd: path.join('vendor', 'beta'), commands: [['run', 'typecheck'], ['test']] },
  ]);
});

test('continues independent checks and summarizes failures without running a failed package chain further', t => {
  const source = fixture(t);
  const checks = planVerification({ source });
  const calls = [];
  const { lines, reporter } = capture();
  const spawn = (command, args, options) => {
    calls.push({ command, args, options });
    if (options.cwd === source) return { status: 1 };
    if (options.cwd === path.join(source, 'vendor/alpha')) return { status: 2 };
    return { status: 0 };
  };

  const report = runVerification(checks, {
    spawn,
    nodePath: '/fixture/node',
    npmExecPath: '/fixture/npm-cli.js',
    env: { FIXTURE: 'yes', PATH: '/fixture/path', npm_execpath: '/fixture/npm-cli.js', PI_SUBAGENT_AGENT: 'worker', Pi_SubAgent_Allowed: 'scout' },
    reporter,
  });

  assert.deepEqual(calls.map(call => [path.relative(source, call.options.cwd), call.args.slice(1)]), [
    ['', ['test']],
    [path.join('vendor', 'alpha'), ['run', 'typecheck']],
    [path.join('vendor', 'beta'), ['run', 'typecheck']],
    [path.join('vendor', 'beta'), ['test']],
  ]);
  assert.ok(calls.every(call => call.command === '/fixture/node'));
  assert.ok(calls.every(call => call.args[0] === '/fixture/npm-cli.js'));
  assert.ok(calls.every(call => call.options.shell === undefined));
  assert.ok(calls.every(call => call.options.env.npm_config_offline === 'true'));
  assert.ok(calls.every(call => call.options.env.PATH === '/fixture/path' && call.options.env.npm_execpath === '/fixture/npm-cli.js'));
  assert.ok(calls.every(call => !Object.keys(call.options.env).some(key => key.toUpperCase().startsWith('PI_SUBAGENT_'))));
  assert.deepEqual(report.failed.map(item => item.id), ['root', 'alpha']);
  assert.match(lines.join('\n'), /2 of 3 checks failed:/);
  assert.match(lines.join('\n'), /- root tests: npm test \(exit 1\)/);
  assert.match(lines.join('\n'), /- alpha: npm run typecheck \(exit 2\)/);
});

test('maps injected check failures to a nonzero CLI result', t => {
  const source = fixture(t);
  const { reporter } = capture();
  const exitCode = main({
    argv: [],
    source,
    spawn: () => ({ status: 1 }),
    nodePath: '/fixture/node',
    npmExecPath: '/fixture/npm-cli.js',
    env: {},
    reporter,
  });
  assert.equal(exitCode, 1);
});

test('filters contaminated subagent identity without mutating the parent environment object', () => {
  const parent = {
    PATH: '/fixture/path',
    npm_execpath: '/fixture/npm-cli.js',
    PI_SUBAGENT_AGENT: 'worker',
    Pi_SubAgent_Allowed: 'scout,researcher',
    Pi_Subagents_Config: '/real/subagents.json',
    NPM_CONFIG_OFFLINE: 'false',
    Pi_Run_Live_Subagent_Tests: '1',
    Pi_Run_Browser_Tests: '1',
    Pi_Browser_Executable_Path: '/real/browser',
    KEEP: 'yes',
    OPENAI_API_KEY: 'secret',
    HTTPS_PROXY: 'http://proxy.invalid',
    NODE_OPTIONS: '--require=inject.cjs',
  };
  const before = structuredClone(parent);
  const child = verificationEnvironment(parent);
  assert.deepEqual(parent, before);
  assert.equal(child.PATH, parent.PATH);
  assert.equal(child.npm_execpath, parent.npm_execpath);
  assert.equal(child.KEEP, 'yes');
  assert.equal(child.OPENAI_API_KEY, undefined);
  assert.equal(child.HTTPS_PROXY, undefined);
  assert.equal(child.NODE_OPTIONS, undefined);
  assert.equal(Object.keys(child).some(key => key.toUpperCase().startsWith('PI_SUBAGENT_')), false);
  assert.equal(child.Pi_Subagents_Config, undefined);
  assert.equal(child.PI_RUN_LIVE_SUBAGENT_TESTS, '0');
  assert.equal(child.PI_RUN_BROWSER_TESTS, '0');
  assert.equal(Object.keys(child).some(key => key.toUpperCase().startsWith('PI_BROWSER_')), false);
  assert.deepEqual(Object.keys(child).filter(key => key.toUpperCase() === 'PI_RUN_BROWSER_TESTS'), ['PI_RUN_BROWSER_TESTS']);
  assert.equal(child.PI_OFFLINE, '1');
  assert.equal(child.npm_config_offline, 'true');
  assert.deepEqual(Object.keys(child).filter(key => key.toUpperCase() === 'NPM_CONFIG_OFFLINE'), ['npm_config_offline']);
  assert.deepEqual(Object.keys(child).filter(key => key.toUpperCase() === 'PI_RUN_LIVE_SUBAGENT_TESTS'), ['PI_RUN_LIVE_SUBAGENT_TESTS']);
  const isolated = verificationEnvironment({ HOME: '/real', USERPROFILE: '/real', PATH: '/bin' }, { home: '/isolated', temp: '/isolated/tmp' });
  assert.equal(isolated.HOME, '/isolated');
  assert.equal(isolated.USERPROFILE, '/isolated');
  assert.equal(isolated.TEMP, '/isolated/tmp');
});

test('runtime smoke isolates homes and strips parent credentials and subagent identity', () => {
  const parent = {
    PATH: '/fixture/path', OPENAI_API_KEY: 'secret', SESSION_TOKEN: 'secret', HTTPS_PROXY: 'http://proxy.invalid',
    NODE_OPTIONS: '--require=inject.cjs', PI_SUBAGENT_AGENT: 'worker', KEEP: 'yes',
    Pi_Run_Browser_Tests: '1', Pi_Browser_Executable_Path: '/real/browser',
    Pi_Subagents_Config: '/real/subagents.json',
  };
  const before = structuredClone(parent);
  const child = runtimeEnvironment(parent, { agentDir: '/isolated/agent', home: '/isolated/home', temp: '/isolated/tmp' });
  assert.deepEqual(parent, before);
  assert.equal(child.PATH, '/fixture/path');
  assert.equal(child.KEEP, 'yes');
  assert.equal(child.OPENAI_API_KEY, undefined);
  assert.equal(child.SESSION_TOKEN, undefined);
  assert.equal(child.HTTPS_PROXY, undefined);
  assert.equal(child.NODE_OPTIONS, undefined);
  assert.equal(child.PI_SUBAGENT_AGENT, undefined);
  assert.equal(child.Pi_Subagents_Config, undefined);
  assert.equal(child.PI_RUN_BROWSER_TESTS, '0');
  assert.equal(Object.keys(child).some(key => key.toUpperCase().startsWith('PI_BROWSER_')), false);
  assert.deepEqual(Object.keys(child).filter(key => key.toUpperCase() === 'PI_RUN_BROWSER_TESTS'), ['PI_RUN_BROWSER_TESTS']);
  assert.equal(child.HOME, '/isolated/home');
  assert.equal(child.PI_CODING_AGENT_DIR, '/isolated/agent');
  assert.equal(child.npm_config_offline, 'true');
});

test('installed-host lookup requires the exact Pi package version from PATH', t => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-config-installed-pi-'));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const packageRoot = path.join(base, 'bin', 'node_modules', '@earendil-works', 'pi-coding-agent');
  fs.mkdirSync(path.join(packageRoot, 'dist'), { recursive: true });
  fs.writeFileSync(path.join(packageRoot, 'package.json'), JSON.stringify({
    name: '@earendil-works/pi-coding-agent', version: '0.85.0', bin: { pi: 'dist/cli.js' },
  }));
  fs.writeFileSync(path.join(packageRoot, 'dist', 'cli.js'), 'export {};\n');
  const host = identifyInstalledPiHost('0.85.0', { env: { PATH: path.join(base, 'bin') } });
  assert.equal(host.packageRoot, packageRoot);
  assert.equal(host.version, '0.85.0');
  assert.throws(() => identifyInstalledPiHost('0.84.0', { env: { PATH: path.join(base, 'bin') } }), /was not found/);
});

test('validates npm_execpath before using Node to invoke npm', t => {
  const source = fixture(t);
  const npmCli = path.join(source, 'npm-cli.js');
  fs.writeFileSync(npmCli, '');
  assert.equal(resolveNpmExecPath({ env: { npm_execpath: npmCli } }), npmCli);
  assert.throws(() => resolveNpmExecPath({ env: { npm_execpath: 'npm-cli.js' } }), /absolute path/);
  assert.throws(() => resolveNpmExecPath({ env: { npm_execpath: path.join(source, 'other.js') } }), /Unexpected/);
});
