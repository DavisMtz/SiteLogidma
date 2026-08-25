---
name: web-security
description: Security practices for this Cloudflare Workers + D1 stack — secrets handling, SQL injection prevention, XSS, security headers, CORS, rate limiting, and API token hygiene. Use when writing Worker code that touches user input, the database, authentication, or any outbound credential.
---

# Security — Cloudflare Workers + D1

Applies to every Worker in this repo. The threat model for an edge Worker is
narrow but sharp: it is publicly reachable by default, it holds credentials in
`env`, and it talks to D1.

## Secrets

**Never** put a secret in `wrangler.jsonc` — that file is committed.

| Kind | Where it goes | Committed? |
|---|---|---|
| Secret (API key, token, signing key) | `wrangler secret put NAME` | No |
| Local dev secret | `.dev.vars` | No — gitignored |
| Non-secret config | `vars` in `wrangler.jsonc` | Yes |
| Resource IDs (`database_id`, account ID) | `wrangler.jsonc` | Yes — not secrets |

```bash
npx wrangler secret put SESSION_SIGNING_KEY   # prompts, never echoes
```

Read them off `env`, never from a module-scope constant:

```js
export default {
  async fetch(request, env) {
    const key = env.SESSION_SIGNING_KEY;   // ✅
  },
};
```

If a secret is ever pasted into a chat, a commit, or a log — **rotate it**.
Deleting the message does not undo exposure.

## D1 — always bind, never interpolate

String-built SQL is the single most likely way this app gets breached.

```js
// ❌ SQL injection. `id` is attacker-controlled.
await env.morelia.prepare(`SELECT * FROM tracks WHERE id = '${id}'`).all();

// ✅ Prepared statement with bound parameter.
await env.morelia.prepare("SELECT * FROM tracks WHERE id = ?").bind(id).all();
```

This holds even when the value "looks safe" (a number, an enum, an internal ID).
Bind every user-derived value, every time.

- Use `.first()` when you expect one row — it avoids over-fetching.
- Use `env.morelia.batch([...])` for multi-statement writes so they are atomic.
- Never expose raw D1 error text to the client; it leaks schema.

## Output encoding — XSS

Any user-controlled value interpolated into HTML must be escaped.

```js
const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));

return new Response(`<h1>${escapeHtml(name)}</h1>`, {
  headers: { "content-type": "text/html; charset=utf-8" },
});
```

Prefer `Response.json()` for data and let the client render — it sidesteps the
whole class. Never build HTML from unescaped input, and never `eval` input.

## Security headers

Apply to every HTML response:

```js
const SECURITY_HEADERS = {
  "content-security-policy":
    "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
  "strict-transport-security": "max-age=31536000; includeSubDomains",
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
  "permissions-policy": "geolocation=(), microphone=(), camera=()",
};
```

- `frame-ancestors 'none'` blocks clickjacking (modern replacement for
  `X-Frame-Options`).
- Tighten CSP as the app grows. Avoid `'unsafe-inline'` on `script-src` — if you
  need inline scripts, use a per-request nonce.
- Cloudflare terminates TLS, so HSTS is safe to send.

## CORS

Default to no CORS headers at all. Only add them for endpoints a browser on
another origin must call, and never reflect the caller blindly:

```js
// ❌ Reflecting Origin with credentials defeats the same-origin policy.
"access-control-allow-origin": request.headers.get("Origin")

// ✅ Explicit allowlist.
const ALLOWED = new Set(["https://atarax.logidma.workers.dev"]);
const origin = request.headers.get("Origin");
if (ALLOWED.has(origin)) headers["access-control-allow-origin"] = origin;
```

`access-control-allow-origin: *` must never be combined with credentials.

## Input validation

Validate shape and size at the edge, before touching D1:

```js
if (request.headers.get("content-type") !== "application/json") return new Response("", { status: 415 });
const body = await request.json().catch(() => null);
if (!body || typeof body.title !== "string" || body.title.length > 200) {
  return Response.json({ error: "invalid payload" }, { status: 400 });
}
```

Reject early, cap lengths, allowlist enum values. Never trust `content-length`.

## Rate limiting and abuse

A Worker on a public URL will be scanned. For anything that writes, mutates, or
costs money, gate it — Cloudflare's Rate Limiting rules, a Durable Object
counter, or WAF rules in the dashboard. `CF-Connecting-IP` is the trustworthy
client IP header at Cloudflare's edge; `X-Forwarded-For` is spoofable.

## Errors and logging

```js
try { /* ... */ } catch (err) {
  console.error(err);                                   // goes to `wrangler tail`
  return Response.json({ error: "internal error" }, { status: 500 });  // opaque to client
}
```

Never return stack traces, SQL text, or `env` contents to the client. Never
`console.log` a secret — observability is enabled on this Worker, so logs persist.

## API tokens

- Scope to the **minimum** permissions and to a single account.
- Set a TTL. Rotate after any deploy session where the token was shared.
- Prefer per-purpose tokens over one broad token.
- A token that ever appeared in a chat transcript is compromised — rotate it.

## Dependencies

- `npm audit` before adding anything to the runtime path.
- Pin versions and commit the lockfile.
- Every dependency in a Worker runs on your origin with access to `env`. Prefer
  the platform API over a package.

## Checklist

- [ ] No secrets in `wrangler.jsonc` or any committed file
- [ ] Every D1 query uses `.bind()`, zero string interpolation
- [ ] All user input escaped before entering HTML
- [ ] Security headers on every HTML response
- [ ] CORS absent, or an explicit allowlist
- [ ] Payloads validated for type and length before use
- [ ] Errors opaque to the client, detailed only in logs
- [ ] Write endpoints rate-limited
