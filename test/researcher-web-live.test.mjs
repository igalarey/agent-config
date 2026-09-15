import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const enabled = process.env.PI_RUN_LIVE_SUBAGENT_TESTS === '1';
const root = path.resolve(import.meta.dirname, '..');

test('researcher fetch policy with synthetic parent and a real RPC child (opt-in)', {
  skip: !enabled,
  timeout: 90_000,
}, async () => {
  const source = process.env.PI_TEST_SUBAGENTS_SOURCE;
  const model = process.env.PI_TEST_MODEL?.trim();
  assert.ok(source && path.isAbsolute(source), 'PI_TEST_SUBAGENTS_SOURCE must select an absolute source repository path');
  assert.ok(model && !/astra|:xhigh$/i.test(model), 'PI_TEST_MODEL must select a non-reserved model');
  const harnessUrl = pathToFileURL(path.join(source, 'test/integration/harness.ts')).href;
  const { createTestEnv, createExtensionDriver, cleanupTestEnv } = await import(harnessUrl);
  const webFetch = (await import(pathToFileURL(path.join(root, 'vendor/pi-web-fetch/index.ts')).href)).default;
  const profile = fs.readFileSync(path.join(root, 'agents/researcher.md'), 'utf8').replace('thinking: max', 'thinking: low');
  const env = createTestEnv();
  let driver;
  try {
    fs.writeFileSync(path.join(env.agentDir, 'agents/researcher.md'), profile);
    const legacy = path.join(env.agentDir, 'extensions/web-fetch/index.ts');
    fs.mkdirSync(path.dirname(legacy), { recursive: true });
    fs.writeFileSync(legacy, 'throw new Error("Legacy extension must not execute");');
    driver = await createExtensionDriver(env);
    webFetch({ on() {}, registerTool() {} });
    const ack = await driver.tool('subagent').execute('web-probe', {
      agent: 'researcher', name: 'WebPolicyProbe', model,
      task: 'This is a tool-policy regression test, not research. Call web_fetch exactly once for http://127.0.0.1/ to confirm it rejects private networks without accessing them. Do not use read or safe_bash. After the expected rejection, return a structured handoff with Status: complete and WEB_POLICY_OK in Summary.',
    }, undefined, undefined, driver.ctx);
    assert.equal(ack.details.status, 'started');
    const result = await driver.waitForMessage(entry =>
      entry.message?.customType === 'subagent_result' && entry.message?.details?.name === 'WebPolicyProbe',
    { timeout: 60_000 });
    assert.equal(result.message.details.exitCode, 0);
    assert.match(result.message.content, /WEB_POLICY_OK/);
    const entries = fs.readFileSync(ack.details.sessionFile, 'utf8').trim().split('\n').map(JSON.parse);
    const calls = entries.flatMap(entry => Array.isArray(entry.message?.content) ? entry.message.content : [])
      .filter(content => content.type === 'toolCall');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].name, 'web_fetch');
    assert.equal(calls[0].arguments.url, 'http://127.0.0.1/');
    const rejected = entries.find(entry => entry.message?.role === 'toolResult' && entry.message?.toolName === 'web_fetch');
    assert.equal(rejected?.message?.isError, true);
    const errorText = rejected.message.content.filter(item => item.type === 'text').map(item => item.text).join('\n');
    assert.match(errorText, /Refusing non-public address/);
  } finally {
    if (driver) await driver.stop();
    else cleanupTestEnv(env);
  }
  assert.equal(fs.existsSync(env.root), false, 'Private fixture must be removed after child shutdown');
});
