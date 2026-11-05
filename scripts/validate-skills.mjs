import { lstatSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const forbidden = [
  /\b(?:WebFetch|SearchImages|PublishFilePublicly|PublishWebpage)\b/g,
  /pub\.hyperagent\.com/g,
  /\bTask tool\b/g,
  /\b(?:doc-fetch-cache\.sh|parallel-review-worktrees\.sh|verify-cwe-fixture-sync\.sh|bp-churn-rank\.sh|check-import-boundaries\.sh|run-smoke\.sh|validate-contracts\.sh)\b/g,
  /\bbts docs\b/g,
  /\b(?:grill-with-docs|spike-prototype|model-domain|countable-story-format\.md|SKILL-INDEX\.md)\b/g,
];
const bundled = /^(?:\.\/)?(?:(?:scripts|fixtures|assets|references)\/[^\s<>]+|REFERENCE[^/\s]*\.md)$/;
const inside = (root, target) => {
  const rel = relative(root, target);
  return rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
};

export function validateSkills(directory) {
  const root = resolve(directory);
  const errors = new Set();
  const files = [];
  const report = (file, message) => errors.add(`${relative(root, file).split(sep).join('/') || '.'}: ${message}`);
  function walk(folder) {
    for (const entry of readdirSync(folder, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name, 'en'))) {
      const file = resolve(folder, entry.name);
      if (entry.isSymbolicLink()) report(file, 'symlink is not a bundled asset');
      else if (entry.isDirectory()) walk(file);
      else files.push(file);
    }
  }
  try {
    if (lstatSync(root).isSymbolicLink()) return ['.: skill root must not be a symlink'];
    walk(root);
  } catch (error) {
    return [`.: cannot read skill root (${error.code})`];
  }
  if (!files.some(file => file.endsWith(`${sep}SKILL.md`))) report(root, 'no SKILL.md files');

  function localTarget(file, raw) {
    if (/^(?:[a-z][a-z0-9+.-]*:|#|\/\/)/i.test(raw)) return;
    let target;
    try { target = decodeURIComponent(raw.split(/[?#]/)[0]); }
    catch { report(file, `invalid link encoding: ${raw}`); return; }
    if (!target) return;
    const absolute = resolve(dirname(file), target);
    if (!inside(root, absolute)) { report(file, `local reference escapes skill root: ${raw}`); return; }
    let current = root;
    for (const part of relative(root, absolute).split(sep)) {
      current = resolve(current, part);
      try {
        if (lstatSync(current).isSymbolicLink()) { report(file, `local reference follows symlink: ${raw}`); return; }
      } catch { report(file, `missing local asset/reference: ${raw}`); return; }
    }
  }

  for (const file of files) {
    if (!/\.(?:md|mjs|js|py|sh)$/.test(file)) continue;
    const text = readFileSync(file, 'utf8');
    for (const pattern of forbidden) {
      for (const match of text.matchAll(pattern)) report(file, `forbidden legacy dependency: ${match[0]}`);
    }
    if (!file.endsWith('.md')) continue;
    if (file.endsWith(`${sep}SKILL.md`)) {
      const header = text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)?.[1];
      if (!header) report(file, 'missing frontmatter');
      else {
        const name = header.match(/^name:\s*([^\r\n]+)/m)?.[1]?.trim();
        if (name !== relative(root, dirname(file)).split(sep).at(-1) || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name ?? '') || name.length > 64) {
          report(file, 'skill name must match its directory and use portable syntax');
        }
        const description = header.match(/^description:[ \t]*([^\r\n]*)(?:\r?\n([ \t]+[^\r\n]*(?:\r?\n[ \t]+[^\r\n]*)*))?/m);
        const value = [description?.[1], description?.[2]].filter(Boolean).join(' ').replace(/[>\|'"\s]/g, '');
        if (!value) report(file, 'description must not be empty');
      }
    }
    let fence = null;
    const prose = text.split('\n').map(line => {
      const marker = line.match(/^\s*(`{3,}|~{3,})/);
      if (marker) {
        if (!fence) fence = marker[1];
        else if (marker[1][0] === fence[0] && marker[1].length >= fence.length) fence = null;
        return '';
      }
      return fence ? '' : line;
    }).join('\n');
    const definitions = new Map();
    for (const match of prose.matchAll(/^\s*\[([^\]]+)\]:\s*<?([^\s>]+)>?/gm)) {
      definitions.set(match[1].trim().toLowerCase(), match[2]);
      localTarget(file, match[2]);
    }
    for (const match of prose.matchAll(/!?\[[^\]\n]*\]\(<?([^\s)>]+)>?(?:\s+"[^"\n]*")?\)/g)) localTarget(file, match[1]);
    for (const match of prose.matchAll(/\[([^\]\n]+)\]\[([^\]\n]*)\]/g)) {
      const key = (match[2] || match[1]).trim().toLowerCase();
      if (!definitions.has(key)) report(file, `missing reference-link definition: ${key}`);
    }
    for (const match of prose.matchAll(/`([^`\n]+)`/g)) {
      if (bundled.test(match[1])) localTarget(file, match[1]);
      else if (/^(?:python3?|node|bash|sh|test)\s/.test(match[1])) {
        for (const token of match[1].split(/\s+/)) {
          const target = token.replace(/^['"]|['"]$/g, '');
          if (bundled.test(target)) localTarget(file, target);
        }
      }
    }
  }
  return [...errors].sort();
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const root = process.argv[2] || fileURLToPath(new URL('../pi-skills/', import.meta.url));
  const errors = validateSkills(root);
  if (errors.length) {
    console.error(errors.join('\n'));
    process.exitCode = 1;
  } else console.log('Skill assets, references, and legacy dependencies: PASS');
}
