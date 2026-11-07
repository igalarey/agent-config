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
  let leaf = 'leaf', sessionId = 'session', now = 1000000;
  const pi = { on: (n, f) => { events[n] = f; }, getCommands: () => [], appendEntry: (_, data) => metadata.push(data), sendUserMessage: () => assert.fail('extra main turn') };
  const ctx = { mode: 'tui', hasUI: true, cwd: dir, isIdle: () => true, model: { id: 'synthetic', provider: 'offline' },
    sessionManager: { getSessionId: () => sessionId, getLeafId: () => leaf, getEntries: () => [], },
    ui: { setStatus: (_, s) => notices.push(s), notify: s => notices.push(s) },
    modelRegistry: { streamSimple: (model, input, options) => { calls.push({ model, input, options }); return { result: async () => typeof response === 'function' ? response() : ({ stopReason: 'stop', content: [{ type: 'text', text: JSON.stringify(response) }], usage: { input: 10, output: 20 } }) }; } } };
  const auto = installAutomaticReview(pi, () => dir, () => {}, { now: () => now });
  const emit = (name, event = {}) => events[name]?.(event, ctx);
  const turn = async (source = 'interactive', output = '# tests 2\n# pass 2\n# fail 0', afterVerification) => {
    await emit('input', { source, text: 'Fix and test the isolated fixture.' });
    await emit('before_agent_start', { messageType: 'user', prompt: 'Fix and test the isolated fixture.' });
    await emit('tool_result', { toolName: 'bash', toolCallId: 'test1', input: { command: 'node --test fixture.mjs' }, isError: false, content: [{ type: 'text', text: output }] });
    await emit('message_end', { message: { role: 'assistant', stopReason: 'stop', content: [{ type: 'thinking', thinking: 'PRIVATE_THINKING' }, { type: 'text', text: 'Fixed the fixture and verified both assertions.' }] } });
    await afterVerification?.();
    await emit('agent_settled', { aborted: false });
    await auto.wait();
  };
  return { dir, pi, ctx, calls, notices, metadata, emit, turn, auto, tick: () => { now += 300001; }, stale: () => { leaf = 'other'; }, switchSession: async id => { sessionId = id; await emit('session_start'); } };
}
test('automatic learning stays silent in the footer but retains proposals and explicit status', async t => {
  const f = fixture(t), statuses = [];
  f.ctx.ui.setStatus = (key, value) => statuses.push({ key, value });
  await f.emit('session_start');
  await f.turn();
  assert.equal(f.calls.length, 1);
  assert.equal((await createStore(f.dir).list()).length, 1);
  assert(f.notices.some(value => /proposal .* pending/.test(value)));
  assert(statuses.every(({ key, value }) => key === 'learning' && value === undefined));
  f.auto.command('status', f.ctx);
  assert.match(f.notices.at(-1), /Learning auto: on/);
});
function catalog(f, descriptions, bytes = 3500) {
  return descriptions.map((description, index) => {
    const dir = path.join(f.dir, `catalog-${index}`);
    fs.mkdirSync(dir, { recursive: true });
    const content = `---\nname: procedure-${index}\ndescription: ${description}\n---\n` + 'Complete procedure. '.repeat(Math.ceil(bytes / 20));
    const filename = path.join(dir, 'SKILL.md');
    fs.writeFileSync(filename, content);
    return { name: `skill:procedure-${index}`, description, source: 'skill', sourceInfo: { path: filename } };
  });
}
test('large real discovery catalog sends all descriptions and only complete relevant procedures', async t => {
  const f = fixture(t);
  const commands = catalog(f, ['Repair isolated fixture assertions', ...Array.from({ length: 21 }, (_, i) => `Botanical catalog topic${i}`)]);
  assert(commands.reduce((sum, c) => sum + fs.statSync(c.sourceInfo.path).size, 0) > 74306);
  f.pi.getCommands = () => commands;
  await f.turn();
  assert.equal(f.calls.length, 1);
  const input = f.calls[0].input, payload = JSON.parse(input.messages[1].content);
  assert(Buffer.byteLength(JSON.stringify(input)) <= 24576);
  assert.deepEqual(payload.catalog, commands.map(({ name, description }) => ({ name, description })));
  assert.deepEqual(payload.procedures, [{ name: commands[0].name, content: fs.readFileSync(commands[0].sourceInfo.path, 'utf8') }]);
  assert.match(input.messages[0].content, /unread/i);
  assert.equal((await createStore(f.dir).list()).length, 1);
});
test('unrelated catalogs need no procedure reads; uncertain candidates defer without charging attempts', async t => {
  const f = fixture(t);
  let commands = catalog(f, Array.from({ length: 22 }, (_, i) => `Botanical catalog topic${i}`));
  for (const c of commands) fs.unlinkSync(c.sourceInfo.path);
  f.pi.getCommands = () => commands;
  await f.turn(); assert.equal(f.calls.length, 1);
  assert.deepEqual(JSON.parse(f.calls[0].input.messages[1].content).procedures, []);
  const g = fixture(t);
  commands = catalog(g, ['Repair isolated fixture assertions'], 25000);
  g.pi.getCommands = () => commands;
  await g.turn(); await g.turn(); await g.turn();
  assert.equal(g.calls.length, 0); assert.deepEqual(g.metadata, []);
  fs.writeFileSync(commands[0].sourceInfo.path, 'A complete isolated fixture procedure.');
  await g.turn(); assert.equal(g.calls.length, 1, 'preflight must not consume attempts or cooldown');
});
test('selected aggregate overflow and unreadable candidate defer without partial procedures', async t => {
  for (const problem of ['aggregate', 'missing', 'catalog']) {
    const f = fixture(t);
    const commands = catalog(f, ['Isolated fixture procedure', 'Fixture assertions procedure', 'Repair fixture procedure'], 10000);
    if (problem === 'missing') fs.unlinkSync(commands[0].sourceInfo.path);
    if (problem === 'catalog') commands[0].description += 'x'.repeat(25000);
    f.pi.getCommands = () => commands;
    await f.turn(); assert.equal(f.calls.length, 0); assert.deepEqual(f.metadata, []);
  }
});
test('later failed or unconfirmed checks and implementation edits invalidate earlier verification', async t => {
  const testResult = (isError, output) => ({ toolName: 'bash', input: { command: 'node --test fixture.mjs' }, isError, content: [{ type: 'text', text: output }] });
  for (const event of [testResult(true, 'process failed'), testResult(false, '# pass 2\n# fail 1'), testResult(false, 'inconclusive output'), { toolName: 'edit', isError: false }, { toolName: 'write', isError: false }, { toolName: 'bash', input: { command: 'apply_patch < change.patch' }, isError: false }]) {
    const f = fixture(t);
    await f.turn('interactive', '# pass 2\n# fail 0', () => f.emit('tool_result', event));
    assert.equal(f.calls.length, 0, JSON.stringify(event));
    assert.deepEqual(f.metadata, []);
  }
  const f = fixture(t);
  await f.turn('interactive', '# pass 2\n# fail 0', async () => {
    await f.emit('tool_result', { toolName: 'edit', isError: false });
    await f.emit('tool_result', testResult(false, '# pass 2\n# fail 0'));
  });
  assert.equal(f.calls.length, 1, 'a new confirming test after an edit restores eligibility');
});
test('automatic pause follows session identity and never overrides mandatory user opt-in', async t => {
  const f = fixture(t);
  f.auto.command('auto off', f.ctx);
  await f.switchSession('session');
  f.auto.command('status', f.ctx); assert.match(f.notices.at(-1), /auto: off/);
  await f.turn(); assert.equal(f.calls.length, 0);
  await f.switchSession('other');
  f.auto.command('status', f.ctx); assert.match(f.notices.at(-1), /auto: on/);
  await f.turn(); assert.equal(f.calls.length, 1);
  await f.switchSession('session');
  f.auto.command('status', f.ctx); assert.match(f.notices.at(-1), /auto: off/);
  assert.equal(f.auto.command('auto on', f.ctx), true);
  await f.turn(); assert.equal(f.calls.length, 2);
  fs.unlinkSync(path.join(f.dir, 'settings.json'));
  f.auto.command('auto on', f.ctx);
  f.auto.command('status', f.ctx); assert.match(f.notices.at(-1), /auto: off/);
});
test('cancelled job retains its own signal when a later job starts', async t => {
  let release, responseCount = 0;
  const delayed = new Promise(resolve => { release = resolve; });
  const result = { stopReason: 'stop', content: [{ type: 'text', text: 'null' }] };
  const f = fixture(t, () => ++responseCount === 1 ? delayed : result);
  const first = f.turn(); await new Promise(resolve => setImmediate(resolve));
  f.auto.command('cancel', f.ctx); await first;
  f.tick(); await f.turn();
  assert.equal(f.calls.length, 2);
  assert(f.calls[0].options.signal.aborted);
  assert(!f.calls[1].options.signal.aborted);
  release({ stopReason: 'stop', content: [{ type: 'text', text: JSON.stringify(answer) }] });
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(await createStore(f.dir).list(), []);
});
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
