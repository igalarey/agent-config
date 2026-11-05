# Vulnerability Categories — Detection Guidance

Patterns are investigation leads, not categorical findings. Trace attacker control and effective defenses before reporting.
A safer pattern still needs application-specific authorization, limits, and configuration review.

## SQL Injection

| Aspect | Detail |
|--------|--------|
| **Vulnerable** | String interpolation in SQL queries: `f"SELECT * FROM users WHERE id = {uid}"` |
| **CWE** | CWE-89 (SQL Injection) |
| **Fixtures** | `fixtures/CWE-89-sqli-positive.py` (flag) · `fixtures/CWE-89-sqli-negative.py` (pass) |
| **Safe** | Parameterized queries / ORM: `cursor.execute("SELECT * FROM users WHERE id = %s", (uid,))` |
| **Look for** | f-strings, `+` concatenation, `format()` in query builders; raw SQL in ORM `.raw()` / `.execute()` |
| **False-positive guard** | Trace whether HTTP params, files, environment variables, or CLI args can affect query structure. Bound values are not injection by themselves. |

## Cross-Site Scripting (XSS)

| Aspect | Detail |
|--------|--------|
| **Vulnerable** | `element.innerHTML = userInput`, `dangerouslySetInnerHTML={{__html: userInput}}` |
| **CWE** | CWE-79 (Cross-site Scripting) |
| **Fixtures** | `fixtures/CWE-79-xss-positive.js` (flag) · `fixtures/CWE-79-xss-negative.js` (pass) |
| **Safe** | `element.textContent = userInput`, React JSX (auto-escaped), template engines with auto-escaping |
| **Look for** | `.innerHTML`, `document.write()`, `dangerouslySetInnerHTML`, `v-html` (Vue), `bypassSecurityTrustHtml` (Angular) |
| **False-positive guard** | Verify the actual rendering context and escape behavior. Auto-escaping is not a universal defense for URLs or DOM operations. |

## Server-Side Request Forgery (SSRF)

| Aspect | Detail |
|--------|--------|
| **Vulnerable** | User-controlled URL passed to server-side HTTP client: `requests.get(user_url)` |
| **Safe** | URL allowlist validation, internal-network blocking, protocol/host restriction |
| **Look for** | User input → `fetch`, `requests.get`, `axios.get`, `urllib`, `curl`, `http.get`; check privileged fixed-host paths as well as host control, redirects, DNS, and protocols |

## Command Injection

| Aspect | Detail |
|--------|--------|
| **Vulnerable** | User input in shell commands: `os.system(f"ping {host}")`, `subprocess.run(f"grep {pattern} file", shell=True)` |
| **Safe** | Avoid the shell with an argument list. Also validate options and the target program's argument semantics; quoting alone is context-dependent. |
| **Look for** | `shell=True`, `os.system`, `os.popen`, `exec()`, `eval()`, `$()`, backticks |
| **False-positive guard** | Shell scripts without untrusted user input are generally not exploitable. |

## Authentication/Authorization Bypass

| Aspect | Detail |
|--------|--------|
| **Vulnerable** | Missing auth check on protected endpoint; JWT without signature verification; hardcoded admin tokens |
| **Safe** | Consistent auth middleware; JWT with `RS256`/`HS256` verification; role-based access control |
| **Look for** | Routes without auth decorators; `@login_required` / `@require_auth` missing; JWT without `.verify()`; client-side auth checks only |

## Unsafe Deserialization

| Aspect | Detail |
|--------|--------|
| **Vulnerable** | Untrusted pickle deserialization, unsafe YAML loaders, `eval(input())`, or unrestricted model loading |
| **Safer** | Use JSON with schema and size validation, or a safe YAML loader. Never unpickle untrusted data. |
| **Look for** | `pickle.load`, unsafe `yaml.load`, `torch.load(weights_only=False)`, `eval`, `marshal.load`, `node-serialize` |

`pickle.load` has no `weights_only` option. `torch.load(..., weights_only=True)` is a PyTorch restriction, not a pickle feature.
Check the installed PyTorch version and advisories before relying on it. It does not make arbitrary model files safe.
`JSON.parse()` and `json.loads()` do not execute code by themselves.
A parsed object can still reach unsafe merges, templates, queries, or authorization decisions. Validate those uses and resource limits.

## Path Traversal

| Aspect | Detail |
|--------|--------|
| **Vulnerable** | User input in file paths: `open(f"/data/{filename}")`, `path.join(base, user_path)` |
| **Safe** | Resolve paths and use component-aware containment, not string prefixes. See the example below; use an allowlist when practical. |
| **Look for** | `open()`, `read_file()`, `os.path.join` with user input; traversal, symlink escapes, and check/use races |

```python
from pathlib import Path

base = Path("/srv/data").resolve(strict=True)
candidate = (base / user_path).resolve(strict=True)
if not candidate.is_relative_to(base):
    raise ValueError("path outside data directory")
```

This rejects sibling prefixes such as `/srv/data-other` and existing symlinks that resolve outside `base`.
It is not a filesystem sandbox: an attacker can replace a path or ancestor after validation.
For writes or attacker-writable trees, use descriptor-relative operations and platform-specific no-follow restrictions.
Validate parent directories and create files exclusively where needed. Do not treat lexical containment as symlink protection.

## Insecure Direct Object Reference (IDOR)

| Aspect | Detail |
|--------|--------|
| **Vulnerable** | API endpoint uses user-supplied ID without ownership check: `GET /api/order/{order_id}` — returns any user's order |
| **Safe** | Ownership verification: verify `order.user_id == current_user.id` before returning data |
| **Look for** | CRUD endpoints that accept IDs without authorization; horizontal/vertical privilege checks missing |

## Weak Cryptography

| Aspect | Detail |
|--------|--------|
| **Vulnerable** | MD5/SHA1 for passwords; ECB mode; hardcoded keys; `random` module (not `secrets`); short key lengths |
| **Safe** | `bcrypt`/`argon2` for passwords; AES-GCM; `secrets` module; RSA 2048+; proper IV generation |
| **Look for** | `md5`, `sha1`, `DES`, `ECB`, `PKCS1_v1_5`, `random` for crypto, hardcoded `key=`, `Crypto.Cipher` without AEAD |

## Secrets Exposure

| Aspect | Detail |
|--------|--------|
| **Vulnerable** | Hardcoded API keys, passwords, tokens in source code; secrets in logs; secrets in client-side code |
| **Safe** | Environment variables; secret manager (AWS Secrets Manager, HashiCorp Vault); `.env` excluded from VCS |
| **Look for** | `API_KEY=`, `password=`, `secret=`, `token=` in code; AWS keys, GitHub tokens, Stripe keys, JWTs in source |
| **False-positive guard** | Check storage permissions and actual readers. URLs can contain tokens, signed parameters, credentials, and private data; redact before logging. |

## Template Injection (SSTI)

| Aspect | Detail |
|--------|--------|
| **Vulnerable** | User input in template rendering: `Template(user_input).render()`, `render_template_string(user_input)` |
| **Safe** | Static templates; input passed as context variable, not template string |
| **Look for** | `render_template_string`, `Template()()` with user string; `eval` in template context; `${user_input}` in JS template literals on server |

## NoSQL Injection

| Aspect | Detail |
|--------|--------|
| **Vulnerable** | User input in MongoDB queries: `db.users.find({username: user_input})` where input is `{"$gt": ""}` |
| **Safe** | Schema validation; type checking on query params; ORM sanitization |
| **Look for** | MongoDB `$where`, `$gt`, `$regex` from user input; raw mongo queries without type coercion |
