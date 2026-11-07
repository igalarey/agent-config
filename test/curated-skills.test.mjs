import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, lstatSync, cpSync, mkdtempSync, rmSync } from "node:fs";
import { relative, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import { plan } from "../scripts/install.mjs";
import { validateSkills } from "../scripts/validate-skills.mjs";
import { test } from "node:test";

const repo = new URL("..", import.meta.url);
const root = new URL("pi-skills/", repo);
const manifestPath = new URL("manifests/curated-skills.json", repo);
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const originalSkillNames = [
  "align-grid", "context7-mcp", "security-review", "design-interface",
  "deepen-architecture", "elaborate-spec", "grill-me", "define-language",
  "diagnose-root", "enforce-first", "edit-document", "simple-english",
  "smoke-test", "validate-contracts", "grounded-citations", "simplify-code", "spike", "ast-grep",
];
const originalFiles = [
  "LICENSE.bigpowers", "LICENSE.hermes",
  "grounded-citations/SKILL.md", "simplify-code/SKILL.md", "spike/SKILL.md", "ast-grep/SKILL.md", "ast-grep/LICENSE",
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

const archivedNames = [
  "ast-grep", "define-language", "design-interface", "grill-me", "simplify-code",
  "align-grid", "deepen-architecture", "spike", "validate-contracts",
];
const skillNames = originalSkillNames.filter(name => !archivedNames.includes(name));
const isArchivedFile = name => !name.includes("/") || archivedNames.includes(name.split("/")[0]);
const expectedFiles = originalFiles.filter(name => !name.includes("/") || !isArchivedFile(name));
const archivedFiles = originalFiles.filter(isArchivedFile);
const archiveRoot = new URL("archive/pi-skills/", repo);
const snapshotHash = "07a4b56f4fa2154312d8999e99ba19f6735fdb252fe68a688375f2adf26469de";

function allFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = new URL(`${entry.name}${entry.isDirectory() ? "/" : ""}`, directory);
    return entry.isDirectory() ? allFiles(path) : [path];
  });
}

function relativeFile(path, directory = root) {
  return relative(fileURLToPath(directory), fileURLToPath(path)).replaceAll("\\", "/");
}

function verifyFiles(directory, files, expected) {
  assert.deepEqual(allFiles(directory).map(file => relativeFile(file, directory)).sort(), expected);
  assert.deepEqual(Object.keys(files).sort(), expected);
  for (const [name, expectedHash] of Object.entries(files)) {
    const bytes = readFileSync(new URL(name, directory));
    assert.equal(createHash("sha256").update(bytes).digest("hex"), expectedHash, name);
    assert.equal(bytes.includes(0), false, `${name} must be text`);
    assert.doesNotMatch(name, /(^|\/)(node_modules|\.git|__pycache__|cache|caches)(\/|$)|(^|\/)(\.env|auth\.json|sessions?)(\/|$)|\.(?:exe|dll|so|dylib|node|bin|zip|tgz)$/i);
    assert.doesNotMatch(bytes.toString("utf8"), /\b(?:\/home\/|\/Users\/|[A-Za-z]:[\\/]|~\/(?:\.pi|\.agents))/);
    assert.equal(lstatSync(new URL(name, directory)).isSymbolicLink(), false, `${name} must not be a symlink`);
  }
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

  assert.equal(manifest.skills.length, 9);
  verifyFiles(root, manifest.files, expectedFiles);
  for (const adaptation of manifest.localAdaptations) {
    for (const change of adaptation.changes) {
      assert.ok(change.skills.length > 0);
      assert.ok(change.skills.every(name => skillNames.includes(name)));
    }
  }

  const license = readFileSync(new URL("LICENSE.bigpowers", root), "utf8");
  assert.match(license, /^MIT License\n/);
  assert.match(license, /Copyright \(c\) 2026 Daniel VM/);
  assert.equal(manifest.source.license, "MIT");
  const hermesLicense = readFileSync(new URL("LICENSE.hermes", root), "utf8");
  assert.match(hermesLicense, /Copyright \(c\) 2025 Nous Research/);
  assert.equal(manifest.adaptations.repository, "https://github.com/NousResearch/hermes-agent");
  assert.equal(manifest.adaptations.commit, "47676981f55de91231fdeef2f0eec47e7c209e78");
  assert.deepEqual(Object.keys(manifest.adaptations.skills).sort(),
    ["diagnose-root", "grounded-citations"]);
  for (const [name, provenance] of Object.entries(manifest.adaptations.skills)) {
    assert.match(provenance.path, /^(?:skills|optional-skills)\/[a-z-]+\/[a-z-]+\/SKILL\.md$/);
    assert.match(provenance.sha256, /^[a-f0-9]{64}$/);
    assert.ok(provenance.changes.length > 0, name);
  }
  for (const name of skillNames) {
    const text = readFileSync(new URL(`${name}/SKILL.md`, root), "utf8");
    const frontmatter = text.match(/^---\n([\s\S]*?)\n---\n/);
    assert.ok(frontmatter, `${name}/SKILL.md must have frontmatter`);
    assert.match(frontmatter[1], new RegExp(`^name:\\s*${name.replace("-", "\\-")}\\s*$`, "m"));
    assert.match(frontmatter[1], /^description:/m);
  }
});

test("nine archived skills retain exact original bytes, provenance, licenses, and recoverability", t => {
  const snapshotBytes = readFileSync(new URL("archive/curated-skills.original.json", repo));
  assert.equal(createHash("sha256").update(snapshotBytes).digest("hex"), snapshotHash);
  const original = JSON.parse(snapshotBytes);
  const archived = JSON.parse(readFileSync(new URL("archive/curated-skills.json", repo), "utf8"));
  assert.equal(archived.schemaVersion, 1);
  assert.equal(archived.status, "archived-not-discoverable");
  assert.equal(archived.skillRoot, "pi-skills/");
  assert.deepEqual(archived.skills, archivedNames);
  assert.deepEqual(archived.originalManifest, {
    path: "curated-skills.original.json",
    sha256: snapshotHash,
    sourceCommit: "1b2fa277dd48a008ff9f3826ea556d5931e3be3d",
    sourcePath: "manifests/curated-skills.json",
    scope: "full pre-archive snapshot; includes active and archived skills",
  });
  assert.deepEqual(original.skills, originalSkillNames);
  assert.deepEqual(Object.keys(original.files).sort(), originalFiles);
  assert.deepEqual(archived.files, Object.fromEntries(Object.entries(original.files).filter(([name]) => isArchivedFile(name))));
  assert.deepEqual(manifest.files, Object.fromEntries(Object.entries(original.files).filter(([name]) => expectedFiles.includes(name))));
  assert.deepEqual(manifest.source, original.source);
  assert.deepEqual(manifest.adaptations, {
    ...original.adaptations,
    skills: Object.fromEntries(Object.entries(original.adaptations.skills).filter(([name]) => skillNames.includes(name))),
  });
  assert.deepEqual(manifest.localAdaptations, original.localAdaptations.map(adaptation => ({
    ...adaptation,
    changes: adaptation.changes.map(change => ({ ...change, skills: change.skills.filter(name => skillNames.includes(name)) }))
      .filter(change => change.skills.length > 0),
  })));
  verifyFiles(archiveRoot, archived.files, archivedFiles);
  assert.deepEqual(validateSkills(fileURLToPath(archiveRoot)), []);
  const restored = mkdtempSync(join(tmpdir(), "archived-skills-restore-"));
  t.after(() => rmSync(restored, { recursive: true, force: true }));
  for (const name of [...archivedNames, "LICENSE.bigpowers", "LICENSE.hermes"]) {
    cpSync(new URL(name, archiveRoot), join(restored, name), { recursive: true });
  }
  verifyFiles(pathToFileURL(`${restored}/`), archived.files, archivedFiles);
  assert.deepEqual(validateSkills(restored), []);
});

test("source projection contains exactly nine active skills and no archive resources", t => {
  const home = mkdtempSync(join(tmpdir(), "active-skills-projection-"));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  const pending = plan({ home });
  assert.deepEqual(pending.conflicts, []);
  const prefix = ".pi/agent/skills/";
  const projected = pending.operations.filter(item => item.relative.startsWith(prefix))
    .map(item => item.relative.slice(prefix.length)).sort();
  assert.deepEqual(projected, expectedFiles);
  assert.ok(pending.operations.every(item => !item.relative.includes("archive/")));
  const metadata = JSON.parse(readFileSync(new URL("package.json", repo), "utf8"));
  assert.deepEqual(metadata.pi.skills, ["./skills"]);
  assert.deepEqual(readdirSync(root, { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => entry.name).sort(), [...skillNames].sort());
});
