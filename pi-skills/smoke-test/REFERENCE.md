# Smoke Test Reference

This skill contains no HTTP runner. Use a permitted tool already exposed in the session,
or an existing project runner after reviewing it. Tool availability does not grant network permission.

## Example checklist

These are illustrative targets and assertions, not installed configuration:

| Name | Path | Expected status | Content signal | Optional limit |
|------|------|-----------------|----------------|----------------|
| Homepage | `/` | 200 | A stable page title | 3000 ms |
| API health | `/api/health` | 200 | A documented healthy state | 1000 ms |
| Not found | `/nonexistent` | 404 | The application's error marker | None |

Prefer small, read-only health endpoints. Do not crawl the application or invoke business operations.
Review optional project configuration rather than assuming its endpoints are safe.
Validate the final URL after redirects. A login page with status 200 does not prove the protected endpoint works.

## Evidence template

```text
Target: https://example.com/api/health
Expected: HTTP 200, body contains "healthy"
Observed: <actual status, final URL, and assertion result>
Timing: <measured duration or unavailable>
Outcome: PASS | FAIL | BLOCKED
Limits: <network/tool constraints and untested behavior>
```

A cached or extracted document can support a content check but cannot prove a fresh HTTP status.
If the tool omits raw status, headers, or timing, mark those assertions blocked.
If the tool cannot reach the host, distinguish access restrictions from observed application errors.

## Side effects and data

Do not deploy before a health check. An existing deployment is sufficient.
Do not retry indefinitely, reset data, submit forms, or add test accounts.
Authentication, private hosts, and state-changing actions need separate authorization.
Keep response evidence minimal and redact secrets. Persist logs only when the user requests an artifact.
