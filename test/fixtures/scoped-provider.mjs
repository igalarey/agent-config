import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import dns from 'node:dns/promises';
import { pathToFileURL } from 'node:url';

export default async function provider(pi) {
  pi.on('project_trust', () => ({ trusted: 'no' }));
  const { fauxProvider, fauxAssistantMessage, fauxToolCall } = await import(pathToFileURL(process.env.PI_TEST_FAUX));
  const home = process.env.HOME;
  const role = process.env.PI_SUBAGENT_AGENT;
  const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
  const contracts = read(path.join(home, 'contracts.json'));
  dns.lookup = async name => { assert.equal(name, 'example.org'); return [{ address: '93.184.216.34', family: 4 }]; };
  globalThis.fetch = async (input, init) => {
    const url = new URL(input);
    assert.equal(role, 'researcher');
    assert.equal(url.origin, 'https://api.search.brave.com');
    assert.equal(init.headers['X-Subscription-Token'], 'synthetic-key');
    fs.appendFileSync(path.join(home, 'transport.jsonl'), JSON.stringify({ pid: process.pid, url: url.href }) + '\n');
    return new Response(JSON.stringify({ web: { results: [{ title: 'Fixture evidence', url: 'https://example.org/evidence', description: 'SYNTHETIC_UPSTREAM_EVIDENCE' }] } }), { headers: { 'content-type': 'application/json' } });
  };
  const respond = async (context, _options, _state, model) => {
    const call = (name, args) => fauxAssistantMessage(fauxToolCall(name, args), { stopReason: 'toolUse' });
    if (!role) {
      const last = context.messages.findLastIndex(m => m.role === 'user');
      const content = context.messages[last]?.content;
      const text = typeof content === 'string' ? content : (content ?? []).filter(c => c.type === 'text').map(c => c.text).join('\n');
      if (text.startsWith('HOST_CALL ') && !context.messages.slice(last + 1).some(m => m.role === 'toolResult')) return call('project_session', JSON.parse(text.slice(10)));
      if (text === 'LIST' && !context.messages.slice(last + 1).some(m => m.role === 'toolResult')) return call('subagents_list', {});
      return fauxAssistantMessage('HOST_IDLE');
    }
    assert(process.stdin.isTTY && process.stdout.isTTY, 'child must use the actual PTY host');
    const contract = contracts[role];
    const saved = read(process.env.PI_SUBAGENT_SESSION + '.loadout.json');
    const active = pi.getActiveTools().slice().sort();
    assert.deepEqual(active, saved.toolAllowlist.split(',').sort(), `${role}: active tools differ from frozen scope`);
    assert(active.includes('ask_question'));
    assert(!active.some(n => /mcp|memory|learning|browser_fill|project_session/i.test(n)));
    assert(!pi.getAllTools().some(t => /ambient_probe/.test(t.name)), 'ambient extension registered in child');
    assert.equal(model.id, role === 'project-worker' ? 'inherited' : 'gpt-6.1-sol');
    assert.equal(model.provider, role === 'project-worker' ? 'project-faux' : 'openai');
    const expectedCatalog = contract.skill_catalog.split(',').map(s => s.trim());
    assert.deepEqual(saved.skillCatalogPaths.map(p => path.basename(path.dirname(p))).sort(), expectedCatalog.slice().sort());
    const system = JSON.stringify(context.messages.filter(m => m.role === 'system'));
    for (const skill of expectedCatalog) assert(system.includes(path.join(process.env.PI_CODING_AGENT_DIR, 'skills', skill, 'SKILL.md')), `missing catalog ${skill}`);
    assert(!system.includes('MALICIOUS_CWD_SKILL') && !system.includes('AMBIENT_SKILL'));
    for (const name of fs.readdirSync(path.join(process.env.PI_CODING_AGENT_DIR, 'skills'))) {
      if (!expectedCatalog.includes(name)) assert(!system.includes(path.join(process.env.PI_CODING_AGENT_DIR, 'skills', name, 'SKILL.md')), `ambient catalog ${name}`);
    }
    if (role !== 'project-worker') {
      assert.deepEqual(saved.spawnable, []);
      assert.deepEqual(active, [...contract.tools.split(',').map(s => s.trim()), 'ask_question'].sort());
    }
    const all = context.messages.filter(m => m.role === 'toolResult');
    if (role === 'project-worker') {
      const launches = all.filter(m => m.toolName === 'subagent');
      assert(launches.every(m => !m.isError), JSON.stringify(launches));
      const tasks = ['worker', 'researcher', 'ui-verifier'];
      for (const name of tasks) {
        if (!launches.some(m => m.details?.agent === name)) return call('subagent', { agent: name, name: 'combined-' + name, cwd: process.cwd(), task: 'COMBINED: bounded offline fixture. No delegation. Only synthetic evidence; no network or desktop.' });
        const completed = context.messages.some(m => m.role === 'user' && Array.isArray(m.content) && m.content.some(c => c.type === 'text' && c.text.startsWith('Sub-agent "combined-' + name + '"')));
        if (!completed) return fauxAssistantMessage('Waiting for owned specialist completion');
      }
      fs.writeFileSync(path.join(home, 'coordinator-proof.json'), JSON.stringify({ pid: process.pid, saved, launches: launches.map(m => m.details), active }));
      return fauxAssistantMessage('COMBINED_DONE');
    }
    if (role === 'worker' && !all.length) return call('read', { path: 'AGENTS.md' });
    if (role === 'researcher' && !all.length) return call('web_search', { query: 'synthetic bounded evidence' });
    if (role === 'ui-verifier') {
      if (!all.length) return call('browser_goto', { url: 'http://127.0.0.1/' });
      assert.equal(all[0].isError, true);
      assert.match(JSON.stringify(all[0]), /private|non-public|localhost/i);
      if (all.length === 1) return call('browser_close', {});
      assert(!all[1].isError, JSON.stringify(all[1]));
    } else {
      assert(all.every(m => !m.isError), JSON.stringify(all));
      if (role === 'researcher') assert.match(JSON.stringify(all), /SYNTHETIC_UPSTREAM_EVIDENCE/);
    }
    fs.writeFileSync(path.join(home, role + '-proof.json'), JSON.stringify({ pid: process.pid, saved, active, results: all }));
    return fauxAssistantMessage(role + '_DONE');
  };
  for (const [name, id] of [['project-faux', 'inherited'], ['openai', 'gpt-6.1-sol']]) {
    const faux = fauxProvider({ provider: name, models: [{ id, reasoning: true }] });
    faux.setResponses(Array.from({ length: 120 }, () => respond));
    pi.registerProvider(faux.provider);
  }
}
