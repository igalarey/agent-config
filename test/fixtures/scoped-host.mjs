import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import provider from './scoped-provider.mjs';
import { assertScopedProfileCapabilities } from '../../scripts/runtime-smoke.mjs';

const [host, native, coordinator, browser, bridge] = process.argv.slice(2);
const sdk = await import(pathToFileURL(path.join(host, 'dist/index.js')));
const home = process.env.HOME, agentDir = process.env.PI_CODING_AGENT_DIR;
const contracts = JSON.parse(fs.readFileSync(path.join(home, 'contracts.json')));
const quote = text => `'${text.replaceAll("'", "'\\''")}'`;
const bin = path.join(home, 'bin'); fs.mkdirSync(bin);
fs.writeFileSync(path.join(bin, 'pi'), `#!/bin/sh\nexec ${quote(process.execPath)} --import ${quote(path.join(coordinator, 'test/fixtures/offline.mjs'))} ${quote(path.join(host, 'dist/cli.js'))} "$@" -e ${quote(path.join(import.meta.dirname, 'scoped-provider.mjs'))}\n`, { mode: 0o700 });
process.env.PATH = `${bin}:${process.env.PATH}`;
const notices = [];
const loader = new sdk.DefaultResourceLoader({ cwd: home, agentDir, noSkills: true, noPromptTemplates: true, noThemes: true,
  additionalExtensionPaths: [native, coordinator, browser, bridge],
  extensionFactories: [provider, pi => { pi.on('message_end', event => { if (event.message.customType === 'subagent_result') notices.push(event.message); }); }],
});
await loader.reload();
assert.deepEqual(loader.getExtensions().errors, []);
const { session } = await sdk.createAgentSession({ cwd: home, agentDir, resourceLoader: loader, sessionManager: sdk.SessionManager.create(home) });
await session.bindExtensions({ mode: 'rpc' });
await session.setModel(session.modelRuntime.getModel('project-faux', 'inherited'));
const call = async args => {
  await session.waitForIdle(); await session.prompt('HOST_CALL ' + JSON.stringify(args));
  const result = session.messages.findLast(m => m.role === 'toolResult' && m.toolName === 'project_session');
  assert(result && !result.isError, JSON.stringify(result)); return result;
};
try {
  await session.prompt('LIST');
  const listed = session.messages.findLast(m => m.role === 'toolResult' && m.toolName === 'subagents_list');
  assert.deepEqual(listed.details.agents.map(a => a.name).sort(), Object.keys(contracts).sort());
  const scoped = assertScopedProfileCapabilities(listed.details.agents, globalThis[Symbol.for('pi.subagents.tool-extension-registry')]?.capabilities);
  assert.equal(scoped.agents.length, 8);
  for (const agent of listed.details.agents) {
    const c = contracts[agent.name];
    assert.equal(agent.extensionPolicy, 'scoped');
    assert.equal(agent.tools, c.tools);
    assert.equal(agent.skillCatalog, c.skill_catalog);
    assert.equal(agent.model, c.model);
    assert.equal(agent.thinking, c.thinking);
    assert.equal(agent.maxTurns, Number(c.max_turns));
    if (agent.name !== 'project-worker') assert.deepEqual(agent.subagentAgents, []);
  }
  const root = path.join(home, 'repo');
  let original;
  for (const round of [1, 2]) {
    const from = notices.length;
    const result = await call({ action: 'dispatch', path: root, task: `COMBINED_ROUND_${round}: run bounded worker, researcher and ui-verifier fixture; no real network or UI control.` });
    assert.equal(result.details.status, 'started');
    const binding = session.sessionManager.getBranch().findLast(e => e.customType === 'project-sessions:binding').data;
    const saved = JSON.parse(fs.readFileSync(binding.sessionFile + '.loadout.json'));
    assert.equal(saved.model, 'project-faux/inherited');
    assert.equal(saved.cwd, root);
    const deadline = Date.now() + 45000;
    while (!notices.slice(from).some(n => n.details?.name === binding.name)) {
      assert(Date.now() < deadline, `No completion; session: ${fs.readFileSync(binding.sessionFile, 'utf8').slice(-12000)}`);
      await delay(30);
    }
    assert.match(JSON.stringify(notices.slice(from)), /COMBINED_DONE/);
    const proof = JSON.parse(fs.readFileSync(path.join(home, 'coordinator-proof.json')));
    assert.equal(proof.launches.length, 3);
    if (original) {
      assert.deepEqual(saved, original.saved, 'resume changed frozen model, permissions or paths');
      assert.equal(binding.sessionFile, original.binding.sessionFile);
      assert.notEqual(proof.pid, original.pid);
    } else original = { saved, binding, pid: proof.pid };
    for (const role of ['worker', 'researcher', 'ui-verifier']) {
      const leaf = JSON.parse(fs.readFileSync(path.join(home, role + '-proof.json')));
      assert.equal(leaf.saved.model, 'openai/gpt-6.1-sol');
      assert.equal(leaf.saved.cwd, root);
      for (const [tool, file] of Object.entries(leaf.saved.extensionBindings)) assert.equal(saved.extensionBindings[tool], file);
      assert.deepEqual(leaf.saved.spawnable, []);
      if (role === 'researcher') assert(Object.values(leaf.saved.extensionBindings).includes(path.join(path.dirname(bridge), 'provider.ts')));
      if (role === 'ui-verifier') assert(Object.values(leaf.saved.extensionBindings).includes(path.join(browser, 'index.ts')));
    }
  }
  assert.equal(fs.readFileSync(path.join(home, 'transport.jsonl'), 'utf8').trim().split('\n').length, 1);
  console.log('COMBINED_SCOPED_OK: real profiles/catalogs, project-worker PTY delegation, upstream research transport, browser refusal/close, frozen resume');
} finally {
  await session.waitForIdle();
  await session.extensionRunner.emit({ type: 'session_shutdown', reason: 'quit' });
  session.dispose();
}
