import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { root, readJSON } from './install.mjs';

const EXACT = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const NAME = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/;
const json = value => JSON.stringify(value, null, 2) + '\n';

export function parseSpec(spec) {
  const at = spec.lastIndexOf('@');
  const name = at > 0 ? spec.slice(0, at) : spec, version = at > 0 ? spec.slice(at + 1) : undefined;
  if (!NAME.test(name)) throw new Error(`Invalid npm package name: ${name}`);
  if (version !== undefined && !EXACT.test(version)) throw new Error(`Version must be exact, not a range: ${version}`);
  return { name, version };
}

export function addNative({ name, version }, { dir = root, run = spawnSync } = {}) {
  const npm = (args, cwd) => {
    const result = run('npm', args, { cwd, encoding: 'utf8', shell: process.platform === 'win32' });
    if (result.status !== 0) throw new Error(`npm ${args.join(' ')} failed: ${result.stderr || result.error?.message}`);
    return result.stdout;
  };
  const exact = version ?? JSON.parse(npm(['view', name, 'version', '--json'], dir));
  if (!EXACT.test(exact)) throw new Error(`Registry returned a non-exact version: ${exact}`);

  const nativeDir = path.join(dir, 'native'), manifestPath = path.join(nativeDir, 'package.json');
  const settingsPath = path.join(dir, 'config/pi.settings.json');
  const manifest = readJSON(manifestPath), settings = readJSON(settingsPath);
  const entry = `npm:${name}@${exact}`;
  const matches = value => (typeof value === 'string' ? value : value?.source)?.match(/^npm:(.+)@[^@]+$/)?.[1] === name;
  manifest.dependencies = Object.fromEntries(Object.entries({ ...manifest.dependencies, [name]: exact })
    .sort(([a], [b]) => a.localeCompare(b)));
  const index = settings.packages.findIndex(matches);
  if (index === -1) settings.packages.push(entry);
  else if (typeof settings.packages[index] === 'string') settings.packages[index] = entry;
  else settings.packages[index] = { ...settings.packages[index], source: entry };

  fs.writeFileSync(manifestPath, json(manifest));
  fs.writeFileSync(settingsPath, json(settings));
  npm(['install', '--package-lock-only', '--legacy-peer-deps', '--ignore-scripts'], nativeDir);
  return entry;
}

export function main(argv = process.argv.slice(2)) {
  if (argv.length !== 1 || argv[0].startsWith('--')) {
    console.log('Usage: npm run add-native -- <package>[@exact-version]');
    return argv.includes('--help') ? 0 : 1;
  }
  const entry = addNative(parseSpec(argv[0]));
  console.log(`Pinned ${entry} in native/package.json, native/package-lock.json and config/pi.settings.json.`);
  console.log('Next: npm test, commit, npm run pin-recipe, commit the recipe, then npm run bootstrap -- --source-map <map> --apply.');
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
