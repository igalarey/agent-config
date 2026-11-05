import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { checkCandidateComposition } from '../scripts/candidate-composition.mjs';

test('candidate composition rejects missing skill assets before loading extensions', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'candidate-skills-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'pi-skills/example'), { recursive: true });
  fs.writeFileSync(path.join(root, 'release.json'), JSON.stringify({
    packages: [], files: [{ path: 'scripts/validate-skills.mjs' }],
  }));
  fs.writeFileSync(path.join(root, 'pi-skills/example/SKILL.md'), '---\nname: example\ndescription: Test fixture\n---\n[required asset](references/missing.md)\n');
  await assert.rejects(checkCandidateComposition(root), /missing local asset\/reference/);
  fs.writeFileSync(path.join(root, 'release.json'), JSON.stringify({
    packages: [], files: [{ path: 'pi-skills/example/SKILL.md' }],
  }));
  await assert.rejects(checkCandidateComposition(root), /missing local asset\/reference/);
  fs.mkdirSync(path.join(root, 'pi-skills/example/references'));
  fs.writeFileSync(path.join(root, 'pi-skills/example/references/missing.md'), 'Present fixture\n');
  assert.equal((await checkCandidateComposition(root)).applicable, false);
});
