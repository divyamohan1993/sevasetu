# Origin Brief

This file is the genesis document of SevaSetu. The original brief is preserved verbatim below; the rest of the page is the polished vision that grew out of it.

## Original Brief (verbatim)

> Local Services Finder (with Reviews)
> Find electricians, tutors, labours, Any type of services etc.
> Add ratings, comments
> Map integration (Google Maps API)
>
> Service provider User can Add service, money, and thier personal info like name, contact number, and adhar card number for better experience or to free from frauds
> And other user can see who is available for the services
>
> Make a login portal for both service provider and the user
> And user can like / rate / comment in thier profile if they want
>
> Its up to you which will suit the project. You can add more thing by yourself

The brief above is the seed prompt from Abhay Chandel that started the project. Everything that follows is how the brief was reformulated into a vision for a real product that small-town India can actually use.

## What we are building

SevaSetu (सेवा सेतु, "the bridge of service") is a trust-first local services marketplace for Bharat. A customer types a need (electrician, tutor, plumber, cook, driver, mason) and a city, sees verified nearby providers on a map, reads real reviews, books a slot in a couple of taps, and pays through UPI. A provider creates one profile, lists services, accepts bookings, gets paid, and builds a reputation that travels with them.

The product is built on three primitives the original brief asked for, each taken to production grade. Discovery is geographic and category-aware, not a flat list. Identity is anchored to government rails — Aadhaar, PAN, GSTIN — so a "verified" badge means something. Reputation is a public record of completed bookings and reviews tied to verified identities, not anonymous stars.

## Who it is for

The first user is the small-town and tier-2 / tier-3 city household that today finds a plumber by asking a neighbour, paying cash, and having no recourse if the work goes wrong. The second user is the independent service worker who has a phone, a skill, and no way to be discovered beyond their immediate locality. SevaSetu has to work on a slow phone over a flaky 4G connection, in Hindi or English, in light or dark mode, with a screen reader, on a 360px-wide screen. If it does not work there, it does not work.

## What we are explicitly not building

Not a gig-economy aggregator that owns the worker. Providers keep their pricing, their customers, and their data. Not a closed marketplace either; SevaSetu is built as an ONDC Beckn BPP from day one so any ONDC buyer app can discover its providers. Not a payments platform; UPI does the heavy lifting and SevaSetu is just a deeplink and a webhook away from settlement. Not a real Aadhaar / PAN / GST integration in the v0.1.0 release; those flows are simulated transparently with a "Demo verification" banner, against the real wire formats, so the production switch is a credential change, not a rewrite.

## What success looks like

A v0.1.0 success is a working public deployment that a reviewer can open on a phone, sign up, browse providers in a city they know, book a service, and see the booking appear on the provider side, end to end. A v1.0 success is the same flow with live UIDAI / NSDL / GSTN credentials, live ONDC subscription, and at least one launch city with real providers earning real money. The longer arc is captured in [ROADMAP.md](ROADMAP.md).

## How it fits together

The README ([README.md](README.md)) is the operator's view: how to run it, what the demo accounts are, what the API surface looks like. The architecture document ([ARCHITECTURE.md](ARCHITECTURE.md)) is the engineer's view: data model, auth, ONDC adapter, deploy topology, threat model. This file is the why behind both.

The brief Abhay wrote is short on purpose. It names the user need, the trust gap (Aadhaar), and the discovery primitive (a map), then leaves the rest open. SevaSetu is the answer to that opening: a production-grade implementation of a one-paragraph idea, shipped end-to-end in two days, designed to scale to the country it was written for.
