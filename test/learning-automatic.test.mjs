import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { installAutomaticReview } from '../extensions/learning/automatic.mjs';
import { createStore } from '../extensions/learning/store.mjs';

const answer = { name: 'learned-fixture', summary: 'Verify the isolated fixture', content: '---\nname: learned-fixture\ndescription: Verify isolated fixtures\n---\n1. Run node --test fixture.mjs.\n2. Check the assertions pass.', evidence: 'v1' };
function fixture(t, response = answer) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'learning-auto-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.writeFileSync(path.join(dir, 'settings.json'), JSON.stringify({ learning: { automaticReview: true } }));
  const events = {}, calls = [], notices = [], metadata = [];
  let leaf = 'leaf', now = 1000000;
  const pi = { on: (n, f) => { events[n] = f; }, getCommands: () => [], appendEntry: (_, data) => metadata.push(data), sendUserMessage: () => assert.fail('extra main turn') };
  const ctx = { mode: 'tui', hasUI: true, cwd: dir, isIdle: () => true, model: { id: 'synthetic', provider: 'offline' },
    sessionManager: { getSessionId: () => 'session', getLeafId: () => leaf, getEntries: () => [], },
    ui: { setStatus: (_, s) => notices.push(s), notify: s => notices.push(s) },
    modelRegistry: { streamSimple: (model, input, options) => { calls.push({ model, input, options }); return { result: async () => typeof response === 'function' ? response() : ({ stopReason: 'stop', content: [{ type: 'text', text: JSON.stringify(response) }], usage: { input: 10, output: 20 } }) }; } } };
  const auto = installAutomaticReview(pi, () => dir, () => {}, { now: () => now });
  const emit = (name, event = {}) => events[name]?.(event, ctx);
  const turn = async (source = 'interactive', output = '# tests 2\n# pass 2\n# fail 0') => {
    await emit('input', { source, text: 'Fix and test the isolated fixture.' });
    await emit('before_agent_start', { messageType: 'user', prompt: 'Fix and test the isolated fixture.' });
    await emit('tool_result', { toolName: 'bash', toolCallId: 'test1', input: { command: 'node --test fixture.mjs' }, isError: false, content: [{ type: 'text', text: output }] });
    await emit('message_end', { message: { role: 'assistant', stopReason: 'stop', content: [{ type: 'thinking', thinking: 'PRIVATE_THINKING' }, { type: 'text', text: 'Fixed the fixture and verified both assertions.' }] } });
    await emit('agent_settled', { aborted: false });
    await auto.wait();
  };
  return { dir, ctx, calls, notices, metadata, emit, turn, auto, tick: () => { now += 300001; }, stale: () => { leaf = 'other'; } };
}
test('automatic review is tools-free, bounded, preserves evidence and never publishes', async t => {
  const f = fixture(t); await f.turn();
  assert.equal(f.calls.length, 1);
  const call = f.calls[0];
  assert.equal(call.options.maxTokens, 2048); assert.equal(call.options.maxRetries, 0); assert.equal(call.options.reasoning, 'low');
  assert(Buffer.byteLength(JSON.stringify(call.input)) <= 24576);
  assert(!JSON.stringify(call.input).includes('PRIVATE_THINKING'));
  const pending = await createStore(f.dir).list(); assert.equal(pending.length, 1); assert.match(pending[0].evidence, /# pass 2/);
  assert(!fs.existsSync(path.join(f.dir, 'skills')));
  await f.turn(); assert.equal(f.calls.length, 1); f.tick(); await f.turn(); f.tick(); await f.turn(); assert.equal(f.calls.length, 2);
  assert(!JSON.stringify(f.metadata).includes('fixture.mjs'));
});
test('disabled, malformed, project-only, nonhuman and unverified inputs fail closed', async t => {
  for (const config of [null, '{', '{"learning":{"automaticReview":"true"}}', '{}']) {
    const f = fixture(t); if (config === null) fs.unlinkSync(path.join(f.dir, 'settings.json')); else fs.writeFileSync(path.join(f.dir, 'settings.json'), config);
    await f.turn(); assert.equal(f.calls.length, 0);
  }
  const f = fixture(t); await f.turn('extension'); await f.turn('rpc'); await f.turn('interactive', 'exit code 0'); assert.equal(f.calls.length, 0);
});
test('invalid output, sensitive turns and provider errors never stage', async t => {
  for (const response of [{ ...answer, extra: true }, { ...answer, content: 'x'.repeat(17000) }, () => { throw Error('provider secret'); }]) {
    const f = fixture(t, response); await f.turn(); assert.deepEqual(await createStore(f.dir).list(), []);
    assert(!f.notices.join('').includes('provider secret'));
  }
  const f = fixture(t); await f.turn('interactive', '# pass 2\n# fail 0\npassword=secret-value'); assert.equal(f.calls.length, 0);
});
test('navigation and cancellation invalidate delayed results and reserve attempts', async t => {
  let release; const delayed = new Promise(resolve => { release = resolve; });
  const f = fixture(t, () => delayed); const running = f.turn();
  await new Promise(resolve => setImmediate(resolve));
  await f.emit('session_tree'); f.stale();
  release({ stopReason: 'stop', content: [{ type: 'text', text: JSON.stringify(answer) }] });
  await running; assert.deepEqual(await createStore(f.dir).list(), []); assert(f.calls[0].options.signal.aborted);
});
