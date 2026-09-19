import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, lstatSync } from "node:fs";
import { relative } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const repo = new URL("..", import.meta.url);
const root = new URL("pi-skills/", repo);
const manifestPath = new URL("manifests/curated-skills.json", repo);
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const skillNames = [
  "align-grid", "context7-mcp", "security-review", "design-interface",
  "deepen-architecture", "elaborate-spec", "grill-me", "define-language",
  "diagnose-root", "enforce-first", "edit-document", "simple-english",
  "smoke-test", "validate-contracts",
];
const expectedFiles = [
  "LICENSE.bigpowers",
  "align-grid/SKILL.md", "align-grid/scripts/grid_tokens.py", "align-grid/scripts/verify_grid.js",
  "context7-mcp/SKILL.md",
  "deepen-architecture/DEEPENING.md", "deepen-architecture/INTERFACE-DESIGN.md",
  "deepen-architecture/LANGUAGE.md", "deepen-architecture/SKILL.md",
  "define-language/SKILL.md", "design-interface/SKILL.md", "diagnose-root/SKILL.md",
  "edit-document/SKILL.md", "elaborate-spec/SKILL.md", "enforce-first/SKILL.md",
  "grill-me/REFERENCE.md", "grill-me/SKILL.md",
  "security-review/REFERENCE-confidence-rubric.md", "security-review/REFERENCE-false-positives.md",
  "security-review/REFERENCE-vuln-categories.md", "security-review/SKILL.md",
  "security-review/fixtures/CWE-639-idor-negative.go", "security-review/fixtures/CWE-639-idor-positive.go",
  "security-review/fixtures/CWE-79-xss-negative.js", "security-review/fixtures/CWE-79-xss-positive.js",
  "security-review/fixtures/CWE-89-sqli-negative.py", "security-review/fixtures/CWE-89-sqli-positive.py",
  "security-review/fixtures/CWE-fail-open-verify-negative.sh", "security-review/fixtures/CWE-fail-open-verify-positive.sh",
  "simple-english/REFERENCE.md", "simple-english/SKILL.md", "simple-english/scripts/ste_lint.py",
  "smoke-test/REFERENCE.md", "smoke-test/SKILL.md",
  "validate-contracts/REFERENCE.md", "validate-contracts/SKILL.md",
].sort();

function allFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = new URL(`${entry.name}${entry.isDirectory() ? "/" : ""}`, directory);
    return entry.isDirectory() ? allFiles(path) : [path];
  });
}

function relativeFile(path) {
  return relative(fileURLToPath(root), fileURLToPath(path)).replaceAll("\\", "/");
}

test("curated skill manifest, files, hashes, and provenance are sealed", () => {
  assert.equal(manifest.schemaVersion, 1);
  assert.deepEqual(manifest.skills, skillNames);
  assert.deepEqual(Object.keys(manifest.files).sort(), expectedFiles);
  assert.deepEqual(manifest.source, {
    package: "bigpowers",
    version: "2.88.6",
    repository: "https://github.com/danielvm-git/bigpowers.git",
    integrity: "sha512-+Kkb1A3S0pfCspfoAj74jJWYlPI4fdICpOcozWf/1oKCaV9fatTo/gqjxLg35xK3kdM8TwoJfW2O9RGOddt60Q==",
    license: "MIT",
  });

  const actualFiles = allFiles(root).map(relativeFile).sort();
  assert.deepEqual(actualFiles, expectedFiles);
  for (const [name, expectedHash] of Object.entries(manifest.files)) {
    const bytes = readFileSync(new URL(name, root));
    assert.equal(createHash("sha256").update(bytes).digest("hex"), expectedHash, name);
    assert.equal(bytes.includes(0), false, `${name} must be text`);
    assert.doesNotMatch(name, /(^|\/)(node_modules|\.git|__pycache__|cache|caches)(\/|$)|(^|\/)(\.env|auth\.json|sessions?)(\/|$)|\.(?:exe|dll|so|dylib|node|bin|zip|tgz)$/i);
    assert.doesNotMatch(bytes.toString("utf8"), /\b(?:\/home\/|\/Users\/|[A-Za-z]:[\\/]|~\/(?:\.pi|\.agents))/);
    assert.equal(lstatSync(new URL(name, root)).isSymbolicLink(), false, `${name} must not be a symlink`);
  }

  const license = readFileSync(new URL("LICENSE.bigpowers", root), "utf8");
  assert.match(license, /^MIT License\n/);
  assert.match(license, /Copyright \(c\) 2026 Daniel VM/);
  assert.equal(manifest.source.license, "MIT");
  for (const name of skillNames) {
    const text = readFileSync(new URL(`${name}/SKILL.md`, root), "utf8");
    const frontmatter = text.match(/^---\n([\s\S]*?)\n---\n/);
    assert.ok(frontmatter, `${name}/SKILL.md must have frontmatter`);
    assert.match(frontmatter[1], new RegExp(`^name:\\s*${name.replace("-", "\\-")}\\s*$`, "m"));
    assert.match(frontmatter[1], /^description:/m);
  }
});
