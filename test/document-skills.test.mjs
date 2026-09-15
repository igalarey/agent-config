import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const root = path.resolve(import.meta.dirname, '..');
const analyzePath = path.join(root, 'skills/analyze-sessions/scripts/analyze-sessions.mjs');
const youtubePath = path.join(root, 'skills/youtube-transcript/scripts/youtube_transcript.py');
const pdfPath = path.join(root, 'skills/pdf-reader/scripts/pdf_reader.py');

function temp(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-config-skills-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}

function session(file, { id, role = 'user', text = 'prompt', model = 'gpt-6-astra', cost = 0.1 }) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, [
    { type: 'session', id, cwd: 'C:/work/project', timestamp: '2026-09-05T20:00:00Z' },
    { type: 'message', message: { role: 'user', timestamp: Date.now(), content: [{ type: 'text', text }] } },
    { type: 'message', message: { role: 'assistant', provider: 'openai-codex', model, timestamp: Date.now(), usage: { input: 10, output: 2, cost: { total: cost } }, content: [{ type: 'thinking', thinking: 'PRIVATE_REASONING' }, { type: 'text', text: role }] } },
  ].map(value => JSON.stringify(value)).join('\n') + '\n');
}

test('analyze-sessions recognizes harness sidecars and hides thinking by default', async t => {
  const directory = temp(t);
  const main = path.join(directory, 'main.jsonl'), child = path.join(directory, 'child.jsonl');
  session(main, { id: 'aaaaaaaa-main', text: 'main prompt', cost: 0.2 });
  session(child, { id: 'bbbbbbbb-child', text: 'child prompt', cost: 0.3 });
  fs.writeFileSync(`${child}.loadout.json`, '{}');
  const { run } = await import(`${pathToFileURL(analyzePath).href}?${Date.now()}`);
  const listed = run(['list', '--root', directory, '--provider', 'openai-codex']);
  assert.match(listed, /aaaaaaaa/);
  assert.doesNotMatch(listed, /bbbbbbbb/);
  assert.match(run(['list', '--root', directory, '--include-subagents']), /bbbbbbbb/);
  const shown = run(['show', 'aaaaaaaa', '--root', directory]);
  assert.match(shown, /main prompt/);
  assert.doesNotMatch(shown, /PRIVATE_REASONING/);
  assert.match(run(['show', 'aaaaaaaa', '--root', directory, '--include-thinking']), /PRIVATE_REASONING/);
  assert.match(run(['cost', '--root', directory, '--include-subagents', '--by', 'provider']), /\$0\.50|\$0\.5000/);
});

test('Python skill helpers validate ranges, hosts, captions, and real PDF operations when available', t => {
  const directory = temp(t);
  const script = String.raw`
import importlib.util, json, os

def load(name, filename):
    spec = importlib.util.spec_from_file_location(name, filename)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

y = load('youtube_tool', os.environ['YOUTUBE_TOOL'])
p = load('pdf_tool', os.environ['PDF_TOOL'])
assert y.normalize_video('dQw4w9WgXcQ')[0] == 'dQw4w9WgXcQ'
assert y.normalize_video('https://youtu.be/dQw4w9WgXcQ?t=1')[0] == 'dQw4w9WgXcQ'
try:
    y.normalize_video('https://youtube.com.evil.test/watch?v=dQw4w9WgXcQ')
    raise AssertionError('unsafe host accepted')
except ValueError:
    pass
assert y.choose_language({'subtitles': {'es': []}, 'automatic_captions': {'en': []}}, ['en', 'es']) == ('es', False)
assert y.caption_entries({'events': [{'tStartMs': 1500, 'segs': [{'utf8': 'hello '}, {'utf8': 'world'}]}]}) == [(1.5, 'hello world')]
assert p.parse_pages('1,3-4', 5) == [0, 2, 3]
try:
    p.parse_pages('0', 5)
    raise AssertionError('page zero accepted')
except ValueError:
    pass
try:
    import fitz
except ImportError:
    raise SystemExit(0)
pdf = os.path.join(os.environ['TEMP_DIR'], 'fixture.pdf')
doc = fitz.open(); page = doc.new_page(); page.insert_text((72, 72), 'portable pdf marker'); doc.save(pdf); doc.close()
assert p.info(p.source_path(pdf))['pages'] == 1
assert 'portable pdf marker' in p.extract(p.source_path(pdf), '1')
assert p.search(p.source_path(pdf), 'pdf marker', None, 20)[0]['page'] == 1
rendered = p.render(p.source_path(pdf), '1', 72, os.path.join(os.environ['TEMP_DIR'], 'rendered'))
assert len(rendered) == 1 and os.path.isfile(rendered[0])
`;
  const result = spawnSync('python', ['-c', script], {
    encoding: 'utf8', env: { ...process.env, YOUTUBE_TOOL: youtubePath, PDF_TOOL: pdfPath, TEMP_DIR: directory },
  });
  if (result.error?.code === 'ENOENT') return t.skip('Python is not installed');
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test('new skills have valid frontmatter and do not embed generated environments', () => {
  for (const name of ['pdf-reader', 'youtube-transcript', 'analyze-sessions']) {
    const text = fs.readFileSync(path.join(root, 'skills', name, 'SKILL.md'), 'utf8');
    assert.match(text, /^---\nname: [a-z0-9-]+\ndescription: .+/);
  }
  assert.equal(fs.existsSync(path.join(root, 'skills/pdf-reader/.venv')), false);
});
