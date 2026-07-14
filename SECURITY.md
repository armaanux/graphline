# Security

Graphline makes outbound requests to user-controlled and crawler-discovered
hosts and, deployed publicly, spends real search credits — so the network layer,
the API surface, and the abuse controls are hardened accordingly.

## Measures in place

- **SSRF protection.** Every outbound URL is validated before it is fetched
  (`lib/engine/http.ts`): only `http`/`https` on standard ports, and the
  hostname is DNS-resolved and rejected if it maps to a private, loopback,
  link-local, CGNAT, NAT64, or reserved/metadata address (IPv4 and IPv6).
  Redirects are followed manually and **every hop is re-validated**, so a public
  URL cannot bounce the server to an internal one. Username handles are stripped
  to a safe character set before they are interpolated into any platform URL.
- **Session-scoped cases.** Investigations are stored per anonymous session
  (an httpOnly, `SameSite=Lax` cookie). Listing, loading, and deleting only ever
  touch the caller's own cases — one visitor can never read or delete another's
  dossier. Case ids and session ids are strictly format-validated before any
  filesystem access, so the id cannot be used for path traversal.
- **Abuse & cost control** (`lib/ratelimit.ts`, `lib/usage.ts`). The
  investigation endpoint — the only expensive one — enforces: a per-IP burst
  limit, a per-IP daily cap, a global daily budget on the owner's search key
  (past which requests still run, on the free keyless backend, rather than
  draining credits), and a server-wide **concurrency cap** (excess requests get
  `503`). The client IP is taken from trusted platform edge headers rather than
  the client-settable `X-Forwarded-For`. Visitors may supply their own search
  key to bypass the owner budget.
- **Input limits.** Query length is capped; response bodies are truncated;
  every outbound request is time-boxed; a single investigation is bounded
  (`MAX_PIVOTS`, `MAX_DEPTH`).
- **Error handling.** Internal errors are logged server-side; clients receive a
  generic message, never a stack trace or upstream detail.
- **Security headers.** A Content-Security-Policy, `X-Frame-Options: DENY`
  (`frame-ancestors 'none'`), `X-Content-Type-Options: nosniff`,
  `Referrer-Policy`, `Permissions-Policy`, and HSTS ship on every response
  (`next.config.ts`).
- **Secrets.** API keys live in `.env.local`, which is gitignored; the case
  store lives in `.data/`, also gitignored. Only `.env.example` (no secrets) is
  committed. Search keys are read from env / the per-request context and are
  never logged.

## Known limitations

- **Single-instance store & limiters.** The file-based case store and the daily
  usage counters live on disk, and the burst/concurrency limiters live in
  process memory. This is intended for a **single instance**; on multiple
  instances or an ephemeral filesystem they won't share state (limiters reset on
  restart). Back them with a database and a shared store (e.g. Redis) before
  running multi-instance.
- **DNS rebinding.** The SSRF guard resolves and checks the host, but Node's
  `fetch` resolves again independently, so a very-low-TTL domain could in theory
  rebind between the check and the connection. Redirect re-validation and the
  private-IP block still apply on every hop; pinning the validated IP at connect
  time is a planned hardening.
- **CSP `unsafe-inline`.** `script-src` currently allows `'unsafe-inline'`
  (React/Next inline runtime). Moving to nonce-based CSP is a planned
  improvement; all rendered third-party text is treated as data, not markup.
- **No accounts.** There is no user authentication — sessions are anonymous and
  cookie-based. Add an auth layer before offering per-user accounts or exposing
  an admin surface.

## Reporting a vulnerability

Please open a private report (or email the maintainer) rather than a public
issue. Include steps to reproduce and the potential impact.
