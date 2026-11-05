import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { validateSkills } from '../scripts/validate-skills.mjs';

const repo = resolve(import.meta.dirname, '..');
function fixture(t, body = '') {
  const root = mkdtempSync(join(tmpdir(), 'skill-validation-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  function put(name, text) {
    const file = join(root, name);
    mkdirSync(resolve(file, '..'), { recursive: true });
    writeFileSync(file, text);
  }
  put('example/SKILL.md', `---\nname: example\ndescription: A focused example procedure.\n---\n# Example\n${body}\n`);
  return { root, put };
}

test('valid local assets and references do not require arbitrary project/example paths', t => {
  const { root, put } = fixture(t, [
    '[Reference](REFERENCE.md#usage)', '[Runner][runner]', '[Docs](https://example.com/docs)',
    '[Email](mailto:example@example.com)', '[Section](#example)',
    '`scripts/check.py`', 'Optional project material: `specs/adr/`, `CONVENTIONS.md`, `src/input.json`.',
    'Example output: `/tmp/result.json` and `specs/contracts/users.yaml`.',
    '```md', '[Illustrative link](not-installed.md)', '```',
    '[runner]: scripts/check.py "Runner"',
  ].join('\n'));
  put('example/REFERENCE.md', '# Reference\n## Usage\n');
  put('example/scripts/check.py', 'print("ok")\n');
  assert.deepEqual(validateSkills(root), []);
});

test('missing inline, reference-style, and bundled code-span assets fail deterministically', t => {
  const { root, put } = fixture(t, '[Missing](missing.md)\n[Other][absent]\n`./scripts/check.py`\n![Image](assets/grid.png)');
  put('example/REFERENCE.md', 'Read `fixtures/case.js` and `REFERENCE-more.md`.\n');
  const errors = validateSkills(root);
  assert.equal(errors.length, 6, JSON.stringify(errors));
  assert.match(errors.join('\n'), /missing\.md/);
  assert.match(errors.join('\n'), /absent/);
  assert.match(errors.join('\n'), /scripts\/check\.py/);
  assert.match(errors.join('\n'), /assets\/grid\.png/);
  assert.match(errors.join('\n'), /fixtures\/case\.js/);
  assert.match(errors.join('\n'), /REFERENCE-more\.md/);
  assert.deepEqual(errors, validateSkills(root));
  assert.deepEqual(errors, [...errors].sort());
});

test('commands resolve bundled script paths without treating example project inputs as assets', t => {
  const { root, put } = fixture(t, 'Run `python3 scripts/check.py input.json --strict`.\nRun `node scripts/missing.js` when needed.');
  put('example/scripts/check.py', 'print("ok")\n');
  const errors = validateSkills(root);
  assert.equal(errors.length, 1, JSON.stringify(errors));
  assert.match(errors[0], /scripts\/missing\.js/);
});

test('local links cannot escape the curated root or follow symlinks', t => {
  const { root, put } = fixture(t, '[Escape](../../outside.md)\n[Encoded](%2e%2e/%2e%2e/outside.md)\n[Alias](alias.md)');
  put('outside-target.md', '# Outside\n');
  symlinkSync(join(root, 'outside-target.md'), join(root, 'example/alias.md'));
  const errors = validateSkills(root).join('\n');
  assert.match(errors, /outside.*escapes|escapes.*outside/);
  assert.match(errors, /alias\.md.*symlink|symlink.*alias\.md/);
});

test('legacy dependencies are rejected in skill bodies, auxiliaries, and bundled scripts', t => {
  const { root, put } = fixture(t, 'Run `bash scripts/lib/doc-fetch-cache.sh get key`.');
  put('example/REFERENCE.md', 'Use WebFetch and spawn 3+ sub-agents using Task tool.\n');
  put('example/scripts/run.js', 'const host = "pub.hyperagent.com";\n');
  const errors = validateSkills(root).join('\n');
  for (const token of ['doc-fetch-cache', 'WebFetch', 'Task tool', 'pub.hyperagent.com']) {
    assert.ok(errors.includes(token), errors);
  }
});

test('invalid or mismatched skill frontmatter is rejected', t => {
  const { root, put } = fixture(t);
  put('example/SKILL.md', '---\nname: wrong\ndescription: ""\n---\n# Example\n');
  const errors = validateSkills(root).join('\n');
  assert.match(errors, /name/);
  assert.match(errors, /description/);
  put('example/SKILL.md', '# No frontmatter\n');
  assert.match(validateSkills(root).join('\n'), /frontmatter/);
});

test('repository skills pass standalone validation and CLI failure uses a nonzero exit', t => {
  assert.deepEqual(validateSkills(join(repo, 'pi-skills')), []);
  const { root } = fixture(t, '[Missing](missing.md)');
  const result = spawnSync(process.execPath, [join(repo, 'scripts/validate-skills.mjs'), root], { encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /missing\.md/);
});

test('grid verifier can load in the repository ESM context without requiring a browser', () => {
  const result = spawnSync(process.execPath, [join(repo, 'pi-skills/align-grid/scripts/verify_grid.js'), '--help'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /CHROME.*PUP/s);
});

test('grid scaffold is deterministic and contains no remote assets', () => {
  const command = [join(repo, 'pi-skills/align-grid/scripts/grid_tokens.py'), '--scaffold'];
  const first = spawnSync('python3', command, { encoding: 'utf8' });
  const second = spawnSync('python3', command, { encoding: 'utf8' });
  assert.equal(first.status, 0, first.stderr);
  assert.equal(first.stdout, second.stdout);
  assert.doesNotMatch(first.stdout, /https?:\/\//);
  assert.match(first.stdout, /grid-template-columns:subgrid/);
  assert.match(first.stdout, /actualBoundingBoxLeft/);
});
