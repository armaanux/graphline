<div align="center">

<img src="app/icon.svg" alt="Graphline" width="72" height="72" />

# Graphline

**See the public digital footprint behind anyone — or scan your own.**

Give Graphline an email, phone, username, name, or domain. It crawls public
sources account by account, maps what it finds into an interactive evidence
graph, and tells you who&rsquo;s behind it — with every claim traceable back to a
source, and every account marked by how sure we actually are.

</div>

---

Most lookup tools hand you a list of links and leave you to connect the dots.
Graphline does the connecting: it starts from what you know, follows every
public lead it finds — a portfolio links a GitHub, the GitHub&rsquo;s commits
reveal an email, the email surfaces on three other sites — and keeps going until
it reaches the edge of the public footprint. Then it lays the whole thing out as
a graph and a sourced report.

It is **not** a hacking tool, spyware, or a people-database. It only uses
information that is already public, it says so plainly when it isn&rsquo;t sure,
and it never claims an account is yours just because someone shares your handle.
Findings are leads to verify, not verdicts. The honest use is **scanning
yourself** — to see what a stranger could assemble about you.

## What makes it different

- **It corroborates, it doesn&rsquo;t assume.** Every account is tiered:
  **Confirmed** (a real ownership proof — a Keybase link, a Gravatar-declared
  account, a `rel="me"` link from your own site, a commit-authored email),
  **Likely** (multiple independent sources agree), or **Same handle ·
  unverified** (the handle exists there, but the owner isn&rsquo;t confirmed —
  it could be a different person). The graph and report show exactly which.
- **It crawls, it doesn&rsquo;t just search.** A priority frontier expands node
  by node — personal sites and emails first — scraping owned pages for more
  links and identifiers and following discovered handles, *even ones that differ
  from what you typed*, until it hits dead ends. Pages that merely *mention* you
  are shown but not mined, so it never drifts into a stranger&rsquo;s accounts.
- **It streams live.** You watch sources light up and the graph assemble in real
  time over Server-Sent Events.
- **It scores exposure.** A 0–100 read on how discoverable an identity is from
  public sources, broken down by what&rsquo;s driving it — handy for scanning
  yourself.
- **It runs without keys, but keys make it wide.** With no API keys it still
  works off a dozen keyless sources — but web search then falls back to
  Bing/DuckDuckGo scraping, which is often rate-limited and comes back empty. To
  actually see the breadth of connections, add two free keys — `SERPER_API_KEY`
  and `GITHUB_TOKEN` (see [Getting started](#getting-started)). It never depends
  on a paid model being present.

## Sources

All of these work with **no API keys**:

| Source | For | What it establishes |
| --- | --- | --- |
| GitHub API + commit mining | username, email | Profile, real name, repos, and **author emails from public commits** |
| Gravatar | email | Self-declared public identity + linked accounts |
| Keybase | username | Cryptographically-verified links between accounts |
| Account sweep | username, email | Registration across ~25 platforms (clean 404s only) |
| Website scraper | domain, url, name | Live page: contacts, socials, org, and `rel="me"` / `sameAs` claims |
| RDAP / WHOIS · DNS | domain, url | Registrar, dates, hosting, mail provider |
| Certificate transparency (crt.sh) | domain | Subdomains from public TLS certificate logs |
| Wayback Machine | domain, url | Archive age + contact details long since removed |
| Breach exposure (XposedOrNot) | email | Which known data breaches an email appears in |
| Phone metadata | phone | Validity, country, region, line type (offline) |

Add a free search key ([Serper](https://serper.dev) or
[Brave](https://brave.com/search/api)) and it also runs real Google plus
`site:instagram.com`, `site:linkedin.com/in`, `site:tiktok.com`… queries to find
social profiles by handle and by name. Add [Hunter.io](https://hunter.io) for
professional emails on a domain. Without any key it falls back to keyless
Bing/DuckDuckGo scraping — and once a search quota is spent it degrades to
keyless automatically rather than going dark.

> Login-walled platforms (Instagram, TikTok, Telegram, X, Steam) are
> deliberately excluded from direct existence checks — they return &ldquo;OK&rdquo;
> for every handle and would manufacture false positives. Honesty over breadth.

## The AI investigator

Set `ANTHROPIC_API_KEY` and Claude writes the report&rsquo;s narrative — but
only from the structured facts collected, never inventing anything. Without a
key, a deterministic analyst produces the full report. The product never depends
on the model being present.

## Getting started

```bash
git clone https://github.com/armaanux/graphline.git
cd graphline
npm install
npm run dev   # http://localhost:3000
```

It runs with zero configuration, but for the full breadth of connections you'll
want a search key — copy the example and fill in what you have:

```bash
cp .env.example .env.local
```

Two free keys make the difference between a handful of nodes and a wide graph —
add both for the full experience:

- **`SERPER_API_KEY`** (free at [serper.dev](https://serper.dev)) — real Google
  and `site:` social search; the single biggest breadth upgrade.
- **`GITHUB_TOKEN`** (free at [github.com/settings/tokens](https://github.com/settings/tokens),
  no scopes needed) — lifts the GitHub limit 60 → 5,000/hr and unlocks
  commit-email mining, a major source of real names and linked emails.

See [Configuration](#configuration) for the fully optional rest.

Try `torvalds`, `stripe.com`, `Ada Lovelace`, or your own handle.

## Deploy

Graphline runs a **long-lived Node server** (investigations stream for a minute
or two) and keeps a small on-disk store, so it needs a persistent host — a
plain serverless/edge platform will time the crawls out. It ships with a
`Dockerfile`, so it runs anywhere: **[Render](https://render.com)**,
**[Fly.io](https://fly.io)**, **[Railway](https://railway.app)** (all have free
tiers), or your own box.

```bash
docker build -t graphline .
docker run -p 3000:3000 --env-file .env.local -v graphline-data:/app/.data graphline
```

Mount a volume at `/app/.data` to persist case history and the daily usage
counters across restarts. On a free tier without a persistent disk, history is
best-effort (it resets on cold starts) — the tool itself still works.

### Configuration — this is what widens the graph

Every variable is optional and the app runs with none, but **keys are the
difference between a thin result and a wide one.** Keyless, web search falls back
to Bing/DuckDuckGo scraping that is often rate-limited and returns nothing, so
the graph leans on GitHub and account-sweep alone. Add the two **recommended**
keys below and the same query surfaces far more accounts, links, and names.

Set them in `.env.local` (`cp .env.example .env.local`).

| Variable | Impact on results | |
| --- | --- | --- |
| `SERPER_API_KEY` | Real Google + `site:` social search — the biggest breadth upgrade | **Recommended** |
| `GITHUB_TOKEN` | GitHub limit 60 → 5,000/hr + commit-email mining (real names, linked emails) | **Recommended** |
| `BRAVE_API_KEY` | Alternative search provider, in place of Serper | Optional |
| `HUNTER_API_KEY` | Professional emails on a domain | Optional |
| `ANTHROPIC_API_KEY` | AI-written report narrative (deterministic writer without it) | Optional |
| `GRAPHLINE_DAILY_OWNER_CAP` | Investigations/day that may use your search key (unset = unlimited) | Deploy |
| `GRAPHLINE_DAILY_PER_IP` | Investigations/day per visitor (unset = unlimited) | Deploy |
| `GRAPHLINE_MAX_CONCURRENT` | Simultaneous crawls before the server reports busy (default 4) | Deploy |

The two daily caps are opt-in: leave them unset to run without limits (self-host),
and set them on a shared public deployment to protect your search-key budget.

## Security

Graphline fetches user-controlled and crawler-discovered URLs and, deployed
publicly, spends real search credits — so it&rsquo;s hardened accordingly:

- **SSRF guard** — every outbound URL is DNS-resolved and refused if it maps to
  a private/loopback/link-local/metadata address, re-validated on each redirect
  hop; handles are sanitized before they touch a URL.
- **Session-scoped cases** — investigations are stored behind an anonymous
  httpOnly-cookie session, so a visitor only ever sees, loads, or deletes their
  own; ids are strictly validated (no path traversal).
- **Abuse & cost control** — per-IP burst + daily caps, a global daily
  owner-key budget (degrades to keyless past it), and a server-wide concurrency
  cap.
- **Headers** — CSP, `frame-ancestors 'none'`, `nosniff`, HSTS on every
  response; no secrets in the repo.

See [`SECURITY.md`](SECURITY.md) for the full picture, including known limits.

## Responsible use

Graphline uses only legally accessible, publicly available information and
respects site terms — it never attempts authentication or unauthorized access.
It is an investigation *assistant*, not a background-check service. Treat every
finding as a lead to verify. Don&rsquo;t use it to harass, stalk, or profile
people who haven&rsquo;t consented — scan yourself, or things you&rsquo;re
authorized to investigate.

## How it&rsquo;s built

Next.js 16 (App Router), React 19, Tailwind 4, React Flow, three.js, and the
Anthropic SDK. The engine is a set of **collectors** behind one interface —
adding a source is a single file dropped into `lib/engine/collectors/`; nothing
else in the pipeline changes.

```
lib/engine/
  identifier · types · graph · confidence · verification · blocklist
  collectors/   github · gravatar · keybase · usernames · website · rdap ·
                dns · phone · websearch · crtsh · wayback · hunter · breach
  search · orchestrator · report · llm · store · http
```

## Built by

**Armaan Parvez** — I build tools that are useful, honest, and a little
opinionated. Graphline started as a &ldquo;how much can you actually find about
someone from public data?&rdquo; question and turned into a study in doing that
*responsibly* — surfacing everything, but never pretending to be sure when it
isn&rsquo;t.

- GitHub — [@armaanux](https://github.com/armaanux)
- Portfolio — [armaanux.in](https://armaanux.in)

If you build on it or find a sharp edge, I&rsquo;d love to hear about it.

## License

MIT — see [`LICENSE`](LICENSE).
