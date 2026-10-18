import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import { resolvePiHostDependency } from '../../scripts/runtime-smoke.mjs';
import { pathToFileURL } from 'node:url';

let networkCalls = 0;
globalThis.fetch = async () => { networkCalls++; throw new Error('NETWORK_DISABLED'); };
const [host, source] = process.argv.slice(2);
const { createAgentSession, DefaultResourceLoader, SessionManager } = await import(pathToFileURL(path.join(host, 'dist/index.js')));
const { createAssistantMessageEventStream } = await import(pathToFileURL(path.join(resolvePiHostDependency({ cli: path.join(host, 'dist/cli.js') }, '@earendil-works/pi-ai'), 'dist/index.js')));
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};
const text = message => typeof message.content === 'string' ? message.content : message.content.filter(part => part.type === 'text').map(part => part.text).join('\n');
const isNotification = message => message.role === 'custom' && message.customType === 'subagent-notification';
const phases = [], notificationEvents = [];
let session, phase, shutDown = false;
function parentFinal(notices) {
  const expected = phase.name.startsWith('consumed-') ? 0 : 1;
  assert.equal(notices.length, expected, `${phase.name}: next model must receive only unconsumed results before parent final`);
  if (expected) {
    for (const child of phase.children.filter(child => !child.consumedAt)) assert(notices.some(message => text(message).includes(child.token)), `${phase.name}: unconsumed result lost`);
    for (const child of phase.children.filter(child => child.consumedAt)) assert(!notices.some(message => text(message).includes(child.id)), 'group retained a consumed result');
  }
  phase.finalRequest.resolve();
  return [{ type: 'text', text: `PARENT_FINAL_${phase.name}` }];
}
const loader = new DefaultResourceLoader({
  cwd: process.env.PWD, agentDir: process.env.PI_CODING_AGENT_DIR,
  noExtensions: true, noSkills: true, noPromptTemplates: true, noThemes: true, noContextFiles: true,
  additionalExtensionPaths: [source],
  extensionFactories: [pi => {
    pi.events.on('subagents:completed', event => {
      const child = phase.children.find(child => event.description === child.description);
      assert(child, 'unexpected real subagents:completed event');
      child.id = event.id;
      child.completedAt = performance.now();
      child.completed.resolve(event);
    });
    pi.registerProvider('notification-fixture', {
      baseUrl: 'https://invalid.example', apiKey: 'offline-fixture', api: 'notification-fixture',
      models: [{ id: 'fixture', name: 'fixture', reasoning: false, input: ['text'], contextWindow: 200000, maxTokens: 128, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } }],
      streamSimple(model, context) {
        const stream = createAssistantMessageEventStream();
        queueMicrotask(async () => {
          const names = new Set((context.tools ?? []).map(tool => tool.name));
          for (const message of context.messages.filter(message => message.role === 'system')) {
            for (const tool of message.toolsAdded ?? []) names.add(tool.name);
            for (const tool of message.toolsRemoved ?? []) names.delete(tool.name);
          }
          let content, stopReason = 'stop';
          if (!names.has('Agent')) {
            const prompt = text(context.messages.find(message => message.role === 'user'));
            const child = phase.children.find(child => prompt === `Return ${child.token}.`);
            assert(child, 'unexpected child model request');
            assert.equal(++child.requests, 1, 'child model request budget exceeded');
            child.started.resolve();
            await child.release.promise;
            content = [{ type: 'text', text: child.token }];
          } else {
            const n = ++phase.parentRequests;
            assert(n <= (phase.name === 'group-partial' ? 2 : 3), `${phase.name}: parent model request budget exceeded`);
            const notices = context.messages.filter(message => message.role === 'user' && text(message).includes('<task-notification>')
              && phase.children.some(child => text(message).includes(child.id ?? child.token)));
            phase.modelNotifications.push(notices.map(text));
            if (n === 1) {
              content = phase.children.map((child, i) => ({ type: 'toolCall', id: `spawn-${phase.name}-${i}`, name: 'Agent', arguments: {
                description: child.description, subagent_type: 'notification-child', model: 'notification-fixture/fixture',
                prompt: `Return ${child.token}.`, run_in_background: true,
              } }));
              if (phase.name === 'group-partial') content.push({ type: 'toolCall', id: `batch-${phase.name}`, name: 'fixture_batch', arguments: {} });
              stopReason = 'toolUse';
            } else if (n === 2) {
              for (const [i, child] of phase.children.entries()) {
                const result = context.messages.find(message => message.role === 'toolResult' && message.toolCallId === `spawn-${phase.name}-${i}`);
                assert(result && !result.isError, 'real Agent tool failed');
                child.id = text(result).match(/Agent ID:\s*([a-z0-9-]+)/i)?.[1];
                assert(child.id, 'real Agent tool did not return an ID');
              }
              if (phase.name === 'group-partial') {
                content = parentFinal(notices);
              } else if (phase.name === 'idle-wake' || phase.name === 'shutdown') {
                content = [{ type: 'text', text: `PARENT_IDLE_${phase.name}` }];
              } else {
                content = [{ type: 'toolCall', id: `batch-${phase.name}`, name: 'fixture_batch', arguments: {} }];
                stopReason = 'toolUse';
              }
            } else content = parentFinal(notices);
          }
          const message = { role: 'assistant', content, api: model.api, provider: model.provider, model: model.id,
            stopReason, timestamp: Date.now(), usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } } };
          stream.push({ type: 'start', partial: message });
          stream.push({ type: 'done', reason: stopReason, message });
          stream.end();
        });
        return stream;
      },
    });
    pi.registerTool({
      name: 'fixture_batch', label: 'Parent work and result collection', description: 'Finish children while a real parent tool batch is active',
      parameters: { type: 'object', properties: {} },
      async execute(_id, _args, signal, _onUpdate, ctx) {
        phase.toolActive = true;
        await Promise.all(phase.children.map(child => child.started.promise));
        const consume = async child => {
          assert(phase.toolActive, 'parent tool ceased to be active before consumption');
          const result = await session.getToolDefinition('get_subagent_result').execute(`consume-${child.id}`, { agent_id: child.id, wait: true }, signal, undefined, ctx);
          assert.match(text(result), new RegExp(child.token));
          child.consumedAt = performance.now();
          if (phase.name === 'consumed-delayed') assert(child.consumedAt - child.completedAt >= 500, 'consumption did not cross the old 200 ms nudge window');
        };
        if (phase.name === 'group-partial') {
          const [first, second] = phase.children;
          first.release.resolve();
          await first.completed.promise;
          await consume(first);
          second.release.resolve();
          await second.completed.promise;
          await sleep(510);
        } else {
          for (const child of phase.children) child.release.resolve();
          await Promise.all(phase.children.map(child => child.completed.promise));
          if (phase.name !== 'consumed-immediate') await sleep(510);
          if (phase.name.startsWith('consumed-')) for (const child of phase.children) await consume(child);
        }
        phase.toolActive = false;
        return { content: [{ type: 'text', text: `PARENT_TOOL_DONE_${phase.name}` }], details: undefined };
      },
    });
  }],
});
await loader.reload();
assert.deepEqual(loader.getExtensions().errors, []);
({ session } = await createAgentSession({ cwd: process.env.PWD, agentDir: process.env.PI_CODING_AGENT_DIR,
  resourceLoader: loader, noTools: true, sessionManager: SessionManager.inMemory(process.env.PWD) }));
try {
  await session.bindExtensions({ mode: 'rpc' });
  await session.setModel(session.modelRuntime.getModel('notification-fixture', 'fixture'));
  session.subscribe(event => {
    if (event.type === 'message_end' && isNotification(event.message)) notificationEvents.push(event.type);
    if (event.type === 'entry_appended' && event.entry.type === 'custom_message' && event.entry.customType === 'subagent-notification') notificationEvents.push(event.type);
  });
  for (const name of ['consumed-delayed', 'consumed-immediate', 'unconsumed-batch', 'group-partial', 'idle-wake', 'shutdown']) {
    phase = { name, parentRequests: 0, modelNotifications: [], finalRequest: deferred(), children: Array.from({ length: name === 'group-partial' ? 2 : 1 }, (_, i) => ({
      description: `Notification fixture ${name} ${i}`, token: `CHILD_RESULT_${name}_${i}`, requests: 0,
      release: deferred(), started: deferred(), completed: deferred(),
    })) };
    const start = session.sessionManager.getBranch().length, eventStart = notificationEvents.length;
    await session.prompt(`Run notification scenario ${name}`, { source: 'interactive' });
    if (name === 'idle-wake' || name === 'shutdown') {
      assert.equal(phase.parentRequests, 2, `${name}: parent was not idle before child completion`);
      assert.equal(session.isIdle, true, `${name}: SDK session was not idle before completion`);
      await Promise.all(phase.children.map(child => child.started.promise));
      await sleep(150);
      for (const child of phase.children) child.release.resolve();
      await Promise.all(phase.children.map(child => child.completed.promise));
      if (name === 'shutdown') {
        await session.extensionRunner.emit({ type: 'session_shutdown' });
        shutDown = true;
      } else await phase.finalRequest.promise;
    }
    await sleep(350);
    await session.waitForIdle();
    const messages = session.sessionManager.getBranch().slice(start).flatMap(entry => entry.type === 'message' ? [entry.message]
      : entry.type === 'custom_message' ? [{ ...entry, role: 'custom' }] : []);
    const notifications = messages.filter(isNotification);
    const expectedNotices = name.startsWith('consumed-') || name === 'shutdown' ? 0 : 1;
    assert.equal(notifications.length, expectedNotices, `${name}: consumed/shutdown results must not notify, unconsumed results must notify exactly once`);
    assert.equal(notificationEvents.length - eventStart, expectedNotices, `${name}: public notification events disagree with committed transcript`);
    if (name === 'group-partial') assert.match(text(notifications[0]), /Background agent group completed/);
    assert.equal(phase.parentRequests, name === 'shutdown' || name === 'group-partial' ? 2 : 3, `${name}: unexpected model request count`);
    assert(phase.children.every(child => child.requests === 1), `${name}: child request budget mismatch`);
    for (const child of phase.children.filter(child => child.consumedAt)) {
      assert(!notifications.some(message => text(message).includes(child.id)), `${name}: consumed result entered a notification`);
      assert(phase.modelNotifications.every(notices => notices.every(notice => !notice.includes(child.id))), `${name}: consumed result reached model`);
    }
    if (name !== 'shutdown') {
      const finalIndex = messages.findIndex(message => message.role === 'assistant' && text(message) === `PARENT_FINAL_${name}`);
      assert(finalIndex >= 0, `${name}: parent final missing`);
      if (notifications.length) assert(messages.indexOf(notifications[0]) < finalIndex, `${name}: notification arrived after parent final`);
      if (name !== 'idle-wake') {
        const toolIndex = messages.findIndex(message => message.role === 'toolResult' && message.toolName === 'fixture_batch');
        assert(toolIndex >= 0 && toolIndex < finalIndex, `${name}: final did not follow parent tool result`);
      }
    }
    phases.push({ phase: name, parentRequests: phase.parentRequests, childRequests: phase.children.reduce((sum, child) => sum + child.requests, 0), notifications: notifications.length });
  }
  assert.equal(networkCalls, 0);
  console.log(JSON.stringify({ piVersion: JSON.parse(fs.readFileSync(path.join(host, 'package.json'), 'utf8')).version, networkCalls, phases }));
} finally {
  for (const child of phase?.children ?? []) child.release.resolve();
  if (!shutDown) await session.extensionRunner.emit({ type: 'session_shutdown' });
  session.dispose();
}
