import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { root, readJSON } from './install.mjs';
import { validateRecipe } from './bootstrap.mjs';

export function pinRecipe({ dir = root, head, nodeVersion = process.version } = {}) {
  if (!head) {
    const status = spawnSync('git', ['status', '--porcelain'], { cwd: dir, encoding: 'utf8' });
    if (status.status !== 0) throw new Error('git status failed');
    if (status.stdout.trim()) throw new Error('Commit source changes before pinning the recipe');
    head = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: dir, encoding: 'utf8' }).stdout.trim();
  }
  const recipePath = path.join(dir, 'manifests/active-release.json');
  const recipe = readJSON(recipePath);
  const { piVersion } = readJSON(path.join(dir, 'manifests/packages.json'));
  const sources = { ...recipe.sources, harness: head };
  const next = {
    ...recipe,
    release: `h-${sources.harness.slice(0, 12)}-s-${sources.subagents.slice(0, 12)}-m-${sources.memory.slice(0, 12)}`,
    piVersion,
    runtime: { ...recipe.runtime, node: nodeVersion },
    sources,
  };
  validateRecipe(next, { nodeVersion });
  fs.writeFileSync(recipePath, JSON.stringify(next, null, 2) + '\n');
  return next;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const recipe = pinRecipe();
    console.log(`Recipe pinned to ${recipe.release} (Pi ${recipe.piVersion}, Node ${recipe.runtime.node}). Commit it before bootstrap.`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
