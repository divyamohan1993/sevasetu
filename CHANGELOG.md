# Changelog

All notable changes to **SevaSetu** are recorded in this file.

The format is based on [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning 2.0.0](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

Tracks ongoing work between tagged releases. Empty at the time of writing.

## [0.1.0] — 2026-05-03

First public release. Built end-to-end on 2026-05-02 and 2026-05-03 as the B.Tech Cybersecurity capstone of Abhay Chandel (Reg. GF202217661, Shoolini University).

### Added

- Initial public release of the SevaSetu marketplace.
- 13 server-rendered pages and 27 REST API routes on Next.js 15 App Router.
- PGlite-backed in-process Postgres with auto-migrate on boot and an idempotent seed of 60 demo providers across 12 cities.
- Better-Auth 1.1 with email and password sign-in, scrypt password hashing (N=16384, r=16, p=1, dkLen=64), session cookies, and customer / provider / admin roles.
- 22 Radix-based shadcn/ui primitives, Tailwind CSS v4 token system, and light / dark / system themes.
- English and हिन्दी (Hindi) localisation, with Devanagari rendered via Noto Sans Devanagari.
- Leaflet plus OpenStreetMap browse view, geographic search backed by a bounding-box prefilter and haversine ranking.
- Provider profile, services, reviews, bookings, and favorites flows, with a full booking state machine and an `audit_log` of every transition.
- Aadhaar (Verhoeff), PAN (regex plus entity-type byte), and GSTIN (Mod-36) verifications, transparently simulated behind `Demo verification` banners.
- BHIM UPI deeplink generator and a simulated NPCI collect / settle path.
- Beckn 1.1 / `ONDC:RET11` BPP adapter with the real contract surface, simulated Ed25519 signer, and a simulated registry.
- 25-slide self-hosted capstone presentation served at `/pitch` (arrow keys / number keys / Home / End for navigation, `N` for notes, `F` for fullscreen).
- Capstone report (`SevaSetu_Capstone_Report.docx`) generated against the supplied template structure.
- Cloud Run deployment in `asia-east1` (Tier 1 pricing) with scale-to-zero and a single instance pinned for session consistency.
- GitHub Actions auto-deploy via Workload Identity Federation; no service-account keys are stored in the repository, the runner, or the cloud project.
- Custom domain mapping for `sevasetu.dmj.one`.

### Fixed

- Better-Auth client baked the build-time `NEXT_PUBLIC_APP_URL` (which defaulted to `http://localhost:3000`) into the client bundle, breaking sign-in on production with a CORS error. The explicit `baseURL` was dropped; the client now uses paths relative to `window.location.origin`. ([src/lib/auth-client.ts](src/lib/auth-client.ts))
- Middleware checked only the bare cookie name `sevasetu.session_token`, while Better-Auth automatically prefixes secure cookies with `__Secure-` over HTTPS per RFC 6265bis. The middleware now accepts both names. ([src/middleware.ts](src/middleware.ts))
- Multi-instance Cloud Run routing split sessions across containers because PGlite is in-process. The deploy was pinned to `--max-instances=1`. ([.github/workflows/deploy.yml](.github/workflows/deploy.yml))

### Changed

- Migrated Cloud Run from `asia-south1` (Tier 2 pricing, no domain mapping) to `asia-east1` (Tier 1 pricing, supports custom domain mapping) on 2026-05-02.
- ONDC labelling on every public UI surface now reads "ONDC-discoverable (simulated demo)" or "ONDC subscribed (demo)", so the demo state is never mistaken for live network membership. ([src/app/page.tsx](src/app/page.tsx), [src/components/layout/footer.tsx](src/components/layout/footer.tsx), [src/components/provider-card.tsx](src/components/provider-card.tsx), provider profile, provider dashboard)

### Security

- Aadhaar plaintext is never persisted; only the `last4` digits and a salted SHA-256 hash are stored.
- All API boundaries are validated with Zod, and Drizzle parametrised queries are used throughout.
- Response headers set HSTS, `X-Frame-Options=DENY`, `X-Content-Type-Options=nosniff`, `Referrer-Policy=strict-origin-when-cross-origin`, and `Permissions-Policy=camera=(), microphone=(), geolocation=(self)`. ([next.config.ts](next.config.ts))
- The `audit_log` table records every KYC verification, booking transition, and provider creation.

[Unreleased]: https://github.com/divyamohan1993/sevasetu/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/divyamohan1993/sevasetu/releases/tag/v0.1.0
