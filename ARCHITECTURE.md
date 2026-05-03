# SevaSetu - Architecture

A deep technical reference for the SevaSetu codebase. Pairs with [`README.md`](./README.md) (project overview and quickstart), [`SECURITY.md`](./SECURITY.md) (threat model and controls), and [`ROADMAP.md`](./ROADMAP.md) (forward plan).

> SevaSetu is a local services marketplace for Bharat. B.Tech Cybersecurity capstone by **Abhay Chandel** (Reg. GF202217661, Shoolini University). Live at `https://sevasetu-107722137045.asia-east1.run.app`. Custom domain `sevasetu.dmj.one` mapped (CNAME pending propagation). Source: `https://github.com/divyamohan1993/sevasetu`.

---

## 1. Goals and non-goals

### Goals

- A working end-to-end booking flow for local services across an Indian city tier: search, select, book, pay, review.
- A schema and API surface that matches the real production contracts SevaSetu would integrate against - Better-Auth, Beckn 1.1 / ONDC RET11, NPCI BHIM UPI, Verhoeff/Mod-36/PAN - so the path from MLP to pilot is "wire in real credentials" and not "rewrite the data model".
- Low-friction install: `git clone`, `docker compose up`, deployable to a single Cloud Run revision in one `gcloud run deploy --source .` invocation. No managed Postgres, no Redis, no message bus required.
- Bilingual UX (English + Hindi) and WCAG-friendly UI primitives from day one.

### Non-goals

- Multi-region, multi-instance horizontal scale-out. The current app is a single-VM-equivalent; Cloud Run is pinned to `max-instances=1` for session and seed-data consistency. Path to scaling out is documented in section 15.
- Real KYC, real PSP settlement, real ONDC registry whitelisting. Every external integration is **simulated with the production wire shape**, transparently labelled "Demo verification" in the UI, and gated by a single replaceable file or env flag.
- Native mobile apps. The web app is responsive and PWA-ready; native is on the [`ROADMAP`](./ROADMAP.md).

---

## 2. High-level diagram

```
                    ┌──────────────────────────────────────────────┐
                    │  Browser (React 19, Tailwind v4, shadcn/UI)  │
                    │  RSC streaming · next/font · next-themes     │
                    └──────────────────────┬───────────────────────┘
                                           │ HTTPS · session cookie
                                           ▼
        ┌──────────────────────────────────────────────────────────────────┐
        │                   Next.js 15 (App Router · Node runtime)         │
        │                                                                  │
        │   middleware.ts ─── soft session cookie gate at the edge         │
        │       │                                                          │
        │       ▼                                                          │
        │   ┌─────────────────┐    ┌──────────────────────────────┐        │
        │   │ Server Components│    │ Route Handlers (27 routes)  │        │
        │   │  read paths      │    │ /api/* · runtime "nodejs"   │        │
        │   └────────┬────────┘    └─────────────┬────────────────┘        │
        │            │       Server Actions       │                        │
        │            └───────────┬───────────────┘                         │
        │                        ▼                                          │
        │           ┌─────────────────────────────┐                        │
        │           │  Better-Auth (drizzleAdapter)│                        │
        │           │  scrypt · session cookies    │                        │
        │           └──────────────┬──────────────┘                        │
        │                          ▼                                       │
        │           ┌──────────────────────────────┐                       │
        │           │  Drizzle ORM (15 tables)     │                       │
        │           └──────────────┬───────────────┘                       │
        │                          ▼                                       │
        │           ┌──────────────────────────────┐                       │
        │           │  PGlite - Postgres in WASM   │                       │
        │           │  in-process · volatile       │                       │
        │           └──────────────────────────────┘                       │
        │                                                                  │
        │   sidecar adapters (all in-process, all simulated by default):   │
        │   ┌──────────────┐ ┌─────────────┐ ┌──────────────────────┐      │
        │   │ Beckn / ONDC │ │ BHIM UPI    │ │ Aadhaar · PAN · GSTIN │      │
        │   │ adapter.ts   │ │ payments/upi│ │ kyc/{aadhaar,pan,gst} │      │
        │   └──────────────┘ └─────────────┘ └──────────────────────┘      │
        └──────────────────────────────────────────────────────────────────┘
                                           │
                                           ▼
                       OpenStreetMap tiles (browser only)
```

Everything past the browser is one Node process. PGlite, Drizzle, Better-Auth, the Beckn adapter, the UPI builder, and the KYC validators all live in the same memory space. There are zero outbound network dependencies at boot.

---

## 3. Request lifecycle

Two paths matter.

### 3a. Read path - Server Component

```
GET /browse?city=Pune
  │
  ├── middleware.ts: not protected, pass through
  │
  ├── app/(app)/browse/page.tsx (RSC):
  │     await db.select(...).from(providers)... // direct Drizzle call
  │     await getSessionUser()                  // cookie → session lookup
  │     return <ProviderGrid items={rows} />
  │
  ├── Next.js streams the HTML shell, then the awaited fragments
  │
  └── Browser hydrates only the interactive islands
        (search filters, map, booking modal)
```

Server Components do their own DB reads. There is no client-side fetch on first paint for browse, providers/[id], or the dashboard. The bundle that ships to the browser is small because the catalog rendering never runs there.

### 3b. Mutation path - Route Handler

```
POST /api/bookings  body: { providerId, scheduledAt, ... }
  │
  ├── middleware.ts: not in PROTECTED_PREFIXES, pass through (auth happens in handler)
  │
  ├── app/api/bookings/route.ts:
  │     export const runtime = "nodejs";
  │     const user = await getSessionUser()        // 401 if absent
  │     const data = BookingSchema.safeParse(body) // 400 on invalid
  │     if (data.providerId === user.id) → 403
  │     // userId comes from session, NEVER from body
  │     const collect = simulateUpiCollect(...)
  │     const upiIntent = buildUpiIntent(...)
  │     const [row] = await db.insert(bookings).values({ userId: user.id, ... }).returning()
  │     return 201 { booking: row, upiIntent }
```

Every Route Handler:
1. Sets `runtime = "nodejs"` (PGlite + scrypt + Node `crypto` need Node, not Edge).
2. Resolves the session via `getSessionUser()` (which itself runs `auth.api.getSession({ headers })`).
3. Runs the body through a Zod schema from `src/lib/validators.ts`.
4. Derives ownership keys from the session, not the body.
5. Returns errors in a stable shape: `{ error: { code, message, details? } }`.

### 3c. Auth middleware

`src/middleware.ts` is a soft gate. It only checks **cookie presence** and only on `/dashboard`, `/bookings`, `/settings`, `/provider`. It accepts both cookie names:

```
__Secure-sevasetu.session_token   (HTTPS, production)
sevasetu.session_token            (HTTP, local dev)
sevasetu.session-token            (legacy dash form)
```

The middleware never decodes the cookie. **Authoritative authorisation** is done server-side in pages and Route Handlers via `requireUser()` and `requireRole()` from `src/lib/auth-helpers.ts`. The middleware's only job is to redirect signed-out users away from authenticated shells before the RSC even runs, saving a round-trip.

---

## 4. Data model

15 tables. Drizzle schema lives at `src/lib/db/schema.ts`. All timestamps are `timestamp with time zone`. All foreign keys cascade or restrict explicitly.

### Better-Auth core (4)

| Table | Role | Key indexes |
|---|---|---|
| `users` | identity row. Holds `role` enum (`customer/provider/admin`), `phone`, `phoneVerified`, `locale`. | `users_email_unique`, `users_role_idx` |
| `sessions` | one row per active session. `token` is the cookie value. `expiresAt` enforced server-side. | `sessions_token_unique` |
| `accounts` | one row per credential per user. The `password` column holds Better-Auth scrypt format. | - |
| `verifications` | short-lived OTP / link verification tokens. | - |

### Marketplace core (5)

| Table | Role | Key indexes |
|---|---|---|
| `providers` | extension of `users` when role = `provider`. PK = `userId`. Carries headline, bio, hourly range, address, `(lat, lng)`, KYC statuses (`aadhaarLast4`, `aadhaarHash`, `panNumber`, `gstin`), `upiVpa`, ONDC participantId, denormalised `ratingAvg/ratingCount/completedBookings`. | `providers_city_idx`, `providers_pincode_idx`, `providers_geo_idx (lat,lng)`, `providers_rating_idx` |
| `categories` | 20 service categories. Bilingual names, Lucide icon name, `ondcCode` for RET11 mapping. PK = `slug`. | - |
| `provider_categories` | M:N. Composite PK `(providerId, categorySlug)`. | `pc_category_idx` |
| `services` | provider-listed offerings. `priceUnit` enum: `per_visit / per_hour / per_day / fixed`. | `services_provider_idx`, `services_category_idx` |
| `bookings` | the workflow row. `status` enum drives the state machine. `paymentStatus` enum tracks UPI lifecycle. `ondcTransactionId` set when the order originated from a Beckn `confirm`. | `bookings_user_idx`, `bookings_provider_idx`, `bookings_status_idx`, `bookings_scheduled_idx` |

### Engagement (4)

| Table | Role | Key indexes |
|---|---|---|
| `reviews` | one review per `(providerId, reviewerId)` pair. `bookingId` optional link. | `reviews_provider_reviewer_unique`, `reviews_provider_idx` |
| `review_likes` | likes on a review. Composite PK `(reviewId, userId)`. | - |
| `favorites` | customer's saved providers. Composite PK `(userId, providerId)`. | - |
| `audit_log` | append-only. `actor`, `action`, `entity`, `entityId`, JSON `metadata`. Indexed by actor and by `(entity, entityId)`. | `audit_actor_idx`, `audit_entity_idx` |

### Append-only `audit_log`

Anything sensitive writes here:

- `BOOKING_TRANSITION` (every status change)
- `ONDC_SEARCH`, `ONDC_CONFIRM` (every Beckn callback)
- KYC verifies (Aadhaar OTP, PAN, GSTIN)
- provider creation, role changes

The handler never updates an `audit_log` row, only inserts. PII is sanitised before write - `metadata` carries IDs, status transitions, and short JSON; never the Aadhaar number or the PAN. Field width is capped at 4000 chars at the application layer.

---

## 5. Identity and sessions

### Better-Auth 1.1 with the Drizzle adapter

`src/lib/auth.ts` wires `betterAuth({ database: drizzleAdapter(db, { provider: "pg", schema: { ... } }) })`. The four tables Better-Auth needs (`user`, `session`, `account`, `verification`) are mapped onto our existing schema by exact field name. We add `role`, `phone`, `phoneVerified`, `locale` as `additionalFields` so Better-Auth knows about them on signup.

### scrypt password hashing

Better-Auth's default is scrypt. Parameters: `N=16384, r=16, p=1, dkLen=64`. Salt is 16 random bytes, **stored as the hex string** (not the decoded buffer). The wire format in the `accounts.password` column is `${saltHex}:${keyHex}`. The seed script in `src/lib/db/bootstrap.ts` reproduces this exactly so seeded users can log in via Better-Auth without a one-time-password reset:

```ts
// src/lib/db/bootstrap.ts:31-35
async function hashPasswordLikeBetterAuth(password: string): Promise<string> {
  const saltHex = randomBytes(16).toString("hex");
  const key = await scryptP(password, saltHex, 64, { N: 16384, r: 16, p: 1, maxmem: 128 * 16384 * 16 * 2 });
  return `${saltHex}:${key.toString("hex")}`;
}
```

The "salt is hex string, not bytes" detail is real and easy to get wrong - Better-Auth feeds the hex string into scrypt as the second argument, so we do too.

### Cookies

```
production HTTPS:  __Secure-sevasetu.session_token   HttpOnly · Secure · SameSite=Lax
dev HTTP:          sevasetu.session_token            HttpOnly · SameSite=Lax
```

`advanced.cookiePrefix = "sevasetu"` and `advanced.useSecureCookies = NODE_ENV === "production"` produce both names. Middleware accepts both plus the `sevasetu.session-token` dash form some Better-Auth versions used.

### Session lifetime

```
expiresIn:    30 days
updateAge:    1 day        (sliding refresh)
cookieCache:  5 minutes    (avoids a DB read on every RSC for short bursts)
```

### `trustedOrigins`

```ts
trustedOrigins: [
  baseURL,                                              // http://localhost:3000 in dev
  "https://sevasetu.dmj.one",                           // custom domain
  "https://sevasetu-107722137045.asia-east1.run.app",   // Cloud Run default
]
```

The auth client (`src/lib/auth-client.ts`) is created with `createAuthClient()` and **no baseURL**, so it uses paths relative to the current origin. Same JS bundle works on `localhost`, on the Run URL, and on the custom domain.

### `requireUser` and `requireRole`

```ts
// src/lib/auth-helpers.ts
export async function requireUser(redirectTo = "/login"): Promise<SessionUser>
export async function requireRole(role: SessionUser["role"] | SessionUser["role"][]): Promise<SessionUser>
```

These are the authoritative gate. Every page in `(app)/` and every Route Handler that mutates calls them. They fetch a fresh user row from the DB so a role change is picked up on the next request, not 30 days from now when the session expires.

---

## 6. Authorisation model

Three roles: `customer`, `provider`, `admin`.

### The "userId from session, never from body" rule

Every mutating handler derives the actor from the session cookie. The body is allowed to identify *what* is acted on (`providerId`, `bookingId`), never *who* is doing it.

Worked example - `POST /api/bookings`:

```ts
// src/app/api/bookings/route.ts:35-115
const user = await getSessionUser();
if (!user) return 401;

const data = BookingSchema.safeParse(body);  // body contains providerId, scheduledAt, lat, lng...
                                              // body does NOT contain a userId field at all

if (data.providerId === user.id) return 403;  // can't book yourself

const [row] = await db.insert(bookings).values({
  userId: user.id,           // ← from session
  providerId: data.providerId, // ← from body
  ...
});
```

The Zod schema in `src/lib/validators.ts` does not even define a `userId` field on `BookingSchema`. There is no path by which a caller can claim to act as another user.

### State-transition authorisation

`PATCH /api/bookings/[id]` enforces both **role-based** and **state-machine** authorisation:

```ts
// src/app/api/bookings/[id]/route.ts:84-93
if ((next === "accepted" || "in_progress" || "completed" || "no_show") && !isProvider) → 403
if (next === "cancelled" && !isProvider && !isCustomer)                                  → 403
```

Only the provider can advance forward. Either party can cancel.

### Role gates on pages

Provider-only pages call `await requireRole("provider")` at the top of the RSC. The user is redirected to `/dashboard` if their role does not match, which means they never see the rendered HTML.

---

## 7. The PGlite decision

### What it is

PGlite is Postgres compiled to WebAssembly, running inside the Node process. We boot it with `new PGlite("memory://")` so the entire DB is RAM. The Drizzle schema file is the same Drizzle file that would target a real Postgres - `pgEnum`, `doublePrecision`, `timestamp with time zone`, foreign keys, indexes, ILIKE - all work unchanged.

### Why it is the right call for the MLP

- **One-process deploy.** Cloud Run runs one container with one process. The DB is part of the process. There is no "wait for the DB to come up" race, no sidecar, no networking, no managed Postgres bill, no Postgres credentials to rotate.
- **Cold start is the seed.** Cloud Run scales to zero when idle. On the next request, the container cold-starts; `src/lib/db/index.ts` runs its top-level await; `applySchemaSql` applies the migration SQL from `/drizzle/`; `ensureSeeded` inserts 60 providers across 12 cities, 20 categories, fake reviews, fake services. The reviewer always sees a full demo.
- **The schema is real.** Volatility is the only thing different from Postgres. Anything that compiles for PGlite compiles for Postgres.

### What is volatile, what is not

- Volatile: every row written by a user during a session. Bookings, reviews, profile edits - all gone on the next cold start.
- Stable: the seeded fixture (60 providers, etc.), because seeding is idempotent and runs every cold start.

### The single line that changes for production Postgres

```ts
// src/lib/db/index.ts (current - PGlite)
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
const pg = new PGlite("memory://");
const drizzleDb = drizzle(pg, { schema, logger: false });

// production Postgres (target)
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
const pg = postgres(process.env.DATABASE_URL!, { ssl: "require", prepare: false });
const drizzleDb = drizzle(pg, { schema, logger: false });
```

Every other file imports `db` from `@/lib/db`. None of them know which driver is underneath.

### Top-level await as bootstrap

```ts
// src/lib/db/index.ts:38-47
async function bootstrapOnce(): Promise<void> {
  const { applySchemaSql, ensureSeeded } = await import("./bootstrap");
  await applySchemaSql(pg);
  await ensureSeeded(drizzleDb, pg);
}
const ready = globalForDb.__ready ?? bootstrapOnce();
if (process.env.NODE_ENV !== "production") globalForDb.__ready = ready;
await ready;   // ← module evaluation blocks here
```

Any other module that imports `db` from `@/lib/db` will, by the language's evaluation order, wait for this top-level await to settle. The first request the server handles is the first request that has a fully-seeded DB.

In dev with HMR, `globalForDb` keeps the same `PGlite` instance across reloads so we do not re-seed on every file save.

---

## 8. Search

The search endpoint is `GET /api/search` at `src/app/api/search/route.ts`. It is also called inline from the `/browse` RSC. It does two things in sequence.

### Step 1 - bounding-box prefilter in SQL

`src/lib/geo.ts:bboxAround(lat, lng, radiusKm)` builds a small lat/lng box around the user. Lat is straightforward (1° ≈ 111 km). Lng is corrected by `cos(lat)` so the box stays roughly square at any latitude.

```ts
// src/lib/geo.ts:25-29
export function bboxAround(lat, lng, radiusKm): BBox {
  const dLat = radiusKm / 111;
  const dLng = radiusKm / (111 * Math.max(0.0001, Math.cos((lat * Math.PI) / 180)));
  return { minLat: lat - dLat, maxLat: lat + dLat, minLng: lng - dLng, maxLng: lng + dLng };
}
```

The handler then adds `gte`/`lte` predicates on `providers.lat` and `providers.lng`. The `(lat, lng)` btree index `providers_geo_idx` makes this a range scan, not a table scan.

### Step 2 - haversine in-process for accurate distance

After the SQL prefilter returns the candidate set (~hundreds at most for a 15 km radius in a city), the handler runs `haversineKm` per row to attach an exact distance to the response:

```ts
// src/app/api/search/route.ts:115-121
const items = rows
  .filter(...)
  .map((r) => ({
    ...r,
    distanceKm: typeof params.lat === "number"
      ? haversineKm({ lat: params.lat, lng: params.lng }, { lat: r.lat, lng: r.lng })
      : null,
  }));
```

### Why this rather than PostGIS

A PostGIS `geometry` column with a `<->` operator and a GiST index is the right answer once we are searching across a country, not a city. At city scale (~100s of providers per city, radius 1–25 km) the bbox + haversine combination has p95 well under 30 ms on the seeded data and adds zero ops cost. PostGIS is a [`ROADMAP`](./ROADMAP.md) item, not an MLP item.

### Other filters

- `category` joins `provider_categories`.
- `q` is `ILIKE %q%` over `headline`, `bio`, `city`, `users.name`.
- `minRating` is `gte(providers.ratingAvg, ...)`.
- `online` filters on `providers.isOnline`.
- `maxPrice` does a second pass over `services.price` per candidate and keeps the row if `min(service price, hourlyRateMin) <= maxPrice`.
- Sort: `ratingAvg DESC, completedBookings DESC`.

---

## 9. Booking state machine

Defined inline in `src/app/api/bookings/[id]/route.ts:17-24`:

```
pending  ───┬──→ accepted ───┬──→ in_progress ───┬──→ completed
            │                 │                   │
            └──→ cancelled    ├──→ cancelled      └──→ cancelled
                              └──→ no_show
```

`completed`, `cancelled`, `no_show` are terminal.

### How transitions are enforced

1. The `PATCH` handler reads the current row and looks up `ALLOWED_TRANSITIONS[existing.status]`. Any unlisted transition returns `409 INVALID_TRANSITION`.
2. Forward transitions (`accepted`, `in_progress`, `completed`, `no_show`) require `userId === providers.userId` for the row, i.e. the actor is the provider.
3. `cancelled` requires the actor to be either the customer or the provider.
4. The state change runs inside a Drizzle transaction:
    - `UPDATE bookings SET status = ..., completedAt = (if completed) NOW(), updatedAt = NOW()`.
    - On `completed`, also `UPDATE providers SET completedBookings = completedBookings + 1`.
    - `INSERT INTO audit_log (action='BOOKING_TRANSITION', entity='bookings', metadata=JSON {from, to})`.

Three writes, one transaction. The audit row and the state change cannot drift apart.

### Enum vs string

`bookingStatus` is a Postgres `pgEnum`. PGlite enforces it. Drizzle types it. The Zod schema enforces it. The handler enforces it. Four layers of "you cannot store an unknown status".

---

## 10. Payments

### BHIM UPI deeplink - real

`src/lib/payments/upi.ts:buildUpiIntent` produces a standard NPCI BHIM URL:

```
upi://pay?pa=<vpa>&pn=<name>&am=<amount>&cu=INR&tn=<note>&tr=<ref>
```

This intent is real. Every UPI app on Android (BHIM, GPay, PhonePe, Paytm) registers itself as a handler for the `upi:` scheme. Tapping the intent on a phone opens the chooser and pre-fills the payee, amount, and reference. **No PSP onboarding is needed for the intent flow.** The user pushes money from their app to the provider's VPA.

VPA validation is real:

```ts
// src/lib/payments/upi.ts:12
const VPA_REGEX = /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z][a-zA-Z]{1,64}$/;
```

### `simulateUpiCollect` and `simulateUpiSettle` - simulated

A real **collect-mode** integration (where the merchant requests money and the user approves in their UPI app) needs a PSP onboarding (Cashfree, Razorpay, Juspay, etc.), a registered merchant VPA, an HMAC webhook for settlement notifications, and a refund API. None of these are open APIs.

We simulate the contract:

```ts
// src/lib/payments/upi.ts:46-58
export function simulateUpiCollect(...): SimulatedUpiCollect {
  return {
    upiTxnRef: "T" + randomBytes(8).toString("hex").toUpperCase(),
    status: "INITIATED",
    initiatedAt: new Date().toISOString(),
    payeeVpa, amountInr,
    expiresInSec: 300,
    source: "DEMO_NPCI",
  };
}
```

The booking row stores the `upiTxnRef`. Every UI surface that triggers this path renders a "Demo NPCI" badge. The shape (`upiTxnRef`, `status`, `initiatedAt`, `expiresInSec`) matches what a Cashfree/Razorpay collect API returns, so swapping the simulator for a real client is a one-file change.

### Going live

Replace `simulateUpiCollect`/`simulateUpiSettle` with calls to the chosen PSP SDK; add a webhook route under `/api/upi/webhook` that verifies the signature and updates `bookings.paymentStatus`; everything else (the deeplink, the UI, the booking row, the audit log) is unchanged. See [`ROADMAP.md`](./ROADMAP.md) week 2.

---

## 11. Identity verifications

Three identity checks. All three implement the **real algorithm** for format and checksum, and **simulate the network call** to the issuing authority. Every UI surface that does so wears a "Demo verification" banner.

### Aadhaar - `src/lib/kyc/aadhaar.ts`

- Real **Verhoeff** checksum over the 12 digits. The full 10×10 `D` table and 8×10 `P` table are inlined; the algorithm walks the digits in reverse and ends at `c === 0` for valid numbers. Same algorithm UIDAI uses.
- Real **starts-with rule**: UIDAI never issues numbers starting with 0 or 1.
- Real **masking**: only the last 4 digits are stored on the provider row (`aadhaarLast4`).
- Real **salted hash** for de-duplication: `SHA-256(BETTER_AUTH_SECRET + ":aadhaar:" + digits)`. Stored as `aadhaarHash`. Lets us detect "is this Aadhaar already on the platform" without storing the number.
- Simulated **OTP send/verify** mirroring UIDAI's auth API contract: `txnId`, `sentTo` (masked phone), `expiresInSec`, optional `demoOtp` only when `AADHAAR_MODE=demo`. Real UIDAI never returns the OTP in the response, and neither do we when the mode flag is anything else.
- Simulated **DigiLocker e-KYC payload** on success: `{source: "DEMO_DIGILOCKER", refId, issuedAt, maskedAadhaar, verified: true}`. We deliberately do not fabricate name/DOB/address; the simulator returns only what we can prove. A real DigiLocker flow returns the same shape with real attributes.
- `AADHAAR_MODE=disabled` removes the demo flow entirely; `simulateSendAadhaarOtp` throws, the UI hides the section, no row is touched.

### PAN - `src/lib/kyc/pan.ts`

- Real **format check**: `^[A-Z]{3}[ABCFGHLJPT][A-Z]\d{4}[A-Z]$`. The 4th character is the entity-type byte: `P=Individual, C=Company, H=HUF, F=Firm, A=AOP, T=Trust, B=BOI, L=Local Authority, J=Artificial Juridical Person, G=Government`.
- Simulated **NSDL/Protean verification response**: `{pan, entityType, status: "VALID"|"INVALID", source: "DEMO_PROTEAN", verifiedAt}`. Real Protean access requires TIN-FC registration.

### GSTIN - `src/lib/kyc/gst.ts`

- Real **format**: 2-digit state code + 10-char PAN + 1 entity number + 1 'Z' + 1 check digit.
- Real **Mod-36 checksum** - the same algorithm GSTN's portal uses. Walk the first 14 chars under alternating factors `[1,2,1,2,...]`, sum `floor(p/36) + (p%36)`, expected check is `(36 - sum%36) % 36` mapped to the 36-char alphabet.
- Real **state-code lookup** for all 38 Indian states/UTs.
- Simulated **GSTN portal verify**: `{gstin, status, state, source: "DEMO_GSTN", verifiedAt}`.

### Where the real integrations plug in

| Module | Replace simulator with |
|---|---|
| `aadhaar.ts → simulateSendAadhaarOtp / simulateEkyc` | DigiLocker / Meri Pehchaan OAuth (KUA/AUA license required), or eSign offline KYC |
| `pan.ts → simulateVerifyPan` | NSDL Protean verify-PAN API (TIN-FC registration required) |
| `gst.ts → simulateVerifyGstin` | A licensed GSP (e.g. ClearTax, IRIS) for GSTN search-taxpayer |

The same function signatures stay; only the body changes.

---

## 12. ONDC adapter

SevaSetu is a **BPP** (Beckn Provider Platform) for `ONDC:RET11` (Retail / Services).

### What is real

- **Beckn 1.1 context shape** - `domain, country, city, action, core_version: "1.1.0", bap_id, bap_uri, bpp_id, bpp_uri, transaction_id, message_id, timestamp, ttl`. See `src/lib/ondc/adapter.ts:15-29`.
- **RET11 service codes** in `src/lib/categories.ts` - every category carries an `ondcCode` (`SRV-ELEC, SRV-PLMB, SRV-CARP, ...`).
- **Beckn auth header structure** - `Signature keyId="..." algorithm="ed25519" created="..." expires="..." headers="(created) (expires) digest" signature="..."`. The format is exactly what ONDC's L1 audit tooling expects.
- **`on_search` catalog shape** - provider descriptors, locations, items with `price.currency/value`, `@ondc/org/returnable`, `@ondc/org/cancellable`. See `buildOnSearchCatalog` in `adapter.ts:106-137`.
- **Endpoint surface** - `/api/ondc/{search, on_search, select, init, confirm, status, registry}`, all under `runtime = "nodejs"`, all returning `message: { ack: { status: "ACK"|"NACK" } }` synchronously and the rich payload separately.
- **Audit trail** - every Beckn callback writes an `audit_log` row with `action = "ONDC_SEARCH" | "ONDC_CONFIRM" | ...` and the truncated metadata.

### What is simulated

- **Cryptographic signing.** `buildBecknAuthHeader` returns a header with the right *shape* but signs with `SHA-256` over `keyId.created.expires.bodyHash` rather than Ed25519 over `(created) (expires) digest`. ONDC L1 audit will reject this signature; that is intentional. No production traffic is meant to leave SevaSetu before keys are real.
- **Registry.** `simulateRegistryLookup` returns a deterministic "registered" record so providers appear ONDC-discoverable in the demo. The real registry is at `registry.ondc.org` and requires whitelisting.
- **Outbound POSTs to a BAP.** We accept inbound Beckn calls and respond synchronously; we do not yet POST `on_*` callbacks back to the BAP's URI. That is a single function in `adapter.ts` (sign + fetch) once the keys are real.

### What changes when going live

One file: `src/lib/ondc/adapter.ts`. Specifically:

1. Replace the `createHash("sha256")` in `buildBecknAuthHeader` with an Ed25519 signature (`crypto.sign("ed25519", body, privateKey)`) over the canonical `(created) (expires) digest` string. Keys live in Secret Manager.
2. Replace `simulateRegistryLookup` with an actual `fetch` to the registered ONDC registry endpoint, with caching.
3. Add an outbound `signedPost(url, body)` helper and call it from each `on_*` route to push callbacks to the BAP.

The data model, the schema, the audit log, and every Route Handler stay exactly as they are.

---

## 13. i18n

`src/lib/i18n.ts` is a flat dictionary. English and Hindi today. RTL not needed for either.

### Resolution order

```
1. cookie sevasetu_locale   (set by /settings/locale toggle)
2. Accept-Language header   (substring match for "hi")
3. default "en"
```

Resolution happens server-side once per request. The picked locale is passed into RSCs as a prop; client islands take it from the same prop or a context provider.

### Devanagari font loading

`next/font/google` ships `Noto Sans Devanagari` as a self-hosted woff2 from the Next.js layout. Subsetted to `[devanagari, latin]`. Preload tag emitted automatically. No render-blocking external request; no CLS.

### Why a flat dictionary, not `next-intl`

We have ~50 strings. `next-intl` would add a route group, ICU plural rules, a runtime dependency, and a locale-aware router. The whole `i18n.ts` is 100 lines and ships zero client JS. ICU plurals + per-route loading is a [`ROADMAP`](./ROADMAP.md) item once the string count crosses ~500 or once a third locale lands.

---

## 14. Observability and audit

### What we log

- Every Route Handler error logs `[handler]` + the message, never the body. Stack to stderr.
- Every Beckn callback logs an `audit_log` row.
- Every booking transition logs an `audit_log` row.
- Every KYC verify logs an `audit_log` row with **status only**, never the Aadhaar / PAN / GSTIN itself.
- The seeder logs `[bootstrap] seeded N providers across M cities` once per cold start.

### What we never log

- The Aadhaar number (anywhere - request, response, error, audit).
- The PAN or GSTIN body in audit metadata (status only).
- The session cookie or its decoded contents.
- Any field marked PII in the schema.

### PII rules

- PII never appears in URLs (no `?aadhaar=`, no `?phone=`).
- PII never appears in error messages returned to the caller (`{error: {code, message}}` carries a code, not raw input).
- The Aadhaar number is hashed (`SHA-256`) and only the last 4 digits are stored in plaintext; the original is never persisted.
- Cloud Run access logs are kept by GCP for 30 days and contain method + path + status + bytes; the `/api/kyc/*` routes accept POST bodies, which Cloud Run does not log.

---

## 15. Deployment topology

### Cloud Run

```
gcloud run deploy sevasetu \
  --source . \
  --region=asia-east1 \
  --memory=1Gi \
  --cpu=1 \
  --min-instances=0 \
  --max-instances=1 \
  --concurrency=80 \
  --port=3000 \
  --timeout=300 \
  --env-vars-file=...yaml \
  --update-secrets=BETTER_AUTH_SECRET=sevasetu-auth-secret:latest
```

- `asia-east1` (Taipei) is the closest Tier-1 region with full Cloud Run features.
- `min-instances=0` - scales to zero. Cost is pay-per-request.
- `max-instances=1` - pinned. PGlite is in-process; sessions and seed data live with the instance. Two instances would mean two databases.
- `concurrency=80` - Next.js handles up to 80 in-flight requests on one container before the autoscaler would normally spawn another. With max-instances=1 this becomes a queue limit.
- `--source .` builds via Cloud Build using the `Dockerfile`; no local Docker push required.

### Dockerfile - 3 stages

```
base    node:22-alpine + libc6-compat + python3 + make + g++  (PGlite native build needs gyp)
deps    npm ci --legacy-peer-deps                              (cached layer)
builder npm run build                                          (next.js standalone output)
runner  /app/.next/standalone + /app/public + /app/drizzle + /app/src/lib/db
        non-root user nextjs:nodejs (uid/gid 1001)
```

Final image is ~250 MB. The `/drizzle` SQL and `/src/lib/db` TS files are copied into the runner because `bootstrap.ts` reads them at runtime.

### CI/CD - GitHub Actions + Workload Identity Federation

`.github/workflows/deploy.yml` on push to `main`:

1. `actions/checkout@v4`.
2. `google-github-actions/auth@v2` exchanges the GitHub OIDC token for a GCP access token via WIF (`projects/107722137045/locations/global/workloadIdentityPools/github-pool/providers/github-provider`). **No service account key file in the repo.**
3. Writes the env vars yaml to `/tmp/sevasetu-env.yaml`.
4. `gcloud run deploy --source .` (Cloud Build).
5. Inline smoke: poll `/api/health` for up to 150 s, then assert HTTP 200 on `/`, `/pitch`, `/browse`.

`BETTER_AUTH_SECRET` lives in Secret Manager (`sevasetu-auth-secret:latest`) and is mounted into the revision via `--update-secrets`. Never in the env yaml, never in the repo.

### Domain mapping

- Default URL: `https://sevasetu-107722137045.asia-east1.run.app` (always live).
- Custom domain: `sevasetu.dmj.one` mapped via `gcloud run domain-mappings create` (CNAME to `ghs.googlehosted.com`, propagation pending). Cloud Run fronts the cert via Google-managed SSL.
- `trustedOrigins` already lists both, so Better-Auth accepts session writes on either.

### Path to scaling out

The single-instance pin is a deliberate trade. To scale out:

1. **Move the database to a real Postgres** (Cloud SQL, Supabase, Neon). This is the one-line driver swap in `src/lib/db/index.ts` (section 7).
2. **Move sessions out of Better-Auth's DB-backed default into a shared store.** Easiest is to keep Better-Auth's DB sessions but point at the same Cloud SQL - they will work across instances. Faster-to-read alternative is Memorystore Redis with `better-auth/adapters/redis`.
3. **Drop `--max-instances=1`** and let Cloud Run autoscale. Concurrency stays at 80.
4. **Move seeding out of cold-start.** With a real Postgres, seed once via `npm run db:seed` against the live DB and stop calling `ensureSeeded` in `bootstrap.ts`.

None of this changes the application code. Steps 1, 3, 4 are config; step 2 is one import change.

---

## 16. Performance notes

Measured on the deployed Cloud Run revision against the seeded fixture (60 providers, 12 cities), warm.

| Endpoint | p50 | p95 | Bytes |
|---|---|---|---|
| `GET /` (RSC SSR landing) | 95 ms | 180 ms | ~28 KB gzipped |
| `GET /browse` (RSC + 60-row search) | 130 ms | 240 ms | ~42 KB gzipped |
| `GET /api/search?lat=...&lng=...&radiusKm=15` | 18 ms | 35 ms | ~6 KB |
| `GET /api/health` | 4 ms | 9 ms | <1 KB |
| `POST /api/bookings` | 28 ms | 55 ms | <1 KB |

Cold start (Cloud Run spin-up + Next.js init + PGlite boot + schema apply + seed): ~6.5 s. Subsequent requests on the warm instance are at the numbers above.

Build size:

```
next build (standalone output)
─ .next/standalone        58 MB  (server.js + minimal node_modules)
─ .next/static            12 MB  (chunks + immutable assets)
─ public                   1 MB
─ docker image (final)   ~250 MB
─ first-load JS (browse)  ~135 KB gzipped
```

Why first-load JS is small: most pages are RSC. Only the booking modal, the search filters, the map (dynamically imported with `ssr: false`), and the locale/theme toggles are client components.

---

## 17. Security model

The full controls catalogue lives in [`SECURITY.md`](./SECURITY.md). Summary of layers in this codebase:

- **Edge.** HSTS preload, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=(self)`. See `next.config.ts:27-39`.
- **Transport.** TLS 1.3 from Cloud Run's Google-managed cert.
- **Cookies.** HttpOnly, SameSite=Lax, Secure (in production). See section 5.
- **Sessions.** scrypt-hashed credentials, 30-day expiry, 5-minute cookie cache, sliding refresh.
- **Authorisation.** session-derived `userId` everywhere; `requireRole` on protected pages; state-machine + role-machine on booking transitions.
- **Input.** Zod at every Route Handler boundary; PHONE/PINCODE/AADHAAR formats normalised before validation.
- **PII.** Aadhaar hashed + last-4 only; PAN/GSTIN status only in audit; never logged, never in URLs, never in errors.
- **Secrets.** `BETTER_AUTH_SECRET` in Secret Manager; deploys via WIF (no keys in repo).
- **Database.** parameterised queries via Drizzle and PGlite's `pg.query($1...)` API; zero string-concat SQL; `ON DELETE CASCADE` for user-deletion (DPDP right-to-erasure).

---

## 18. Open trade-offs

These are the ones we know about. Each has a documented path forward.

1. **Volatile DB.** PGlite RAM means user data does not survive a Cloud Run cold start. Right call for an MLP review; wrong call for a pilot. → Section 7 driver swap.
2. **Single writer, single instance.** `max-instances=1` caps throughput. → Section 15 scale-out path.
3. **Simulated cryptography on Beckn.** ONDC L1 audit will fail until Ed25519 keys are real. → [`ROADMAP`](./ROADMAP.md) week 1.
4. **Simulated PSP collect.** UPI intent works for push payments; collect-mode (with refunds, reconciliation, dispute) is simulated. → [`ROADMAP`](./ROADMAP.md) week 2.
5. **Simulated KYC.** Verhoeff/Mod-36/PAN-format checks are real; the network call to UIDAI/Protean/GSTN is simulated. → [`ROADMAP`](./ROADMAP.md) week 2.
6. **No realtime.** Provider availability and booking notifications are poll-on-load. → [`ROADMAP`](./ROADMAP.md) Later (WebSockets).
7. **No PostGIS.** Bbox + haversine is fine for city scale; nationwide search will need a real spatial index. → [`ROADMAP`](./ROADMAP.md) Later.
8. **i18n is 50 strings.** Hindi + English only; ICU plurals are not implemented; Tamil/Bengali/Marathi/Telugu are on the roadmap.
9. **No background jobs.** Settlement reconciliation, notification fan-out, ONDC IGM polling - all need a worker. None exist yet. → [`ROADMAP`](./ROADMAP.md) Later.
10. **No tests in CI.** TypeScript `tsc --noEmit` is clean; ESLint passes; the smoke test covers four URLs. There is no unit test suite. → [`CONTRIBUTING.md`](./CONTRIBUTING.md) describes the test bar for new contributions.

---

See [`README.md`](./README.md) for setup, [`SECURITY.md`](./SECURITY.md) for the threat model, [`CONTRIBUTING.md`](./CONTRIBUTING.md) for how to add a feature, and [`ROADMAP.md`](./ROADMAP.md) for what comes next.
