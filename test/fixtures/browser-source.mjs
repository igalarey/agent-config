import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { identifyInstalledPiHost, resolvePiHostDependency, runtimeEnvironment } from '../../scripts/runtime-smoke.mjs';

const dependencies = process.env.PI_BROWSER_DEPENDENCIES;
test('public browser package passes isolated scoped-child SDK fixtures and typecheck using existing dependencies', t => {
  assert.ok(dependencies, 'Set PI_BROWSER_DEPENDENCIES to existing browser node_modules; no installation occurs');
  const root = fs.mkdtempSync(path.resolve('.browser-check-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const home = path.join(root, 'home'), agentDir = path.join(home, '.pi/agent'), temp = path.join(root, 'tmp');
  for (const dir of [agentDir, temp]) fs.mkdirSync(dir, { recursive: true });
  const env = runtimeEnvironment(process.env, { home, agentDir, temp, cwd: root });
  env.PI_RUN_BROWSER_TESTS = '0';
  delete env.NODE_TEST_CONTEXT;
  const host = identifyInstalledPiHost('1.5.0', { env });
  const source = path.resolve('vendor/pi-browser');
  const staged = path.join(root, 'browser');
  fs.cpSync(source, staged, { recursive: true, filter: file => !file.split(path.sep).includes('node_modules') });
  const link = (name, target) => {
    const dest = path.join(staged, 'node_modules', name);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.symlinkSync(path.resolve(target), dest, 'dir');
  };
  for (const name of ['ipaddr.js', 'playwright-core']) link(name, path.join(dependencies, name));
  for (const name of ['typebox', '@earendil-works/pi-tui']) link(name, resolvePiHostDependency(host, name));
  link('@earendil-works/pi-coding-agent', host.packageRoot);
  const run = spawnSync(process.execPath, ['--test', 'test/browser.test.mjs', 'test/proxy.test.mjs', 'test/live-browser.test.mjs'], {
    cwd: staged, env, encoding: 'utf8', timeout: 45000,
  });
  assert.equal(run.status, 0, `${run.error ?? ''}\n${run.stdout}\n${run.stderr}`);
  assert.match(run.stdout, /# tests [1-9]/, 'nested browser tests must actually report execution');
  t.diagnostic(run.stdout.slice(-500));
  assert.ok(process.env.PI_BROWSER_TSC, 'PI_BROWSER_TSC must identify an existing TypeScript compiler');
  link('@types/node', path.resolve(path.dirname(process.env.PI_BROWSER_TSC), '../../@types/node'));
  const typed = spawnSync(process.execPath, [path.resolve(process.env.PI_BROWSER_TSC), '--noEmit', '-p', staged], {
    cwd: staged, env, encoding: 'utf8', timeout: 30000,
  });
  assert.equal(typed.status, 0, `${typed.error ?? ''}\n${typed.stdout}\n${typed.stderr}`);
  t.diagnostic('Browser TypeScript check passed without dependency installation');
  fs.unlinkSync(path.join(staged, 'node_modules/playwright-core'));
  const missing = path.join(temp, 'missing.mjs');
  fs.writeFileSync(missing, `import assert from 'node:assert/strict';
import { loadExtensions } from ${JSON.stringify(pathToFileURL(path.join(host.packageRoot, 'dist/core/extensions/loader.js')).href)};
const result = await loadExtensions([${JSON.stringify(path.join(staged, 'index.ts'))}], process.cwd());
assert.equal(result.extensions.length, 0);
assert.match(JSON.stringify(result.errors), /playwright-core/);
console.log('Missing Playwright dependency fails closed');
`);
  const absent = spawnSync(process.execPath, [missing], { cwd: staged, env, encoding: 'utf8', timeout: 30000 });
  assert.equal(absent.status, 0, `${absent.stderr}\n${absent.stdout}`);
  t.diagnostic(absent.stdout.trim());
});
