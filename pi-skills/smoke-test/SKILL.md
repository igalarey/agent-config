---
name: smoke-test
phase: verify
model: sonnet
effort: standard
description: Check an existing deployment's health when the user requests a smoke test or health check. A URL alone does not trigger testing, deployment, or repair.
compatibility: Requires an available, permitted HTTP or browser tool. A project test runner is optional; none is bundled.
---

# Smoke Test

Check an existing deployment without changing it.
Never deploy, restart, migrate, publish, or repair as part of this skill.
A smoke-test request does not authorize credentials, private destinations, or state-changing remote actions.
Use only authorized targets and read-only endpoints. Even a GET can have application side effects, so inspect the endpoint's purpose.

## Prepare checks

Use the URL and expectations from the request or existing project configuration.
An optional project checklist can supply paths, expected status, body signals, and time limits.
No particular YAML file or repository runner is required.
Do not create persistent configuration or logs unless requested.

For each check, establish:

| Field | Meaning |
|-------|---------|
| Target | Existing base URL and read-only endpoint |
| Expected status | Exact HTTP status, not merely a successful tool call |
| Content signal | A stable string or explicit regex in the response, when relevant |
| Time limit | Optional measured threshold, not a guessed latency |
| Redirect policy | Whether a redirect is expected and which final origin is allowed |

See [REFERENCE.md](REFERENCE.md) for examples and failure interpretation.

## Run and assess

1. Inspect the current tool inventory and network permissions.
2. Use an available HTTP/browser tool that exposes the required response fields.
3. If the project supplies a runner, inspect its behavior and dependencies before using it under the same permissions.
4. Record the observed status, final URL, content assertion, and measured timing when available.
5. Report pass, fail, or blocked for each check. An unavailable status or timing field is not a pass.

Do not install a client or use shell networking to bypass an unavailable or restricted network tool.
Use bounded requests and timeouts where the tool permits them. Report retries rather than hiding an initial failure.
Do not print credentials, signed URLs, cookies, or private response bodies.

## Report

Give the target without secrets, checks performed, observations, and limitations.
A status mismatch, missing configured signal, or measured timeout fails that check.
A failed check indicates an unhealthy or unreachable path, not necessarily a broken deployment.
Separate application failures from DNS, TLS, access-policy, and tooling failures.
A passing smoke test covers only the tested paths. It does not prove overall correctness or authorize a release.
