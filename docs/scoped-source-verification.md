# Scoped source, candidate, and activation verification

This public document records local verification and activation, not a reproducible release from a fresh public clone.
Private backup identifiers and preservation-baseline paths are omitted. Technical source hashes remain unchanged.
See the [public snapshot limits](../README.md#public-snapshot-status) before attempting reproduction.

The coordinator activated `h-8388fb58ea11-s-21628a941dbc-m-35275b8ce08a` after verification and review of the three-write plan.
Verified payload: harness `8388fb58ea115811ef164ece79282d5f89cbe03d`, native `21628a941dbcca3678d659e722b5a8fd10f18105`.
Recipe commit `7ae5e7f` selects that payload, not the later recipe or documentation HEAD. This receipt requires no rebuild or reseal.

## Public-source verification prerequisite

The current integration fixture requires public coordinator commit `58b02fa776fe4bc0d9aca6ad0b3b3f5a6b9320c4`, not the historical private coordinator commit.
Only its README differs from the historical coordinator tree. Runtime, profile, and test bytes and modes remain unchanged.
The native and memory source pins remain unchanged. Exact native export hashes, file modes, provider paths, and candidate runner bindings remain mandatory.
Use a clean checkout of the required coordinator commit. Do not use an installed coordinator checkout with a different HEAD.

The existing input regression first rejected the public coordinator, then passed after the exact pin change.
All three focused tests passed. The root suite passed 213 tests with seven skips.
The source-export combined fixture passed with 82 native files validated. The coordinator suite passed 37 tests with one historical skip.
These are source checks, not verification or activation of a new candidate.
The recipe still selects the earlier local harness until a new candidate passes verification and receives an explicit source-commit pin.

## SQLite lineage mutex activation receipt

The coordinator completed official verification and candidate acceptance before activation:

| Check | Observed result | Local log |
| --- | --- | --- |
| Official preparation and locked cache-only dependencies | Passed | `.git/sqlite-final-prepare.log`, `.git/sqlite-final-deps.log` |
| Official verification | 14 package, 5 runtime, 1 composition gates passed | `.git/sqlite-final-verify.log` |
| Candidate combined fixture | 1 passed, coordinator 37 passed with 1 historical skip | `.git/sqlite-final-combined.log` |
| Activation | Exactly 3 writes: settings package paths, harness inventory, managed state | `.git/sqlite-activation.log` |
| Installed doctor | Integrity, verification, and compatibility valid. 0 conflicts, 0 pending writes | `.git/sqlite-installed-doctor.log` |
| Repeat plan | 0 changes | `.git/sqlite-installed-repeat-plan.log` |

The coordinator retained a private activation backup. Its identifier is omitted from this public receipt.
The coordinator reports matching protected hashes from its private preservation baseline.
SYSTEM, applicable auth/model/MCP files, Luna hook, and all eight specialist files remain unchanged.
Both coordinator symlinks and settings excluding `packages` remain unchanged. The installed profile set still contains nine profiles.
No profile or resource deletion occurred. This document contains no private file contents.

The activated revision fixes the demonstrated crash-held mutex mechanism. Native crash-boundary tests verify release after process death without fence deletion.
The exact cause of the historical cancellation incident remains unattributed. This result does not establish that every cancellation failure is fixed.
Existing Pi processes were not restarted. They need a restart to load the new runtime.
This receipt establishes no fresh visual UI, live authentication, browser, or quota evidence.

### Candidate provenance

The earlier candidate `h-215b137db10b-s-21628a941dbc-m-35275b8ce08a` passed 14 package, five runtime, and one composition gates.
Its combined fixture correctly refused the native provenance mismatch, recorded in `.git/sqlite-candidate-combined.log`.
That candidate remains bound to its original harness. It is not evidence for this updated fixture and must not receive a patched runner.
Exact source bytes, executable modes, provider paths, and candidate runner bindings remain mandatory.
The coordinator and memory pins are unchanged. The final candidate passed verification before the recipe pin and activation.

### Protocol compatibility

Native lineage mutation now uses `node:sqlite` as a crash-released mutex, not as the accounting store.
The JSON ledger, generation-tokened leases, launch counts, and conservative reconciliation remain authoritative.
Process death releases the SQLite transaction lock. It does not refund a recorded launch or fabricate completion.

The root creates a permanent `<ledger>.lock/` fence with `protocol.json` and `mutex.sqlite` for protocol 2.
Only root initialization can create this fence, including for an unfenced legacy JSON ledger without resetting its accounting.
Inherited descendants cannot initialize or migrate it.
Legacy lock directories, incomplete initialization, unknown protocols, missing databases, and invalid file identities fail closed.
There is no automatic repair, stale-fence deletion, or fallback locking backend.

Older runtimes refuse the permanent fence even when no transaction is active. Transparent in-flight rollback is unsupported.
After all owning processes stop, back up the JSON ledger and complete fence together.
Do not delete or replace the fence or database to force an older runtime to enter.
A managed release rollback does not reverse this lineage protocol boundary. Interrupted initialization requires explicit investigation.

The pinned Node 22.23.2 runtime exposes built-in SQLite 3.51.3 and labels it experimental.
Existing mandatory native PTY launches exercise the mutex, so no duplicate host gate was added.
The release source prefix includes the new mutex module. Read-only inspection confirmed its exact Git bytes in the earlier candidate.
Windows execution, network-filesystem locking, and machine power-loss durability remain unverified.
The mutex requires a local filesystem with SQLite locking support. Identity checks are not a same-user filesystem sandbox.

### Source evidence

The focused export regression failed before the pin update, then all three focused tests passed.
The full root suite passed 213 tests with seven existing skips.
The exact-Git-export combined fixture passed with 82 files validated. Its coordinator suite passed 37 tests with one historical skip.
Logs: `.git/sqlite-source-{red,green,host,full,combined}.log`.
These are source results, not activation evidence or a fresh visual UI/authentication test.

## Five-profile retirement activation receipt

The coordinator completed verification and reviewed the exact eight-change plan before activation.
The receipt records these local logs:

| Check | Observed result | Local log |
| --- | --- | --- |
| Official preparation and locked cache-only dependencies | Passed | `.git/legacy-candidate-prepare.log`, `.git/legacy-candidate-deps.log` |
| Official verification | 14 package, 5 runtime, 1 composition gates passed | `.git/legacy-candidate-verify.log` |
| Candidate combined fixture | 1 passed, coordinator 37 passed with 1 historical skip | `.git/legacy-candidate-combined.log` |
| Activation | Exactly 8 changes: 5 owned profile deletions, settings package paths, harness inventory, managed state | `.git/legacy-activation.log` |
| Installed doctor | Integrity, verification, and compatibility valid. 0 conflicts, 0 pending writes | `.git/legacy-installed-doctor.log` |
| Repeat plan | 0 changes | `.git/legacy-installed-repeat-plan.log` |

The coordinator retained a private activation backup. Its identifier is omitted from this public receipt.
The coordinator verified exactly nine installed `agents/*.md` profiles: `project-worker` plus the eight scoped specialists.
The five retired names are absent from that installed profile set.

The coordinator reports a passing private hash-only preservation baseline.
It confirms unchanged SYSTEM, applicable private auth/model/MCP files, Luna hook, and all eight specialist files.
Both coordinator symlinks and settings excluding `packages` remain unchanged. This document contains no private file contents.

Existing Pi processes were not restarted. They still need a restart to load the current configuration.
This receipt establishes no fresh UI, live authentication, browser, or quota evidence.
That historical release used the older lock protocol. The current SQLite activation receipt records its replacement and compatibility limits.

## Historical verified widget successor

Coordinator-produced logs were inspected before this recipe pin:

| Check | Observed result | Local log |
| --- | --- | --- |
| Official cache-only locked dependencies | Passed; lifecycle scripts disabled | `.git/widget-candidate-deps.log` |
| Official verification | 14 package, 5 runtime, 1 composition gates passed | `.git/widget-candidate-verify.log` |
| Candidate combined against original coordinator | 1 passed; coordinator 37 passed, 1 historical skip; `officialVerification: true` | `.git/widget-candidate-combined.log` |

The coordinator reports all commands exited zero and accepts this bounded successor with the known intermittent cancellation risk below.
The source pin changed neither candidate payloads nor verification runners. The coordinator subsequently activated the release after plan review.

## Historical widget successor activation receipt

The following coordinator-produced logs were inspected for this documentation-only receipt:

| Check | Observed result | Local log |
| --- | --- | --- |
| Activation | Passed; 3 changes: settings package paths, harness inventory, managed state | `.git/widget-activation.log` |
| Installed doctor | Integrity, verification, and compatibility valid; 0 conflicts, 0 pending writes | `.git/widget-installed-doctor.log` |
| Repeat plan | 0 planned changes; no writes | `.git/widget-installed-repeat-plan.log` |

The coordinator retained a private activation backup. Its identifier is omitted from this public receipt.
Unit coverage verifies Herdr widget suppression and process-backend widget retention/reinstallation; official runtime gates passed.
Current Pi processes need a restart. No fresh visual Herdr-widget screenshot has been recorded yet.
These results do not establish live authentication, browser, or quota behavior, or resolve the intermittent cancellation risk below.

The coordinator separately reports the personal-agents sidebar live-verified across three levels.
That independent result does not verify this widget or the native adaptive grid, which remains a separate ongoing task.
This receipt changes no runtime, recipe, candidate, or installed state.

## Historical scoped candidate evidence

The preceding scoped candidate was `h-9b178e5eecd9-s-c3bf79369295-m-35275b8ce08a`.
The following logs were inspected for its earlier source pin:

| Check | Observed result | Local log |
| --- | --- | --- |
| Official cache-only locked dependencies | Passed; lifecycle scripts disabled | `.git/scoped-candidate-deps.log` |
| Official package/typecheck suites | 14 passed | `.git/scoped-candidate-verify.log` |
| Official runtime gates | 5 passed | Same verification log |
| Official composition gate | 1 passed | Same verification log |
| Candidate-path combined fixture | 1 passed; `officialVerification: true` | `.git/scoped-candidate-combined.log` |
| Included external coordinator suite | 37 passed, 1 historical skip, 0 failed | Same combined log |

These are candidate-path results, distinct from the source-mode checks below.
Installer fixes `028ff5b` and `3007681` are separately committed tooling for guarded forward migration and exact rollback.
They changed neither recorded verification runners nor candidate payloads; the candidate retains its original source pins.

## Historical scoped activation receipt

The coordinator activated the same managed release after candidate verification.
The following coordinator-produced logs were inspected for this documentation update:

| Check | Observed result | Local log |
| --- | --- | --- |
| Managed activation | 16 changes applied | `.git/scoped-activation.log` |
| Installed doctor | Integrity and verification valid; 0 conflicts, 0 pending writes; compatibility valid | `.git/scoped-installed-doctor.log` |
| Repeat installation plan | 0 planned changes; no writes | `.git/scoped-installed-repeat-plan.log` |
| Fresh official SDK discovery | Eight installed specialists plus project-worker and its eight allowed targets | `.git/scoped-installed-discovery.log` |

The coordinator retained a private activation backup. Its identifier is omitted from this public receipt.
The coordinator reports original project-sessions `master` integrated at `ce4f826` and clean.
The coordinator also reports a passing protected hash-only baseline for SYSTEM, auth, keybindings, MCP and web configuration,
non-package settings, and project symlinks. No protected contents are reproduced here.

Installed discovery used an explicit extension subset, disposable HOME, and empty in-memory auth.
It made zero model calls and zero network calls; it was not a full ambient parent or interactive UI test.
The existing parent requires a Pi restart to load the new runtime.
These checks provide no live authentication, browser, subscription-quota, or server-granted priority evidence.
This receipt records coordinator actions; the documentation update changes no runtime, recipe, candidate, or installed state.

## Representative scenario

`test/fixtures/scoped-integration.mjs` checks the final native and coordinator source commits before execution.
It uses the official Pi SDK and real PTY children, actual managed profiles, and actual curated skill files.
The coordinator dispatches worker, researcher, and ui-verifier sequentially, below the two-child ceiling.
The eight specialist profiles also receive metadata checks.

The researcher executes the real pinned pi-web-access `web_search` implementation against synthetic Brave responses.
The browser executes private-address refusal and context closure without launching a browser.
Synthetic model registrations retain the profiles' provider/model identifiers; they do not establish authenticated model behavior.

Assertions cover exact active tools, native controls, leaf non-delegation, named catalogs, ambient extension exclusion,
malicious cwd skill exclusion, inherited extension binding paths, and unchanged coordinator loadout on process resume.
The resumed coordinator retains completed child history rather than launching duplicate children.
This does not establish a separate specialist-resume lifecycle.

The coordinator suite supplies independent-project, cancellation, descendant drain, capacity, and restart coverage.
Its historical-runtime test remains skipped unless the historical artifact is supplied.
No coordinator production code is modified.

Repository-local fixtures need two isolation adaptations:

- An invalid temporary `.git` boundary prevents non-repository cases from discovering this enclosing checkout.
- A fixture-only `project_trust` refusal prevents the real home's ancestor skills from opening an interactive trust prompt.

The latter adaptation applies to the disposable coordinator provider copy, not its assertions or production implementation.
A code comment beside this setup records why it exists.

## Source export and provenance

Default source mode rejects a dirty native or coordinator checkout.
`PI_SCOPED_SOURCE_EXPORT=1` explicitly exports the pinned native Git tree inside the disposable repository-local fixture directory.
It does not normalize or stage the original checkout.

The fixture records these operations and their absolute arguments:

```sh
git -C "$NATIVE_REPOSITORY" archive --format=tar "$NATIVE_COMMIT" | tar -xf - -C "$EXPORT"
ln -s "$NATIVE_REPOSITORY/node_modules" "$EXPORT/node_modules"
```

Every exported tracked file must match its Git blob hash and executable mode before loading and after the combined suite.
The receipt includes the commit, tree hash, file count, dependency link, and resolved dependency target.
This link is source-test evidence only, never official candidate dependency preparation.
Candidate mode rejects the export flag.

## Reproduce

From the harness root, supply existing dependency locations:

```sh
PI_SCOPED_SOURCE_EXPORT=1 \
PI_SCOPED_COORDINATOR=/existing/clean/public-coordinator \
PI_BROWSER_DEPENDENCIES=/existing/browser/node_modules \
PI_RESEARCH_UPSTREAM_PACKAGE=/existing/node_modules/pi-web-access \
node --test test/fixtures/scoped-integration.mjs
npm test
```

Browser package tests and typecheck remain separately reproducible through `test/fixtures/browser-source.mjs`.
No fixture installs dependencies or accesses live websites.

## Historical widget successor source preparation

The widget successor introduced suppression of only the redundant Herdr subagent-status widget.
The process-backend widget and coordination controls remain in the native source contract.
The coordinator activated that successor before profile retirement. Those source checks did not establish live visual widget behavior.
Herdr personal sidebar and native app grid changes are outside this work.

The fixture still requires one exact native commit, Git blob bytes and modes, and the existing capability/provider gates.
Historical release validation is unchanged. Historical candidate E2E must use its matching pinned harness fixture, not this successor fixture.
No provenance allowlist, parser refusal, or exact-provider assertion is relaxed.

Source checks passed: three focused input/export tests and the root suite (211 passed, seven existing skips).
The first combined run passed the scoped-provider scenario but failed the coordinator cancellation case with a lineage-lock timeout.
An unchanged repeat passed the combined test and coordinator suite (37 passed, one historical skip).
Both logs are retained as `.git/scoped-successor-combined.log` and `.git/scoped-successor-combined-repeat.log`.
The subsequent widget candidate and original-coordinator combined checks passed. Those reruns did not identify or fix the intermittent failure.
The native diagnosis found consistency with forced-kill interruption leaving an ownerless lineage lock. The exact historical interruption remains unproven.
Lock/cancellation code was unchanged in that widget successor. The later SQLite revision fixes the separately demonstrated crash-held mutex mechanism.
The Herdr widget condition is not exercised by the process-backend fixture; the faux-interactive trust change is unrelated to that cancellation path.
The native investigation subsequently produced the SQLite successor described in its dedicated section. Historical reruns did not establish that the race was resolved.

## Five-profile retirement implementation

The user authorized removal of exactly `Explore`, `Plan`, `general-purpose`, `deep-implementation`, and `deep-review`.
The installer now permits their exact forward removal and inverse restoration between verified scoped interactive releases.
All twelve scoped introduction resources must remain present on both sides, and settings keys must not change.
Partial, mixed, or additional resource changes involving those names cannot bypass the guard through `--migrate-base`.

Disposable release regressions cover owned-file removal, backups, inverse rollback, idempotence, modified/unowned-file refusal,
and preservation of the eight specialists, Luna hook, private policy/auth/history/Learning/extensions/settings, and coordinator symlink.
Rollback refuses unowned replacements even when their bytes match the historical profile.
These are installer fixture checks, not verification of a retirement candidate.

The five active source profiles have now moved byte-for-byte into `test/fixtures/legacy-profiles`, outside release resource prefixes.
Only the eight scoped specialists remain in `agents/`; the Luna hook remains unchanged and project-worker remains separately owned.
The coordinator verified and activated the retirement candidate, as recorded in the five-profile retirement receipt.

The official interactive gate now launches all eight scoped profiles through real Pi PTYs and retains a separately exercised historical five-profile branch.
It checks exact model/thinking serialization, identity, active/registered tool scopes, selective catalog prompts and paths,
frozen extension bindings, saved loadouts, launch arguments, readiness/settlement, cancellation, and process isolation.
Delegate inherits the fixture parent's explicitly selected synthetic `openai/gpt-6.1-sol` medium model; this changes no installed default.
Research child loading uses the candidate's native dependency prefix projected into the disposable smoke home, with no personal dependency fallback.
Missing browser/research backing remains a hard failure. Actual upstream research execution, browser refusal/close,
and unchanged coordinator resume remain covered by the separate combined fixture, not replaced with mocked launches.

During profile retirement, the native and coordinator provenance pins stayed unchanged. The runtime gate change required a new candidate and verification bound to its runner hash.
The coordinator completed that verification and combined acceptance with the same committed harness fixture.
Do not rerun these new runners against an old candidate's pinned harness or patch its seal.
Historical sealed-release validation and the exact-five ownership-strict inverse installer guard remain intact.
Source evidence for this retirement: root suite 213 passed, seven existing skips; both modern eight-profile and historical five-profile PTY cases passed.
The source-export combined scenario passed, including original coordinator tests (37 passed, one historical skip).
Logs: `.git/legacy-final-full.log`, `.git/legacy-scoped-runtime-final.log`, and `.git/legacy-scoped-combined.log`.
These source results are distinct from the official candidate and activation evidence in the five-profile retirement receipt.
The coordinator marked shared retirement todo 5 complete after verification of actual activation.

## Candidate reproduction procedure

The release pipeline has three source slots: harness, subagents, and memory.
Coordinator remains separately owned; its integration pin is checked by the source fixture, not invented as a fourth recipe source.
Keep the installed recipe unchanged until candidate evidence is reviewed.

The following describes preparation of a new, unsealed candidate by the coordinator.
For a successor, explicitly set `H` to the reviewed committed harness SHA and `S` to the reviewed native SHA before these commands.
Otherwise the commands default to the recipe, not tooling HEAD. Never re-prepare the existing activated release.
Keep the recipe unchanged until successor candidate evidence is reviewed.

```sh
H=${H:-$(node -p "require('./manifests/active-release.json').sources.harness")}
S=${S:-$(node -p "require('./manifests/active-release.json').sources.subagents")}
M=$(node -p "require('./manifests/active-release.json').sources.memory")
CH="$HOME"
ID="h-${H:0:12}-s-${S:0:12}-m-${M:0:12}"
npm run release -- --home "$CH" \
  --harness-repo "$PWD" --harness-commit "$H" \
  --subagents-repo "$PWD/../pi-interactive-subagents" --subagents-commit "$S" \
  --memory-repo "$PWD/../pi-observational-memory" --memory-commit "$M"
```

Review the preview, then repeat that exact release command with `--apply` to prepare committed source only.
Do not run `bootstrap --apply`, installer `apply`, or projection commands.

The installer permits exactly eight scoped profiles, their license, and three research provider files to be added or removed.
Both releases must use the interactive runtime and unchanged settings keys, with no extra or mixed resource changes.
The selected release must pass existing verification and integrity checks.
Rollback removes only tracked, unmodified paths and creates backups; private conflicts refuse the entire operation.
Shared policy, private state, and coordinator-owned symlinks remain preserved.
Neither direction needs `--migrate-base`; no other reverse shape migration is authorized.

A rollback preview selects the verified predecessor saved before activation:

```sh
npm run plan -- --home "$CH" --release "$PREVIOUS_RELEASE"
```

Only after separate rollback authorization, use the same arguments with `npm run apply`.
Do not restore modified or untracked files automatically to make rollback pass.

Managed release rollback leaves the independently installed project-sessions checkout and profile symlink unchanged.
Its upgraded coordinator intentionally refuses older runtimes.
Restoring prior coordinator behavior requires a separately coordinated source checkout rollback; release selection does not restore both owners.

The supported dependency pipeline uses locked `npm ci`, not arbitrary node_modules copying or fabricated dependency reports.
A cache-only attempt can use an isolated copy of the existing content-addressed cache:

```sh
CACHE="$CH/.agent-config/candidate-cache/$ID"
mkdir -p "$CACHE/home"
cp -a "$CH/.npm/_cacache" "$CACHE/_cacache"
: > "$CACHE/empty.npmrc"
npm run deps -- --home "$CH" --release "$ID"
env -i PATH="$PATH" HOME="$CACHE/home" \
  npm_config_userconfig="$CACHE/empty.npmrc" npm_config_globalconfig=/dev/null \
  npm_config_cache="$CACHE" npm_config_offline=true \
  npm_config_audit=false npm_config_fund=false npm_config_update_notifier=false \
  npm run deps -- --home "$CH" --release "$ID" --apply
npm run verify -- --home "$CH" --release "$ID" --apply
```

The recorded candidate completed cache-only preparation; cache availability for future reproduction remains environment-specific.
Stop on cache misses; do not fetch dependencies or substitute unverified trees.
The dependency stage prepares both development and reduced runtime trees with lifecycle scripts disabled.
Verification must produce real successful reports before any activation decision.

## Mandatory gate and separate candidate acceptance

Official verification now requires scoped evidence for candidates containing the canonical-profile notice.
The existing `runtime:supplemental-tool-execution` report stores `details.scopedCapabilities`.
It checks all four native markers, all eight scoped leaf profiles, exact effective tools, selective catalogs,
research/browser backing availability, and preserved `ask_question` controls.
Missing evidence fails verification and later release validation. Historical releases without the canonical marker retain their previous gates.
Runner hashes, source integrity, and dependency/runtime digests retain their existing authority.

The externally owned coordinator lifecycle E2E remains a separate acceptance step.
Set `COORDINATOR` to the absolute path of the clean public coordinator checkout required by the current fixture:

```sh
C="$CH/.agent-config/releases/$ID"
env -u PI_SCOPED_SOURCE_EXPORT -u PI_BROWSER_DEPENDENCIES \
  PI_SCOPED_CANDIDATE="$C" \
  PI_SCOPED_HARNESS_COMMIT="$H" \
  PI_SCOPED_NATIVE="$C/packages/pi-interactive-subagents/pi-extension/subagents" \
  PI_SCOPED_BROWSER="$C/packages/pi-browser" \
  PI_RESEARCH_UPSTREAM_PACKAGE="$C/native/node_modules/pi-web-access" \
  PI_SCOPED_COORDINATOR="$COORDINATOR" \
  node --test test/fixtures/scoped-integration.mjs
```

Candidate mode validates official source/dependency reports and exact harness/native/memory commits before loading anything.
A passed official verification report is additionally validated when present; otherwise the receipt explicitly records `officialVerification: false`.
The fixture runner must match the pinned harness Git blobs, and coordinator source must be clean at its expected commit.
Actual candidate native/browser/research entrypoints and upstream dependencies are used directly, without copying or substituting source providers.
Profiles, skills, and personal configuration project only into disposable test homes; candidate files and seals remain unchanged.
Partial candidate inputs, external dependency paths, provenance mismatches, and source-export flags fail closed.

Keep both the official verification report and the separate combined acceptance log before reviewing activation.
Neither a standalone metadata gate nor source-mode success establishes candidate E2E success.
