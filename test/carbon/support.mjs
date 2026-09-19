import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO = fileURLToPath(new URL('../../', import.meta.url));
const require = createRequire(new URL('../../vendor/pi-subscription-usage/package.json', import.meta.url));
const packageRoot = (name, resolver = require) => {
  const root = resolver.resolve.paths(name).map(base => join(base, name))
    .find(candidate => existsSync(join(candidate, 'package.json')));
  if (!root) throw new Error(`Missing ${name}; prepare vendor dependencies before running test:carbon`);
  return root;
};
export const PI_ROOT = packageRoot('@earendil-works/pi-coding-agent');
const coreRequire = createRequire(join(PI_ROOT, 'package.json'));
export const TUI_ROOT = packageRoot('@earendil-works/pi-tui', coreRequire);
export const JITI_ROOT = packageRoot('jiti', coreRequire);
export const resource = path => resolve(REPO, path);
