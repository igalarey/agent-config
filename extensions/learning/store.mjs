import { randomBytes, createHash } from 'node:crypto';
import * as fs from 'node:fs';
import { join, dirname, resolve } from 'node:path';

const ID = /^[a-f0-9]{24}$/;
const NAME = /^learned-[a-z0-9]+(?:-[a-z0-9]+)*$/;
const sha = text => createHash('sha256').update(text).digest('hex');
const owned = (name, hash, proposalId, previousHash = null) => JSON.stringify({ name, hash, proposalId, previousHash });
const safeName = name => {
  if (typeof name !== 'string' || name.length > 64 || !NAME.test(name)) throw new Error('Invalid learned skill name');
};
const safeId = id => { if (typeof id !== 'string' || !ID.test(id)) throw new Error('Invalid proposal id'); };
const unsafe = text => /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069]/u.test(text);
const secret = /(?:sk-(?:proj-)?[a-z0-9_-]{20,}|sk[_-](?:test|live)[_-][a-z0-9]{20,}|(?:api[_-]?key|access[_-]?token|password|secret)\s*[:=]\s*['"]?[^\s'"]{20,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|gh[pousr]_[A-Za-z0-9]{20,})/i;
function checkText(text, label, max) {
  if (typeof text !== 'string' || !text.trim() || Buffer.byteLength(text) > max || unsafe(text)) throw new Error(`Invalid or unsafe ${label}`);
  if (secret.test(text)) throw new Error(`Possible secret in ${label}`);
}
function validate(input) {
  safeName(input.name);
  checkText(input.content, 'content', 16384);
  checkText(input.summary, 'summary', 400);
  checkText(input.evidence, 'evidence', 1200);
  checkText(input.sessionId, 'session id', 256);
  checkText(input.cwd, 'project cwd', 1024);
  const match = /^---\n([^]*?)\n---\n/.exec(input.content);
  if (!match || Buffer.byteLength(match[1]) > 2048) throw new Error('Invalid SKILL.md frontmatter');
  const lines = match[1].split('\n');
  const names = lines.filter(line => /^name:/.test(line));
  const descriptions = lines.filter(line => /^description:/.test(line));
  if (lines.length !== 2 || names.length !== 1 || names[0] !== `name: ${input.name}` || descriptions.length !== 1) throw new Error('Frontmatter name/description invalid');
  const scalar = descriptions[0].slice('description:'.length).trim();
  let description = scalar;
  if (scalar.startsWith('"')) {
    try { description = JSON.parse(scalar); } catch { throw new Error('Invalid skill description'); }
  } else if (!/^[a-z]/i.test(scalar) || /[:#\[\]{}"']/.test(scalar) || /^(?:true|false|null|yes|no|on|off)$/i.test(scalar)) {
    throw new Error('Invalid skill description; use plain text or a JSON-quoted string');
  }
  if (typeof description !== 'string' || !description.trim() || description.length > 1024 || unsafe(description)) throw new Error('Invalid skill description');
  if (!input.content.slice(match[0].length).trim()) throw new Error('Empty skill procedure');
}
function directory(path, create = false) {
  for (let parent = dirname(resolve(path)); parent !== dirname(parent); parent = dirname(parent)) {
    if (fs.lstatSync(parent).isSymbolicLink()) throw new Error(`Unsafe symlink ancestor: ${parent}`);
  }
  try {
    const st = fs.lstatSync(path);
    if (!st.isDirectory() || st.isSymbolicLink()) throw new Error(`Unsafe directory: ${path}`);
  } catch (error) {
    if (error.code !== 'ENOENT' || !create) throw error;
    fs.mkdirSync(path, { mode: 0o700 });
  }
}
function file(path, limit = 25000) {
  const fd = fs.openSync(path, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  try {
    const st = fs.fstatSync(fd);
    if (!st.isFile() || st.size > limit) throw new Error('Corrupt or oversized file');
    return fs.readFileSync(fd, 'utf8');
  } finally { fs.closeSync(fd); }
}
function exclusive(path, data) {
  fs.writeFileSync(path, data, { flag: 'wx', mode: 0o600 });
}

export function createStore(agentDir) {
  const learning = join(agentDir, 'learning');
  const pending = join(learning, 'pending');
  const skills = join(agentDir, 'skills');
  const learned = join(skills, 'learned');
  function roots(create = false) {
    directory(agentDir);
    if (create || fs.existsSync(learning)) directory(learning, create);
    if (create || fs.existsSync(pending)) directory(pending, create);
  }
  function skillRoots(create = false) {
    directory(agentDir);
    if (create || fs.existsSync(skills)) directory(skills, create);
    if (create || fs.existsSync(learned)) directory(learned, create);
  }
  function target(name) {
    safeName(name);
    skillRoots();
    const dir = join(learned, name);
    if (fs.existsSync(dir)) directory(dir);
    return { dir, path: join(dir, 'SKILL.md'), marker: join(dir, '.learning-owner.json') };
  }
  function existing(name) {
    const { dir, path, marker } = target(name);
    if (!fs.existsSync(dir)) return null;
    let content, meta;
    try { content = file(path, 16384); meta = JSON.parse(file(marker, 512)); }
    catch { throw new Error('Unowned or corrupt learned skill target'); }
    const keys = Object.keys(meta).sort().join(',');
    const currentHash = sha(content);
    const validMarker = keys === 'hash,name' || (keys === 'hash,name,previousHash,proposalId'
      && ID.test(meta.proposalId) && (meta.previousHash === null || /^[a-f0-9]{64}$/.test(meta.previousHash)));
    if (!validMarker || meta.name !== name || !/^[a-f0-9]{64}$/.test(meta.hash)
      || (meta.hash !== currentHash && meta.previousHash !== currentHash)) throw new Error('Unowned or changed learned skill target');
    return { content, hash: currentHash, proposalId: meta.proposalId };
  }
  function record(id) {
    safeId(id);
    roots();
    if (!fs.existsSync(pending)) throw new Error('Unknown proposal id');
    let data;
    try { data = JSON.parse(file(join(pending, `${id}.json`))); }
    catch (error) { if (error.code === 'ENOENT') throw new Error('Unknown proposal id'); throw new Error('Corrupt proposal record'); }
    const { digest, ...fields } = data;
    if (Object.keys(fields).sort().join(',') !== 'content,cwd,evidence,expectedHash,id,name,sessionId,summary' || fields.id !== id || (fields.expectedHash !== null && !/^[a-f0-9]{64}$/.test(fields.expectedHash)) || digest !== sha(JSON.stringify(fields))) throw new Error('Corrupt proposal record');
    try { validate(fields); } catch { throw new Error('Corrupt proposal record'); }
    return data;
  }
  function lock(action) {
    roots(true);
    const path = join(learning, '.lock');
    try { fs.mkdirSync(path, { mode: 0o700 }); }
    catch (error) { if (error.code === 'EEXIST') throw new Error('Learning store busy; retry after the other operation finishes'); throw error; }
    try { return action(); } finally { fs.rmdirSync(path); }
  }
  return {
    async stage(input) {
      validate(input);
      return lock(() => {
        const current = existing(input.name);
        const id = randomBytes(12).toString('hex');
        const fields = { id, name: input.name, content: input.content, summary: input.summary, evidence: input.evidence, sessionId: input.sessionId, cwd: input.cwd, expectedHash: current?.hash ?? null };
        const data = { ...fields, digest: sha(JSON.stringify(fields)) };
        exclusive(join(pending, `${id}.json`), JSON.stringify(data));
        return { id, digest: data.digest };
      });
    },
    async get(id) { return record(id); },
    async list() {
      roots();
      if (!fs.existsSync(pending)) return [];
      return fs.readdirSync(pending).filter(name => name.endsWith('.json')).map(name => record(name.slice(0, -5)));
    },
    async reject(id, previewDigest) {
      safeId(id);
      return lock(() => {
        const data = record(id);
        if (previewDigest !== undefined && previewDigest !== data.digest) throw new Error('Proposal changed after preview');
        fs.unlinkSync(join(pending, `${id}.json`));
      });
    },
    async approve(id, previewDigest) {
      safeId(id);
      return lock(() => {
        const data = record(id);
        if (previewDigest !== data.digest) throw new Error('Proposal changed after preview');
        const current = existing(data.name);
        const { dir, path, marker } = target(data.name);
        if (current?.proposalId === id && current.hash === sha(data.content)) {
          fs.unlinkSync(join(pending, `${id}.json`));
          return path;
        }
        if ((current?.hash ?? null) !== data.expectedHash) throw new Error('Stale proposal: target changed');
        skillRoots(true);
        if (!current) {
          const prepared = join(learned, `.publish-${id}-${randomBytes(8).toString('hex')}`);
          fs.mkdirSync(prepared, { mode: 0o700 });
          try {
            exclusive(join(prepared, 'SKILL.md'), data.content);
            exclusive(join(prepared, '.learning-owner.json'), owned(data.name, sha(data.content), id));
            fs.renameSync(prepared, dir);
          } finally {
            if (fs.existsSync(prepared)) fs.rmSync(prepared, { recursive: true });
          }
        } else {
          const next = join(dir, `.skill-${randomBytes(8).toString('hex')}.tmp`);
          const nextMarker = join(dir, `.owner-${randomBytes(8).toString('hex')}.tmp`);
          try {
            exclusive(next, data.content);
            exclusive(nextMarker, owned(data.name, sha(data.content), id, current.hash));
            if (existing(data.name)?.hash !== data.expectedHash) throw new Error('Stale target changed');
            fs.renameSync(nextMarker, marker);
            fs.renameSync(next, path);
          } finally {
            for (const temp of [next, nextMarker]) if (fs.existsSync(temp)) fs.unlinkSync(temp);
          }
        }
        fs.unlinkSync(join(pending, `${id}.json`));
        return path;
      });
    },
  };
}
