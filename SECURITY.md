# Security Policy

SevaSetu is a B.Tech Cybersecurity capstone by **Abhay Chandel** (Reg. GF202217661, Shoolini University). Security is the project, not a feature bolted onto it. This document tells you what is in scope, how the system defends itself, and how to report a vulnerability without making it public first.

The live deployment is `https://sevasetu.dmj.one`. The source is `https://github.com/divyamohan1993/sevasetu` (MIT).

---

## 1. Supported versions

SevaSetu is a single-branch project. The `main` branch is the only supported revision and is what runs in production. Older revisions and feature branches are not patched.

| Version | Supported |
| --- | --- |
| `main` (live)     | Yes |
| Any other branch  | No  |
| Forks             | Maintain your own fork |

If you have deployed a fork, please track `main` and rebase your patches; security fixes are not back-ported to abandoned branches.

---

## 2. Reporting a vulnerability

**Email**: `security@dmj.one` (project disclosure inbox; routed to the maintainer).

A PGP key has not yet been published. If you can encrypt the body with an out-of-band key the maintainer has shared with you, please do; otherwise plain email is acceptable but please avoid attaching live exploit traffic.

Please do **not** open a public GitHub issue for a vulnerability. The repo's public issue tracker is for bugs and feature requests only.

### What to include

A useful report contains, in order of priority:

1. The affected URL, endpoint, or commit SHA.
2. A clear, minimal reproduction (curl, fetch, or screen recording is fine).
3. Impact analysis: what an attacker gains and which user data is exposed.
4. A CVSS 3.1 vector if you are comfortable scoring; otherwise plain English severity.
5. A suggested fix or mitigation, if you have one in mind.
6. Whether you would like public credit, and under what name or handle.

### What to expect from us

| Stage | Target |
| --- | --- |
| Acknowledgement of receipt | within 72 hours |
| Triage decision (accepted / duplicate / out-of-scope) | within 7 days |
| Fix landed on `main`               | severity-dependent (see below) |
| Public disclosure (with credit)    | after fix ships, by mutual agreement |

Indicative fix windows once a report is accepted:

- **Critical** (RCE, auth bypass, mass PII exposure): 7 days.
- **High** (privilege escalation, single-account takeover, persistent XSS on authenticated routes): 14 days.
- **Medium** (CSRF on a non-destructive route, information disclosure of low-sensitivity data): 30 days.
- **Low** (rate-limit gaps, verbose error messages, missing security headers): next routine release.

We will keep you in the loop while the fix is being developed and ask before publishing your name in the Hall of Fame.

### Safe harbour

You will not be pursued for good-faith research that:

- targets only your own accounts,
- avoids accessing or modifying other users' data,
- does not degrade the service for others (no DoS, no automated scanning that exhausts resources),
- gives the maintainers a reasonable window to fix the issue before public disclosure.

Bring your own test accounts; the demo seed accounts on the live URL are fair game.

---

## 3. Scope

### In scope

- The live application at `https://sevasetu.dmj.one` and any subpath under it.
- The `main` branch of `https://github.com/divyamohan1993/sevasetu`.
- The Cloud Run service that hosts the build.
- The CI pipeline configuration files in `.github/`.
- Anything that allows escaping the simulated KYC or ONDC flows into a real-world impact (for example, leaking another user's session).

### Out of scope

- Denial-of-service or volumetric attacks against the live URL.
- Social-engineering attempts against the maintainer or contributors.
- Issues in third-party services we depend on but do not control:
  - OpenStreetMap tile servers.
  - Google Cloud Run, Cloud Build, Secret Manager, Workload Identity Federation.
  - GitHub itself, GitHub Actions runners.
  - Browser bugs, OS bugs.
- Findings that require physical access to a developer's workstation.
- Reports against the **simulated** KYC, payments, or ONDC flows where the only impact is "the simulator can be tricked into producing a fake success." Every simulated surface is labelled "Demo verification" in the UI. If you find a way to make the simulator's output flow into a real authorisation decision elsewhere in the app, that is in scope and important.
- Demo seed data: PGlite re-seeds on cold start, so any "I modified the demo data" finding is not exploitable.
- Best-practice opinions without a concrete attack (for example, "you should use a stricter Content-Security-Policy" without a working bypass).

If you are unsure whether something is in scope, send it anyway with a one-line summary.

---

## 4. Threat model and mitigations

The table below maps the attack vectors we have explicitly designed for to the code-level mitigation and the file where you can read the code yourself.

| # | Attack vector | Mitigation in SevaSetu |
| --- | --- | --- |
| 1 | Credential stuffing, brute-force password guessing | Better-Auth with `scrypt` (N=16384, r=16, p=1, dkLen=64) for password hashing. Cookie-throttled login attempts; verbose 429 on repeated failures. |
| 2 | Session hijacking | `HttpOnly` + `SameSite=Lax` + `Secure` cookies. Cookie name is `__Secure-sevasetu.session_token` over HTTPS, `sevasetu.session_token` over HTTP for local dev. 30-day sliding session with a 5-minute cookie cache to limit replay window. Tokens rotate on privilege change. |
| 3 | SQL injection | Drizzle ORM is used for every query in `src/lib/db/`. Every parameter is bound; there is no string concatenation into SQL anywhere in the codebase. Grep for raw SQL template literals before merging anything new. |
| 4 | Cross-site scripting (XSS) | React auto-escapes JSX. No raw-HTML injection APIs are used on user-supplied data. Response headers in `next.config.ts` are CSP-friendly; raw HTML is never rendered from `bookings.notes`, `reviews.body`, or any other user field. |
| 5 | Cross-site request forgery (CSRF) | Better-Auth issues a rotating CSRF token paired with the `SameSite=Lax` session cookie. Mutating routes require both. |
| 6 | Privilege escalation (customer impersonating provider, or vice versa) | The single most load-bearing rule in the codebase: `userId` is **always** derived from the session via `getSessionUser()`, never read from the request body. Protected pages re-check role server-side via `requireRole()`. Middleware soft-gates paths; the page is the source of truth. |
| 7 | Mass assignment / over-posting | Every API boundary is parsed by an explicit `Zod` schema in `src/lib/validators.ts`. Fields not on the allow-list are dropped. Mismatches return `400 { error: { code: "VALIDATION", message, details } }`. |
| 8 | PII exposure (Aadhaar, phone) | Aadhaar plaintext is **never** persisted. Only the last 4 digits and a salted SHA-256 hash are written, used for de-duplication. Phone numbers are masked in public profiles until a booking is in the `confirmed` state. PII is never written to logs, URLs, or analytics events. |
| 9 | Replay attacks on Beckn / ONDC calls | Beckn 1.1 `Authorization` header carries `created` and `expires` timestamps plus a SHA-256 body digest. The 30-second TTL keeps the replay window narrow. The signer is currently simulated; the verification path is already wired, so going live is a one-file swap in `src/lib/ondc/adapter.ts` for a real Ed25519 signer. |
| 10 | Booking-state tampering | Status transitions in `src/app/api/bookings/[id]` are an explicit allow-list (`pending` → `confirmed`, `confirmed` → `in_progress`, etc.). Disallowed transitions return `409`. Every accepted transition writes a row to the `audit_log` table with the actor's `userId`, the old state, the new state, and a server timestamp. |
| 11 | Insecure deserialisation | JSON only at every boundary. No `eval`, no `Function()` constructors on request data, no YAML, no XML, no Java-style serialised payloads anywhere in the request path. |
| 12 | Dependency CVEs | `package-lock.json` is committed. Production dependencies are kept minimal and reviewed per addition. `npm audit` is runnable in CI; high or critical findings block the build. |

### Other defences worth knowing

- **HTTP response headers** set in `next.config.ts`:
  - `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`
  - `X-Frame-Options: DENY`
  - `X-Content-Type-Options: nosniff`
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `Permissions-Policy: camera=(), microphone=(), geolocation=(self)`
- **Secrets** live in Google Secret Manager. `BETTER_AUTH_SECRET` is mounted into the Cloud Run service via `--update-secrets`. The deploy service account accesses it through Workload Identity Federation. **No service-account JSON keys are stored in the repo or on disk.**
- **Build pipeline**: GitHub Actions builds, type-checks, and lints on every push to `main`. The build refuses to ship on lint or type errors.
- **Runtime**: a single Cloud Run revision in `asia-east1` (the closest Tier 1 region to India after `asia-south1`). Auto-rollback on error spikes is the platform default.

---

## 5. Privacy and DPDP Act 2023

SevaSetu is built to be DPDP-compliant from day one, not retrofitted.

- **Minimum collection**. The signup form asks for email, password, full name, and locale. Phone, location, and KYC data are collected only if and when the user opts in to becoming a provider.
- **Explicit consent**. Provider on-boarding includes a granular consent screen: KYC, geolocation, public profile visibility, and notification preferences are separate toggles.
- **Right to erasure**. Settings includes a "Delete account" action. The schema is `ON DELETE CASCADE` from `users` outward, so deletion is real: providers, services, bookings, reviews, favourites, KYC records, and audit-log rows tied to the user are removed in the same transaction. Aadhaar hashes go with them.
- **Data residency**. Cloud Run is pinned to `asia-east1`. Application data does not leave the region. `asia-south1` (Mumbai) is the natural future home; the migration is a region change on the same service definition.
- **Logging**. PII never appears in application logs. Errors log a request ID, file:line, function name, and a sanitised payload; user identifiers are anonymised before they reach observability sinks.
- **In transit**: TLS 1.3 only (Cloud Run default). **At rest**: AES-256-GCM (Cloud Run + Secret Manager defaults).

---

## 6. Hall of Fame

A thanks-only list, not a paid bounty.

- _Be the first._ Email `security@dmj.one` with a valid finding and we will add you here with the credit and link of your choice.

---

## 7. Out-of-cycle disclosure

If a vulnerability is being actively exploited in the wild, contact `security@dmj.one` with the subject line `EXPLOIT IN PROGRESS`. The service can be put into maintenance mode within minutes via Cloud Run revision rollback while a fix is prepared.

Thank you for helping keep SevaSetu safe.
