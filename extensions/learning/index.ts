import { Type } from '@earendil-works/pi-ai';
import { getAgentDir, type ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { createStore } from './store.mjs';
import { join, resolve } from 'node:path';

const reviewInstruction = (focus: string) => `Review ONLY this current conversation for genuinely reusable, TESTED procedural lessons${focus ? ` about ${focus}` : ''}. Do not search session logs, launch background agents, or write memory files. Compare against existing discoverable skills before proposing anything: do not duplicate curated or user skills and do not modify them. A skill is a class-level procedure with ordered steps, concrete tools and verified pitfalls, not a one-off incident or an untested workaround. Include the actual evidence from this conversation (not a guess), a concise summary, and a complete single-file SKILL.md. If no new tested lesson is worth saving, report "Nothing to learn" and do not call a tool. If one qualifies, call learning_propose to stage it for human review; never claim it is approved or installed. Only learned-* names are valid. The human must run /learn approve ID in interactive TUI to publish it.`;

export default function learning(pi: ExtensionAPI) {
  const checkCollision = (name: string) => {
    const target = resolve(join(getAgentDir(), 'skills', 'learned', name, 'SKILL.md'));
    const matches = pi.getCommands().filter(command => command.source === 'skill' && command.name === `skill:${name}`);
    if (matches.some(command => !command.sourceInfo?.path || resolve(command.sourceInfo.path) !== target)) {
      throw new Error('Learned skill name collides with an existing discoverable skill');
    }
  };
  pi.registerTool({
    name: 'learning_propose', label: 'Propose learning',
    description: 'Stage one evidence-backed single-file SKILL.md proposal for human review. Does not install or approve any skill.',
    parameters: Type.Object({
      name: Type.String({ description: 'Skill name learned-<slug>, matching SKILL.md frontmatter' }),
      content: Type.String({ description: 'Full SKILL.md with exactly name and description frontmatter lines. Use plain description text or a JSON-quoted string.' }),
      summary: Type.String({ description: 'One concise summary of the reusable tested lesson' }),
      evidence: Type.String({ description: 'Specific observed test/verification in the current conversation' }),
    }),
    async execute(_id, params, _signal, _update, ctx) {
      checkCollision(params.name);
      const { id } = await createStore(getAgentDir()).stage({ ...params, sessionId: ctx.sessionManager.getSessionId(), cwd: ctx.cwd });
      return { content: [{ type: 'text', text: `Staged ${id}; not installed. Human review: /learn show ${id}, then /learn approve ${id} in interactive TUI.` }], details: { id } };
    },
  });

  pi.registerCommand('learn', {
    description: 'Review this conversation, list/show proposals, or interactively approve/reject one',
    handler: async (raw, ctx) => {
      const args = (raw || '').trim();
      const store = createStore(getAgentDir());
      try {
        if (!args || args === 'review' || args.startsWith('review ')) {
          const focus = args.startsWith('review ') ? args.slice(7).trim() : '';
          if (focus.length > 200) throw new Error('Review focus too long');
          pi.sendUserMessage(reviewInstruction(focus));
          return;
        }
        if (args === 'pending') {
          const records = await store.list();
          ctx.ui.notify(records.length ? records.map(r => `${r.id} ${r.name}: ${r.summary} (${r.cwd}, session ${r.sessionId})`).join('\n') : 'No pending learning proposals.', 'info');
          return;
        }
        const match = /^(show|approve|reject) ([a-f0-9]{24})$/.exec(args);
        if (!match) throw new Error('Use /learn [review [focus]|pending|show ID|approve ID|reject ID]');
        const [, action, id] = match;
        if (action !== 'show' && ctx.mode !== 'tui') throw new Error('Approval and rejection require interactive TUI');
        const record = await store.get(id);
        const review = `Proposal ${id}\nName: ${record.name}\nSummary: ${record.summary}\nEvidence: ${record.evidence}\nProject: ${record.cwd}\nSession: ${record.sessionId}\nExpected existing SHA256: ${record.expectedHash || '(new skill)'}\n\nFull SKILL.md:\n${record.content}`;
        if (action === 'show') {
          if (ctx.mode === 'tui') await ctx.ui.editor(`Learning proposal ${id} (view only; edits are ignored)`, review);
          else ctx.ui.notify(review, 'info');
          return;
        }
        if (action === 'approve') {
          checkCollision(record.name);
          const displayed = await ctx.ui.editor(`Review entire proposal ${id}; leave unchanged to continue`, review);
          if (displayed !== review) { ctx.ui.notify('Cancelled: preview dismissed or edited; nothing installed.', 'warning'); return; }
          if (!await ctx.ui.confirm(`Approve learning ${id}?`, `Install ${record.name} exactly as previewed?`)) { ctx.ui.notify('Cancelled; proposal remains pending.', 'info'); return; }
          checkCollision(record.name);
          const path = await store.approve(id, record.digest);
          ctx.ui.notify(`Approved ${path}. Run /reload to discover the skill.`, 'info');
        } else {
          if (!await ctx.ui.confirm(`Reject learning ${id}?`, `Discard pending ${record.name}?`)) { ctx.ui.notify('Cancelled; proposal remains pending.', 'info'); return; }
          await store.reject(id, record.digest);
          ctx.ui.notify(`Rejected proposal ${id}.`, 'info');
        }
      } catch (error) {
        ctx.ui.notify(`Learning: ${error instanceof Error ? error.message : String(error)}`, 'error');
      }
    },
  });
}
