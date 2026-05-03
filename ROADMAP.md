# SevaSetu - Roadmap

Where the project is, where it goes next, and what comes after. Pairs with [`ARCHITECTURE.md`](./ARCHITECTURE.md) for the technical context behind each item.

---

## Now - what is shipped

The MLP is live at `https://sevasetu-107722137045.asia-east1.run.app` (custom domain `sevasetu.dmj.one` mapped, CNAME pending propagation). A reviewer with no setup gets a fully-seeded marketplace in under 7 seconds of cold start.

End-to-end flows that work today:

- **Customer flow.** Signup → browse 60 seeded providers across 12 cities and 20 categories → filter by category, rating, price, online status, distance → open a provider → see services, reviews, live availability → book with date/time/address/notes → tap a real BHIM UPI deeplink → write a review post-completion.
- **Provider flow.** Signup as provider → onboard with headline/bio/rates/location/categories → run Aadhaar (Verhoeff-checked, OTP-simulated), PAN (format-checked, NSDL-simulated), GSTIN (Mod-36-checked, GSTN-simulated) verifications → list services → accept incoming bookings → advance through `pending → accepted → in_progress → completed` → see a denormalised rating/booking count update.
- **Beckn / ONDC.** SevaSetu exposes `/api/ondc/{search, on_search, select, init, confirm, status, registry}` with the real Beckn 1.1 context shape and real RET11 service codes. Inbound `confirm` calls create a booking row tagged with the BAP's `transaction_id` and audit-log it.
- **Bilingual UI.** Every customer-facing string available in English and Hindi. Cookie + `Accept-Language` resolution; Devanagari served via `Noto Sans Devanagari` from `next/font/google`.
- **Theme.** Light, dark, and system, via CSS variables and `next-themes`.
- **Observability.** `/api/health` checks DB liveness; every booking transition and every Beckn callback writes an `audit_log` row.
- **Deploy.** Push to `main` → GitHub Actions → Workload Identity Federation → `gcloud run deploy --source .` → smoke test on `/api/health`, `/`, `/pitch`, `/browse`. ~7 minutes from commit to live URL. No service account keys in the repo.

What is **not** shipped yet, by design:

- No real ONDC registry whitelisting. The Beckn auth header is simulated (SHA-256 over the canonical string, not Ed25519). See [`ARCHITECTURE.md` §12](./ARCHITECTURE.md).
- No real KYC. The algorithms are real; the network calls to UIDAI / NSDL / GSTN are not. See [`ARCHITECTURE.md` §11](./ARCHITECTURE.md).
- No real PSP. UPI intent (push) works; collect-mode (pull, with webhooks and refunds) is simulated. See [`ARCHITECTURE.md` §10](./ARCHITECTURE.md).
- No persistent DB. PGlite is volatile; data resets when Cloud Run scales to zero. See [`ARCHITECTURE.md` §7](./ARCHITECTURE.md).
- No native apps; no realtime; no background workers.

---

## Next - three weeks to a Tier-2 city pilot

Ordered. Each week ends with a verifiable milestone.

### Week 1 - ONDC onboarding (turn the simulated BPP into a real BPP)

The whole adapter surface is already correct. The change set is keys, registry, and the signer.

1. **Register a participant id.** Submit the BPP application via `https://portal.ondc.org/`. SevaSetu becomes `<sub>.bpp.sevasetu.in` once approved.
2. **Generate Ed25519 + X25519 keys.** Two keypairs: signing (Ed25519) and encryption (X25519). Public keys go into the registry submission. Private keys go into Secret Manager (`sevasetu-ondc-signing-key`, `sevasetu-ondc-encryption-key`) and mount via `--update-secrets` on Cloud Run.
3. **Replace the signer.** In `src/lib/ondc/adapter.ts:buildBecknAuthHeader`, swap `createHash("sha256")` over `keyId.created.expires.bodyHash` for `crypto.sign("ed25519", canonicalString, privateKey)` over `(created) (expires) digest`. One function. Schema and Route Handlers do not change.
4. **Wire outbound callbacks.** Add a `signedPost(targetUri, body)` helper. Call it from `on_search`, `on_select`, `on_init`, `on_confirm`, `on_status` to push payloads back to the BAP that initiated the call.
5. **Replace the registry stub.** Swap `simulateRegistryLookup` for a `fetch` to the real ONDC registry endpoint (`https://registry.ondc.org/v2.0/lookup`) with a 5-minute in-process LRU cache.
6. **Pass the L1 audit.** ONDC's L1 audit tooling validates 16 flows end-to-end - `search`, `select`, `init`, `confirm`, `status`, `cancel`, `update`, `track`, `support`, `rating`, `issue`, `issue_status`, plus their `on_*` callbacks. Run against staging until all 16 are green.

**Milestone:** L1 audit passes. SevaSetu providers appear in any ONDC BAP's catalog when a customer searches for `SRV-ELEC` (electrician), `SRV-PLMB` (plumber), etc. in a SevaSetu city.

### Week 2 - Real KYC and a real PSP

#### Real Aadhaar - DigiLocker + Meri Pehchaan (preferred path)

DigiLocker via Meri Pehchaan is the public-access route to verified Aadhaar attributes (name, DOB, gender, address) without a KUA/AUA license. Flow:

1. Register a Meri Pehchaan client at `https://meripehchaan.gov.in/`. Client ID + secret to Secret Manager.
2. Add `/api/auth/digilocker/{authorize, callback}` Route Handlers that implement the OAuth 2.0 authorisation-code flow.
3. On callback, fetch the Aadhaar XML from DigiLocker's `getKYC` endpoint, verify the issuer signature, persist the **last 4 + salted hash** (we already have those columns), and set `aadhaarStatus = "verified"`, `aadhaarVerifiedAt = NOW()`.
4. Replace `simulateSendAadhaarOtp` / `simulateVerifyAadhaarOtp` calls in the UI with the OAuth redirect.

The Verhoeff checksum stays as a client-side guard for typos before the redirect.

#### Real PAN - NSDL Protean

1. Register a TIN-FC partner agreement (the practical route is via a service aggregator like Karza, IDfy, or Signzy; we will use Karza for the pilot).
2. Replace `simulateVerifyPan` body with a `fetch` to Karza's verify-PAN endpoint, signed with HMAC-SHA-256.
3. Cache the verified result for 24 h per PAN to avoid repeat charges.

#### Real GSTIN - GSP

Same pattern - a GSP (we will use IRIS or ClearTax) wraps GSTN's `search-taxpayer` API. Replace `simulateVerifyGstin` body.

#### Real PSP - Cashfree (preferred) or Razorpay

1. Onboard SevaSetu as a merchant on Cashfree Payments. Get `clientId`, `clientSecret`. To Secret Manager.
2. Replace `simulateUpiCollect` body with Cashfree's `/orders` API call. Returns the same `upiTxnRef` shape we already use; the booking row is unchanged.
3. Add `/api/upi/webhook` that verifies the Cashfree webhook signature and sets `bookings.paymentStatus = "paid"` on success, `"failed"` on failure.
4. Add a refund flow: `POST /api/bookings/[id]/refund` that calls Cashfree's `/refunds` API; gated by `requireRole(["admin", "provider"])` and a transition-to-cancelled audit row.
5. Daily reconciliation script (`scripts/reconcile.ts`) that fetches the previous day's settlements from Cashfree and asserts every `paid` booking has a matching settlement.

**Milestone:** A real provider can sign up, complete real Aadhaar + PAN + GSTIN verification, list services, take a real UPI booking, and see the money settle into their bank account. Refund path works end-to-end.

### Week 3 - Tier-2 city pilot

City: **Shimla** (Himachal Pradesh) - close to Shoolini University, manageable density, low competitive saturation, decent smartphone penetration.

1. **Hand-curate 50 providers across 4 categories.** Electricians, plumbers, AC repair, home cleaning. Onboard in person; complete real KYC on each; set hourly rates with them; capture a profile photo.
2. **90-day free trial.** Zero platform fee on the first 90 days. After that, 8 % per completed booking.
3. **Weekly NPS.** Two-question survey on day 7, 30, 60, 90: "How likely are you to recommend SevaSetu to another provider/customer? Why?" SMS-delivered, free-text response, manually triaged for the first 90 days.
4. **Launch metric.** Completed bookings per active provider per week. Target = **4**. An active provider is one who has accepted ≥ 1 booking in the last 7 days.
5. **Customer acquisition.** Tie up with one apartment-society management portal (likely MyGate) to push a SevaSetu QR code into 5 Shimla societies. No paid ads in week 3 - we want to learn from organic demand first.
6. **Dashboards.** Provider dashboard already shows weekly bookings; add a customer-side "your previous providers" panel and a city-level admin view (gated by `requireRole("admin")`) showing the 4-bookings-per-week metric live.

**Milestone:** 50 active providers, ≥ 200 completed bookings in week 3, ≥ 50 % of providers hitting the 4-bookings target by week 12. NPS ≥ 30. If we miss any of these, the next iteration is data-driven, not feature-driven.

---

## Later - non-blocking but desirable

Things we want, in rough priority order. None of these blocks the Tier-2 pilot.

- **Native Android (first), then iOS.** Reuses the existing REST + Beckn surface 1:1 - no new backend. React Native via Expo. Targets Android 10+ (covers ~95 % of the Indian smartphone base). Offline-first booking queue (see PWA item).
- **Realtime availability.** WebSocket channel per provider (`/api/realtime/providers/[id]`) that pushes `isOnline` and current-booking state to subscribed customers. Backed by Memorystore Redis pub/sub once we are off PGlite.
- **Offline-first PWA.** Service worker caches `/browse`, the provider grid, and the static parts of the booking modal. IndexedDB queues `POST /api/bookings` writes when the user is offline; service worker drains the queue when the network returns. Conflict resolution: server is authoritative; queued writes that fail validation surface as a notification, not silent data loss.
- **More locales.** Tamil, Bengali, Marathi, Telugu. Add `next-intl` and ICU plurals once the dictionary crosses ~500 strings (we are at ~50 today). Each locale needs a native-speaker pass; we will not auto-translate.
- **Provider analytics.** Weekly revenue, peak booking hours, decline rate, average rating trend, refund rate, response-time-to-accept. One page per provider, RSC-rendered.
- **ONDC IGM (Issue & Grievance Management).** The Beckn `/issue` and `/issue_status` flows. Customer raises an issue against a booking; SevaSetu becomes the BPP-side resolver; SLA-tracked. Required for graduated ONDC participation.
- **PostGIS.** Once the catalogue crosses ~50 cities, swap the bbox + haversine combo for a `geometry` column with a GiST index and the `<->` operator. Drizzle has a community PostGIS plugin; otherwise drop down to raw SQL for the search query only.
- **Background workers.** Settlement reconciliation (daily), notification fan-out (per-event), ONDC IGM polling (per-issue), KYC re-verification (annually). Cloud Run Jobs with Cloud Scheduler triggers.
- **Provider mobile-first onboarding.** Most current onboarding fields are typed in a desktop browser. Capture the name/photo/Aadhaar/PAN/UPI VPA in a phone-only flow, with the camera feeding directly into DigiLocker.
- **Customer trust signals.** Verified badge variants (Aadhaar-only, Aadhaar+PAN, Aadhaar+PAN+GSTIN). Police-verification add-on for elder-care, babysitter, driver categories - partner with a third-party background-check service.
- **Provider self-serve cancellation policies.** Today the policy is implicit. Let providers pick from three pre-defined templates (free cancel up to 4 h, 24 h, no free cancel) and enforce automatically.
- **A/B framework.** A flag-server (not a feature flag library; a small Drizzle table + a server-side resolver) so launch experiments can be controlled per-cohort without a redeploy.

---

See [`ARCHITECTURE.md`](./ARCHITECTURE.md) for how the current pieces fit together, [`SECURITY.md`](./SECURITY.md) for the controls catalogue, [`CONTRIBUTING.md`](./CONTRIBUTING.md) for the contribution bar, and [`README.md`](./README.md) for setup.
