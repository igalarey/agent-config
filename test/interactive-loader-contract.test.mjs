import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { assertOfficialLoaderEvidence } from '../scripts/runtime-smoke.mjs';

test('configured interactive loader requires current native registrations and a unique runtime', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'interactive-loader-contract-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'native'));
  fs.mkdirSync(path.join(root, 'config'));
  fs.writeFileSync(path.join(root, 'native/package.json'), JSON.stringify({ dependencies: { 'pi-web-access': '0.47.0', 'pi-mcp-adapter': '7.0.1' } }));
  fs.writeFileSync(path.join(root, 'config/pi.settings.json'), JSON.stringify({ packages: [] }));
  const manifest = { packages: [{ name: 'pi-interactive-subagents' }], files: [{ path: 'config/subagents.json' }, { path: 'native/package.json' }] };
  const sourceInfo = { origin: 'package', path: path.join(root, 'packages/fixture/index.ts') };
  const toolNames = ['subagent', 'subagents_list', 'subagent_message', 'subagent_cancel', 'subagent_status', 'implementation_route', 'start_supervision', 'ask_user_question', 'web_search', 'fetch_content', 'get_search_content', 'source_check', 'web_enable', 'mcp'];
  const deferred = ['web_search', 'fetch_content', 'get_search_content', 'source_check'];
  const commands = ['subagent', 'subagent-cancel', 'subagents', 'subagent-log', 'supervise', 'om', 'om:status', 'om:compact', 'om:consolidate', 'mcp', 'mcp-adapter', 'mcp-auth'];
  const evidence = { inspect: { success: true }, messages: [], inspection: {
    allTools: [...toolNames.map(name => ({ name, sourceInfo })), { name: 'codemode', sourceInfo: { source: 'builtin' } }],
    activeTools: [...toolNames.filter(name => !deferred.includes(name)), 'codemode'],
    commands: commands.map(name => ({ name, sourceInfo })),
  } };
  assert.doesNotThrow(() => assertOfficialLoaderEvidence(evidence, root, manifest));
  const missingStatus = structuredClone(evidence);
  missingStatus.inspection.allTools = missingStatus.inspection.allTools.filter(tool => tool.name !== 'subagent_status');
  assert.throws(() => assertOfficialLoaderEvidence(missingStatus, root, manifest), /subagent_status/);
  for (const name of ['Agent', 'get_subagent_result', 'steer_subagent', 'SubagentWorkflow', 'TaskList', 'web_fetch', 'mcpScript']) {
    const invalid = structuredClone(evidence);
    invalid.inspection.allTools.push({ name, sourceInfo });
    assert.throws(() => assertOfficialLoaderEvidence(invalid, root, manifest), /Retired|retired|Tasks|runtime/);
  }
  for (const kind of ['allTools', 'commands']) {
    const invalid = structuredClone(evidence);
    invalid.inspection[kind].push(invalid.inspection[kind][0]);
    assert.throws(() => assertOfficialLoaderEvidence(invalid, root, manifest), /once|duplicate/i);
  }
});
