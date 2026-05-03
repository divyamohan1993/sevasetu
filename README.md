<div align="center">

# SevaSetu · सेवा सेतु

**A bridge of trust between India's service workers and the people who need them.**

[![Deploy to Cloud Run](https://github.com/divyamohan1993/sevasetu/actions/workflows/deploy.yml/badge.svg?branch=main)](https://github.com/divyamohan1993/sevasetu/actions/workflows/deploy.yml)
[![Live on Cloud Run](https://img.shields.io/badge/live-asia--east1-4285F4?logo=googlecloud&logoColor=white)](https://sevasetu.dmj.one)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Next.js 15](https://img.shields.io/badge/Next.js-15-000?logo=nextdotjs&logoColor=white)](https://nextjs.org)
[![React 19](https://img.shields.io/badge/React-19-149ECA?logo=react&logoColor=white)](https://react.dev)
[![TypeScript strict](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Postgres via PGlite](https://img.shields.io/badge/Postgres-PGlite%20WASM-336791?logo=postgresql&logoColor=white)](https://pglite.dev)
[![ONDC: simulated BPP](https://img.shields.io/badge/ONDC-simulated%20BPP-FF6B00)](https://ondc.org)
[![DPDP-aware](https://img.shields.io/badge/DPDP%20Act%202023-aware-1F6FEB)](https://www.meity.gov.in)

</div>

> **B.Tech (Cybersecurity) · Final-Semester Capstone**
> **Abhay Chandel** · Reg. No. **GF202217661**
> Yogananda School of AI, Computers and Data Sciences · Shoolini University, Solan, H.P.

---

## What is SevaSetu

SevaSetu (Sanskrit: *"the bridge of service"*) is a local-services marketplace for India where customers find verified electricians, plumbers, tutors, cooks, drivers, beauticians, packers and more, book in minutes, pay over UPI, and discover providers from anywhere on the open ONDC network. It is a single Next.js application: server-rendered, theme-aware, bilingual (English + हिन्दी), and built for slow phones on bad networks.

## Live demo

| | |
|---|---|
| Application | https://sevasetu.dmj.one |
| Pitch deck (25 slides, arrow-key navigation) | https://sevasetu.dmj.one/pitch |
| Health endpoint | https://sevasetu.dmj.one/api/health |
| Custom domain | `sevasetu.dmj.one` (CNAME mapped, propagation pending) |

**Demo accounts** (seeded automatically on every cold start):

| Role | Email | Password |
|---|---|---|
| Customer | `demo@sevasetu.in` | `password123` |
| Provider | `provider0@sevasetu.in` … `provider59@sevasetu.in` | `password123` |

Data is **volatile by design**. SevaSetu runs PGlite (PostgreSQL compiled to WebAssembly, in-process, in-memory) on a single Cloud Run instance. Every cold start re-seeds 60 providers across 12 cities, full categories and reviews, so the demo always looks alive without an external database bill. Any account you create will be wiped on the next cold start.

## Screens

| Landing | Browse | Provider profile |
|---|---|---|
| ![Landing](docs/screens/landing.png) | ![Browse](docs/screens/browse.png) | ![Provider](docs/screens/provider.png) |

Screens are regenerated automatically by the Playwright smoke step in CI; check `docs/screens/` for the latest set.

## Why it exists

India's `e-Shram` register has crossed **290 million unorganised workers**, and PLFS data places informal services as the largest non-farm livelihood band. Yet the customer side of the market still runs on shopkeeper phone numbers and word of mouth: there is no shared trust layer, no portable rating, no neutral discovery surface, and no standard way to settle a small payment with a receipt.

Closed super-apps (Urban Company, Housejoy, JustDial) solve discovery for one slice of the market and lock both sides into a private graph. ONDC offers the alternative model: an open, protocol-driven network where any compliant buyer-app can discover any compliant seller-app. SevaSetu is a working **Beckn 1.1 / `ONDC:RET11` BPP** for that network, with the trust primitives (Aadhaar, PAN, GSTIN, UPI) wired the way they will need to be on day one of going live.

The capstone goal is twofold. First, prove that a single full-stack engineer can ship the full surface (auth, KYC, search, booking, payments, reviews, ONDC adapter) on a free-tier deployment. Second, do it without compromising on the things that matter for production: WCAG 2.2 baseline accessibility, DPDP-aware data handling, server-side authoritative role checks, and a CI/CD pipeline that deploys with no humans in the loop and no service-account keys committed to the repository.

## What is real, what is simulated

Honesty is part of the brand. Every UI surface that performs a simulation says so.

| Surface | Real | Simulated |
|---|---|---|
| Aadhaar number | Verhoeff checksum (incl. UIDAI no-leading-0/1 rule); only `last4` + salted SHA-256 ever stored | UIDAI OTP `send` and `verify`, DigiLocker e-KYC payload shape |
| PAN | Format regex + 4th-character entity-type detection (P/C/H/F/A/T/B/L/J/G) | NSDL / Protean verify call |
| GSTIN | Mod-36 checksum (the same algorithm GSTN uses) | GSTN GSP lookup |
| UPI | BHIM `upi://pay?…` deeplink (works on every UPI app on every device) | NPCI collect and settle webhook |
| ONDC / Beckn 1.1 | Context envelope, RET11 codes, catalog shape, `Authorization: Signature keyId="..."` header structure | Ed25519 signer and registry lookup |
| Auth | Better-Auth 1.1 sessions, scrypt N=16384 r=16 p=1 dkLen=64, HttpOnly + SameSite + `__Secure-` cookies | None |
| Maps | OpenStreetMap tiles, Leaflet, Haversine distance | None |
| Database | Drizzle ORM, 15-table schema, FKs, indexes, pgEnum, `doublePrecision` | The DB itself is PGlite-WASM (real Postgres semantics, in-process) |

Going live on ONDC is a single-file replacement of `src/lib/ondc/adapter.ts` with a registered keypair. The contract surface around it does not change.

## Architecture at a glance

```
                       ┌──────────────────────────┐
                       │      Browser (RSC)       │
                       │  Tailwind v4 · Radix UI  │
                       │  Leaflet · next-themes   │
                       └────────────┬─────────────┘
                                    │ fetch / form / Server Action
                                    ▼
            ┌──────────────────────────────────────────────┐
            │          Next.js 15 App Router               │
            │  13 server-rendered pages · 27 API routes    │
            │  middleware.ts (cookie gate)                 │
            │  i18n.ts (cookie + Accept-Language)          │
            └───┬───────────────┬───────────────┬──────────┘
                │               │               │
                ▼               ▼               ▼
        ┌───────────────┐ ┌──────────────┐ ┌─────────────────┐
        │  Drizzle ORM  │ │  Better-Auth │ │  Zod validators │
        │  15 tables    │ │  1.1 scrypt  │ │  every boundary │
        └───────┬───────┘ └──────┬───────┘ └─────────────────┘
                │                │
                ▼                ▼
            ┌──────────────────────────┐
            │  PGlite (Postgres+WASM)  │
            │   in-process · volatile  │
            └──────────────────────────┘
                                    │
                ┌───────────────────┼────────────────────────┐
                ▼                   ▼                        ▼
        ┌────────────────┐ ┌────────────────┐ ┌────────────────────────┐
        │  KYC sidecar   │ │  UPI sidecar   │ │  ONDC / Beckn 1.1 BPP  │
        │  Aadhaar/PAN/  │ │  BHIM deeplink │ │  search/select/init/   │
        │  GSTIN logic   │ │  + simulated   │ │  confirm/status/on_*   │
        │  (real algos)  │ │  collect/settle│ │  RET11 catalog         │
        └────────────────┘ └────────────────┘ └────────────────────────┘
```

A deeper write-up of the data flow, the KYC state machine and the ONDC adapter contract lives in [ARCHITECTURE.md](ARCHITECTURE.md).

### Notes on the data layer

The `users`, `sessions`, `accounts` and `verifications` tables are the Better-Auth core. `providers` extends `users` 1:1 when `users.role = 'provider'`, holding location (`lat` / `lng` as `doublePrecision`), KYC status enums, UPI VPA, and the ONDC participant id. `services` and `provider_categories` connect a provider to their offerings; `bookings`, `reviews`, `review_likes` and `favorites` model the customer side. An `audit_log` table records sensitive transitions (KYC status changes, booking state moves, provider creation) with actor, IP, entity and metadata.

The bounding-box filter on browse (`minLat`, `maxLat`, `minLng`, `maxLng`) is paired with an in-process Haversine to give accurate distance without depending on PostGIS. At city scale this is fast enough; at nationwide scale, swapping in PostGIS `ST_DWithin` and a `GIST` index is a one-file change.

### Notes on the request lifecycle

Every page is a Server Component by default. Client components are introduced only where they earn it: forms with React Hook Form, the Leaflet map (loaded with `dynamic({ ssr: false })` to avoid hydration mismatches), the theme toggle and the booking modal. Lists stream in with `loading.tsx` skeletons, errors are caught by a route-segment `error.tsx`, and the entire authenticated shell sits behind a single cookie gate in `middleware.ts`. Authoritative role checks always happen server-side via `requireRole()`; the cookie gate is only a first pass.

## Tech stack

| Layer | Choice | Why this choice |
|---|---|---|
| Framework | Next.js 15 (App Router) + React 19 | Single binary for SSR, RSC, API routes and static assets; server components keep the JS bundle small on slow phones |
| Language | TypeScript (strict) | Compile-time guarantees across the API, schema and UI |
| Styling | Tailwind CSS v4 + shadcn-style primitives over 22 Radix UI components + Lucide icons | WCAG 2.2 baseline for free, dark/light/system theme via `next-themes` |
| Database | PGlite (PostgreSQL compiled to WASM) | Real Postgres semantics with no managed-DB bill; ideal for a free-tier capstone demo, swappable for managed Postgres in production |
| ORM | Drizzle 0.38 + drizzle-zod | Type-safe schema, generated SQL migrations, no runtime overhead |
| Auth | Better-Auth 1.1 | Modern session model, scrypt KDF, HttpOnly + SameSite + `__Secure-` cookies, role-based access |
| Maps | Leaflet + react-leaflet on OpenStreetMap | No Google Maps key, no per-tile cost, works in regions where Google Maps is rate-limited |
| i18n | Custom dictionary, server-resolved locale | English + Hindi, Devanagari via Noto Sans Devanagari (next/font) |
| Deployment | Google Cloud Run (asia-east1, Tier 1) | Scale-to-zero, single-instance pinned for PGlite session consistency |
| CI/CD | GitHub Actions + Workload Identity Federation | No service-account JSON keys committed; federated trust between GitHub and GCP |
| Container | Three-stage Dockerfile, Next.js standalone output | ~250 MB image, runs as non-root `nextjs:nodejs` |
| Validation | Zod at every API boundary | One schema per route, error shape `{error: {code, message, details}}` |

## Quick start (local)

PGlite runs in the Node process, so no external database is required. The schema is created and seeded on the first request.

```bash
git clone https://github.com/divyamohan1993/sevasetu.git
cd sevasetu
npm install
cp .env.example .env.local
# Generate the only secret you need locally:
openssl rand -base64 32   # paste into BETTER_AUTH_SECRET in .env.local
npm run dev
```

Open http://localhost:3000. The first request bootstraps the in-memory database, runs the Drizzle migrations and seeds 60 providers across 12 cities. Sign in with `demo@sevasetu.in / password123`.

If you prefer to point the app at a real Postgres (Supabase, Neon, RDS, local Docker), set `DATABASE_URL` in `.env.local` and the bootstrap layer will use it instead of PGlite. A `docker-compose.yml` is included for that path.

## Deployment (Cloud Run)

The repository deploys itself. Pushing to `main` triggers `.github/workflows/deploy.yml`, which authenticates to Google Cloud through Workload Identity Federation, builds the standalone container with Cloud Build, deploys to `asia-east1` and runs an inline smoke test against `/api/health`, `/`, `/pitch` and `/browse`.

To deploy from a workstation:

```bash
gcloud run deploy sevasetu \
  --source . \
  --region=asia-east1 \
  --allow-unauthenticated \
  --memory=1Gi \
  --cpu=1 \
  --min-instances=0 \
  --max-instances=1 \
  --concurrency=80 \
  --port=3000 \
  --timeout=300 \
  --env-vars-file=/tmp/sevasetu-env.yaml \
  --update-secrets=BETTER_AUTH_SECRET=sevasetu-auth-secret:latest \
  --quiet
```

`max-instances=1` is intentional: PGlite holds the session in process, so two instances would diverge. For a horizontally scaled deployment, repoint `DATABASE_URL` at managed Postgres and lift the cap.

The env-vars file shape (no secret values are ever committed):

```yaml
BETTER_AUTH_URL: "https://<service-host>"
NEXT_PUBLIC_APP_URL: "https://<service-host>"
NEXT_PUBLIC_APP_NAME: "SevaSetu"
NEXT_PUBLIC_DEFAULT_LAT: "28.6139"
NEXT_PUBLIC_DEFAULT_LNG: "77.2090"
NEXT_PUBLIC_DEFAULT_CITY: "New Delhi"
AADHAAR_MODE: "demo"          # or "disabled" to remove the demo flow entirely
NEXT_PUBLIC_TILE_URL: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
NEXT_PUBLIC_TILE_ATTRIBUTION: "© OpenStreetMap contributors"
NODE_ENV: "production"
```

`BETTER_AUTH_SECRET` is mounted from Google Secret Manager (`sevasetu-auth-secret:latest`); it is never stored in env-vars files or in the repo.

## Project layout

```
sevasetu/
├── src/
│   ├── app/
│   │   ├── (auth)/                 # /login, /signup
│   │   ├── (app)/                  # gated shell: /browse, /providers/[id], /dashboard,
│   │   │                           #             /bookings, /favorites, /settings, /provider/*
│   │   ├── api/
│   │   │   ├── auth/[...all]/      # Better-Auth handler
│   │   │   ├── kyc/{aadhaar,pan,gst}/   # KYC verifications
│   │   │   ├── upi/{collect,settle}/    # UPI flow
│   │   │   ├── ondc/{search,select,init,confirm,status,on_search,registry}/
│   │   │   ├── providers/, services/, bookings/, reviews/,
│   │   │   ├── search/, favorites/, availability/, users/me/, health/
│   │   ├── layout.tsx · page.tsx · error.tsx · loading.tsx · not-found.tsx
│   │   └── globals.css             # Tailwind v4 + theme tokens
│   ├── components/                 # 22 Radix-based UI primitives + feature components
│   ├── lib/
│   │   ├── db/                     # schema.ts (15 tables), bootstrap.ts (PGlite + migrate + seed)
│   │   ├── kyc/                    # aadhaar.ts (Verhoeff), pan.ts, gst.ts (Mod-36)
│   │   ├── payments/upi.ts         # BHIM deeplink + simulated collect/settle
│   │   ├── ondc/adapter.ts         # Beckn 1.1 contexts, RET11 catalog, signer interface
│   │   ├── auth.ts · auth-client.ts · auth-helpers.ts
│   │   └── validators.ts · categories.ts · i18n.ts · geo.ts · env.ts · utils.ts
│   └── middleware.ts               # cookie gate for protected paths
├── drizzle/                        # generated SQL migrations
├── public/pitch.html               # 25-slide self-hosted deck
├── scripts/{seed,reset,build_report}.{ts,py}
├── .github/workflows/deploy.yml    # WIF + Cloud Run + smoke
├── Dockerfile                      # 3-stage, standalone output
└── SevaSetu_Capstone_Report.docx
```

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` | Next.js dev server with Turbopack |
| `npm run build` | Production build (Next.js standalone) |
| `npm run start` | Run the production build locally |
| `npm run typecheck` | `tsc --noEmit` against the strict TS config |
| `npm run lint` | ESLint over `src/` |
| `npm run format` | Prettier over `src/**/*.{ts,tsx,css}` |
| `npm run db:generate` | Generate SQL migration files under `drizzle/` |
| `npm run db:push` | Push the Drizzle schema to the configured database |
| `npm run db:migrate` | Apply migrations (used at container boot) |
| `npm run db:seed` | Seed 60 providers across 12 cities, categories and reviews |
| `npm run db:reset` | Drop and recreate the `public` schema |
| `npm run db:studio` | Open Drizzle Studio against the configured database |

## Security and privacy posture

- Passwords are hashed with scrypt (N=16384, r=16, p=1, dkLen=64) inside Better-Auth; sessions are HttpOnly + SameSite cookies, and `__Secure-` prefixed in production.
- Aadhaar numbers are never stored in plaintext. Only `last4` and a salted SHA-256 are persisted, used solely for de-duplication and for showing the user "verified ending in ****1234".
- PAN, GSTIN and Aadhaar are validated by the real algorithms before any network simulation runs, so a malformed identifier never reaches the wire path.
- Every API route accepts `userId` only from the server-side session, never from the body or query string.
- Zod runs at every API boundary; validation failures surface as `{error: {code, message, details}}` with no internal stack traces.
- `audit_log` records KYC transitions, booking state changes and provider creation with actor, IP and metadata.
- Settings includes "Download my data" and "Delete account"; deletion cascades through the schema (`ON DELETE CASCADE`) so referenced reviews, favorites and provider rows are removed in one transaction.
- PII never appears in URLs, server logs, or error responses. Default city focus is shipped as plain numeric coordinates (`28.6139, 77.2090`) so the demo does not silently send a request to a third-party geocoder.
- The container runs as a non-root user (`nextjs:nodejs`, UID 1001), and `BETTER_AUTH_SECRET` is mounted from Google Secret Manager rather than baked into the image.

## Testing

The verification pyramid that ships with the repo:

1. **Compile time.** `tsc --noEmit` in strict mode, ESLint, and Tailwind class-merge linting catch the bulk of regressions before code is queued for build.
2. **Boundary validation.** Every API route validates its input with a Zod schema and emits `{error: {code, message, details}}` on failure. The same Zod-via-`drizzle-zod` types are reused on the client, so a schema change cannot drift between the two sides.
3. **Smoke after deploy.** The `Deploy to Cloud Run` workflow ends with a `curl`-driven smoke that polls `/api/health` until ready, then checks `/`, `/pitch`, and `/browse` for `HTTP 200`. A non-200 response fails the workflow.
4. **Visual smoke.** The `docs/screens/` images are regenerated from a Playwright pass over the live deployment, providing a low-noise visual diff between releases.

The four checks together are intentional: type checking proves the code compiles, Zod proves the contract holds, the curl smoke proves the deploy is reachable, and Playwright proves the UI renders.

### Manual test plan for reviewers

1. Open the live URL and verify that the landing page renders within two seconds on a throttled 3G profile (Chrome DevTools, "Slow 3G").
2. Switch the language to हिन्दी (top-right toggle); confirm Devanagari renders with Noto Sans Devanagari and that the booking modal labels translate.
3. Sign up with a fresh email; the role defaults to `customer`. Sign out, then sign in with `provider0@sevasetu.in / password123` and verify you land on the provider dashboard.
4. Browse with a city filter, click a provider, open the booking modal, choose a service, pick a slot, submit. The booking transitions to `pending` and the UPI deeplink is generated against the provider's VPA.
5. Run the KYC sweep on the provider dashboard: enter a valid Aadhaar (e.g. `2342 1010 1010` if it satisfies Verhoeff), a real-format PAN like `ABCPK1234N`, a Mod-36-valid GSTIN. The simulated network step should succeed, the database should record only the hash and last-4 for Aadhaar, and the badge should switch to "verified".
6. Hit `/api/health` and confirm `{ "ok": true, "db": "ready" }`.
7. POST to `/api/ondc/search` with a Beckn 1.1 envelope (the request shape is documented at `/api/ondc/search`) and confirm an `on_search` callback fires with a RET11-shaped catalog.

## Performance and accessibility

- Server Components by default keep the JavaScript shipped to the client small. The browse page renders entirely on the server and streams in. The map is the only heavy client component, and it is `dynamic({ ssr: false })` so it never blocks the first paint.
- Skeletons and `loading.tsx` boundaries make every list show structure before content. There is no spinner-on-blank-screen pattern anywhere in the app.
- Core Web Vitals targets: LCP under 2.5 s, INP under 200 ms, CLS under 0.1. The landing and `/browse` pages currently land inside that envelope on a Pixel 4a profile.
- Tailwind v4 ships utility CSS only for what the build actually uses; the production CSS bundle is around 30 KB compressed.
- Theme tokens are CSS variables, so dark / light / system flips happen with no re-render flicker.
- WCAG 2.2 baseline: every interactive control has a visible focus ring, all icons have accessible labels, color contrast is checked at AA across both themes, the booking flow is fully reachable by keyboard, and Radix primitives ship the correct ARIA semantics out of the box.

## Observability

- `/api/health` returns the DB and bootstrap status; the Cloud Run smoke test polls it before declaring a deploy successful.
- All server logs are structured, with timestamp, route and request id. PII is never written to logs.
- The `audit_log` table doubles as a tamper-evident timeline for KYC and booking events; queries by `actor_id` or `(entity, entity_id)` are indexed.
- Cloud Run revisions retain the last 10 deploys, so a rollback to the previous revision is a one-click operation in the GCP console (or `gcloud run services update-traffic --to-revisions=...`).

## Roadmap

- WebSocket-driven provider availability and live booking notifications
- ONDC issue / refund / grievance flows (`igm` Beckn API) and `cancel` semantics
- DigiLocker real OAuth integration through Meri Pehchaan
- Cashfree / Razorpay PSP integration for real UPI collect with webhook reconciliation
- Hindi search synonym expansion plus Tamil, Bengali, Marathi locales
- PWA with an offline booking queue (writes synced when network returns)
- Provider-side mobile-first dashboard with FCM push for new requests
- ML-KEM hybrid TLS profile and a signed audit trail for KYC transitions

If a `ROADMAP.md` is added later, it will take precedence over this list.

## Author

**Abhay Chandel** · Reg. No. **GF202217661** · B.Tech (Cybersecurity), Final Semester
Yogananda School of AI, Computers and Data Sciences, **Shoolini University**, Solan, H.P., India
GitHub: https://github.com/divyamohan1993 · Project repo: https://github.com/divyamohan1993/sevasetu

### Acknowledgements

- The Next.js, React, Drizzle, Better-Auth, PGlite, Leaflet, Radix UI, Tailwind CSS and shadcn/ui maintainers, whose work makes a one-person production deployment possible.
- The OpenStreetMap community for the tile layer and the worldwide geocoding corpus.
- The ONDC Network Team and the Beckn Open Collective for publishing the protocol contracts and the RET11 specification.
- UIDAI, NPCI, NSDL/Protean and GSTN for documenting the algorithms (Verhoeff, BHIM deeplink, PAN entity types, Mod-36) that this project implements faithfully even where the network calls are simulated.
- **Ms. Maya Thapa** (capstone mentor) and the faculty of the Yogananda School of AI, Computers and Data Sciences, Shoolini University, for the guidance and design reviews throughout the capstone.

## Frequently asked questions

**Is the data real?** No. Every record is seeded; the seed reruns on every cold start. Treat the live demo as a sandbox.

**Why PGlite and not a managed database?** A capstone deployment should not require a paid database tier. PGlite gives real Postgres semantics inside the same Node process as Next.js, so the app starts cold, seeds itself, and serves traffic without any external dependency. The trade-off is volatility, which the UI states clearly.

**Why a single-instance pin on Cloud Run?** Two Cloud Run instances would each hold their own PGlite state and diverge. With managed Postgres, lift the pin and the app scales horizontally without further changes.

**Can SevaSetu actually go live on ONDC?** The contract surface is real. The only piece that is simulated is the cryptographic signer. Replace `src/lib/ondc/adapter.ts` with a registered Ed25519 keypair and a real registry lookup, and the rest of the codebase is unchanged.

**Why English and Hindi only?** Those are the two languages the author can write and proofread to a quality bar. Tamil, Bengali and Marathi are on the roadmap and will land once the dictionary is reviewed by a native speaker.

## License

Released under the MIT License. See [LICENSE](LICENSE) for the full text. You are free to use, fork, study and ship; please credit the author when you do.

---

<div align="center">

**सेवा सेतु: हर सेवा, हर सेवक, हर भारतीय के लिए।**
*A bridge of service for every Indian.*

</div>
