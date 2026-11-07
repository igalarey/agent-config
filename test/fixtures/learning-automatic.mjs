import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

export async function exerciseAutomatic(session, agentDir, ai) {
  fs.writeFileSync(path.join(agentDir, 'settings.json'), JSON.stringify({ learning: { automaticReview: true } }));
  const runner = session.extensionRunner;
  const original = runner.createContext.bind(runner);
  let calls = 0, finish;
  const done = new Promise(resolve => { finish = resolve; });
  runner.createContext = () => ({ ...original(), model: { id: 'synthetic', provider: 'offline' }, modelRegistry: {
    streamSimple(_model, context, options) {
      calls++;
      assert.equal(context.tools, undefined);
      assert.equal(context.messages[0].role, 'system');
      assert.equal(typeof context.messages[0].timestamp, 'number');
      const normalized = ai.normalizeContext(context);
      assert.equal(ai.getCurrentSystemPrompt(normalized.messages), context.messages[0].content);
      assert.deepEqual(ai.getCurrentTools(normalized.messages), []);
      assert.deepEqual(normalized.messages.map(message => message.role), ['system', 'user']);
      assert.equal(options.maxRetries, 0);
      assert.equal(options.maxTokens, 2048);
      return { result: async () => ({ stopReason: 'stop', content: [{ type: 'text', text: JSON.stringify({
        name: 'learned-automatic-integration', summary: 'Isolated fixture validation', evidence: 'v1',
        content: '---\nname: learned-automatic-integration\ndescription: Validate isolated fixtures\n---\n1. Run node --test fixture.mjs.\n2. Confirm both assertions pass.',
      }) }], usage: { input: 50, output: 30 } }) };
    },
  }, ui: { ...original().ui, setStatus: (_key, value) => { if (value === 'Learning: pending' || value === 'Learning: failed') finish(value); } } });
  try {
    const before = session.sessionManager.getEntries().filter(e => e.type === 'message').length;
    await runner.emitInput('Fix and verify fixture', undefined, 'interactive');
    await runner.emitBeforeAgentStart({ messageType: 'user', prompt: 'Fix and verify fixture' }, { cwd: agentDir });
    await runner.emit({ type: 'agent_start' });
    await runner.emitToolResult({ type: 'tool_result', toolName: 'bash', toolCallId: 'fixture-test', input: { command: 'node --test fixture.mjs' }, content: [{ type: 'text', text: '# tests 2\n# pass 2\n# fail 0' }], isError: false });
    await runner.emitMessageEnd({ type: 'message_end', message: { role: 'assistant', stopReason: 'stop', content: [{ type: 'text', text: 'Verified fixture assertions after the repair.' }] } });
    await runner.emit({ type: 'agent_settled', aborted: false });
    let timer;
    try { assert.equal(await Promise.race([done, new Promise(resolve => { timer = setTimeout(() => resolve('timeout'), 2000); })]), 'Learning: pending'); }
    finally { clearTimeout(timer); }
    assert.equal(calls, 1);
    assert.equal(session.sessionManager.getEntries().filter(e => e.type === 'message').length, before, 'auxiliary review inserted a main conversation turn');
    assert(!fs.existsSync(path.join(agentDir, 'skills/learned/learned-automatic-integration')));
  } finally { runner.createContext = original; }
}
