# Contributing to SevaSetu

Thanks for taking the time to read this. SevaSetu is a B.Tech Cybersecurity capstone project by Abhay Chandel, but it is built and reviewed to production standards. Pull requests, bug reports, and translation help are welcome from anyone.

If you are about to file a **security** issue, stop and read [`SECURITY.md`](./SECURITY.md) first. Do not open a public issue for a vulnerability.

---

## Code of conduct

This project follows the [Contributor Covenant 2.1](./CODE_OF_CONDUCT.md). By participating you agree to abide by it. Conduct concerns go to `security@dmj.one`.

---

## Local setup

You need Node.js 20+ and Docker (for Postgres) or any Postgres 14+ reachable via `DATABASE_URL`.

```bash
git clone https://github.com/divyamohan1993/sevasetu.git
cd sevasetu
npm install
cp .env.example .env.local
# generate a secret and paste it as BETTER_AUTH_SECRET in .env.local:
openssl rand -base64 32
docker compose up -d db
npm run db:push
npm run db:seed
npm run dev
```

The app comes up at `http://localhost:3000`. Demo accounts are documented in `README.md`.

---

## Branches and commit messages

- Branch from `main`. Feature branches are named `feat/<short-slug>`, fixes are `fix/<short-slug>`, docs are `docs/<short-slug>`.
- Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/). The prefixes we accept are:
  - `feat:` — a new user-visible capability
  - `fix:` — a bug fix
  - `docs:` — documentation only
  - `chore:` — tooling, config, dependency bumps
  - `refactor:` — code changes that neither fix a bug nor add a feature
  - `test:` — adding or repairing tests
- Keep the subject under 72 characters. A short body is welcome when the why is non-obvious.
- One logical change per commit. Squash-merge is the default on GitHub.

Example:

```
feat(bookings): support cancellation by customer before confirmation

Adds POST /api/bookings/[id]/cancel with an explicit allow-listed
state transition (pending -> cancelled). Audit-logged.
```

---

## Code style

- **TypeScript**: `strict` is on. No `any` without a comment explaining why.
- **ESLint** is the source of truth for code style. The build fails on lint errors.
  - Run locally: `npm run lint`
  - Fix what can be auto-fixed: `npm run lint -- --fix`
- **Prettier** with `prettier-plugin-tailwindcss` orders Tailwind classes consistently.
  - Run locally: `npx prettier --write .`
- **Type-check** before pushing: `npm run typecheck` (runs `tsc --noEmit`).

A push that lints clean and type-checks clean is ready for review.

---

## The one architectural rule that matters

**Never trust the caller's `userId`. Always derive it from the session.**

This is the single most important rule in the codebase. Every protected route looks like this:

```ts
import { getSessionUser } from "@/lib/auth-helpers";
import { requireRole } from "@/lib/auth-helpers";

export async function POST(req: Request) {
  const user = await getSessionUser(); // session-derived, never body-derived
  if (!user) return new Response("Unauthorized", { status: 401 });

  const role = await requireRole(user, "provider");
  if (!role.ok) return new Response("Forbidden", { status: 403 });

  // ...validate the body with Zod, do the work, audit-log if state changed
}
```

A PR that reads `userId` from `req.json()` and uses it for authorisation will be rejected. If you need to act on behalf of another user (admin operations), use a separate route that requires the `admin` role and pass the target id through Zod-validated path parameters, not body fields.

The middleware in `src/middleware.ts` is a soft-gate; the page or route handler is the authoritative check. Do not assume the middleware has already filtered anything.

---

## Tests and CI

GitHub Actions is the canonical pipeline. Every push and pull request runs:

1. `npm ci`
2. `npm run lint`
3. `npm run typecheck`
4. `npm run build`

Smoke testing happens **after** deploy, against the live URL. Your PR must keep all four steps green.

There is no unit-test harness on `main` yet; keep your changes small enough to be reviewed by reading the diff and exercising the relevant flow in the browser. If you add a non-trivial pure function (validators, KYC algorithms, geo math), please add a tiny test alongside it under `src/**/__tests__/` using `node:test`.

---

## Adding a new API route

The pattern, in order:

1. Add a Zod schema for the request body to `src/lib/validators.ts`. Export it.
2. Create the route handler under `src/app/api/<resource>/route.ts` (or `src/app/api/<resource>/[id]/route.ts` for parameterised routes).
3. Inside the handler:
   - Derive `userId` from the session.
   - Re-check role with `requireRole()` if the route is role-restricted.
   - `parse()` the body with the Zod schema. Return `400 { error: { code: "VALIDATION", ... } }` on failure.
   - Do the work using Drizzle. No raw SQL.
   - If the route changes state on a resource that has a state machine (bookings, KYC, provider verification), append a row to `audit_log` in the same transaction.
   - Return `{ data: ... }` on success or `{ error: { code, message, details? } }` on failure. Never leak internal errors to the client.
4. Add the corresponding client call in `src/lib/api-client.ts` if the route is consumed by the UI.

Routes without audit-logging on a state transition will be rejected in review.

---

## Adding a new locale string

The dictionary lives in `src/lib/i18n.ts`. Two rules:

- Every new key must exist in **both** the `en` and `hi` dictionaries. The build does not currently fail on a missing key, but a missing translation will render as the key string itself in production, which looks awful.
- Use full sentences as keys, not abbreviations. `"booking.confirm_dialog.title"` is good; `"bcdt"` is not.

When you add a new language, copy the entire `en` dictionary as the starting template and translate from there. Cookie name is `sevasetu_locale`.

---

## Adding a dependency

Adding a dependency is a security decision, not a convenience decision. Before opening the PR:

- Justify the dependency in the PR description: what does it do, why can't we write it ourselves in a few lines, what is its weekly download count and last-publish date.
- Prefer dependencies with zero or near-zero transitive dependencies of their own.
- Run `npm audit` after adding it.
- Update `package-lock.json` and commit it.

PRs that add a dependency without justification will be asked to remove it.

---

## UI changes

This project takes accessibility seriously (WCAG 2.2 AA minimum, AAA where reasonable). For any UI change:

- Keyboard-navigable. Tab order is sensible, focus rings are visible.
- Screen-reader-friendly: real `<button>`s, `aria-label` on icon-only controls, `<label>` tied to form fields.
- Light, dark, and system themes all look right. We use CSS variables; do not hard-code colours.
- Hindi rendering: confirm Devanagari does not break your layout. Strings get longer in Hindi roughly 20% of the time.
- Mobile-first. The target user is on a slow phone with bad internet. Test at 360 px width.

---

## Filing a security issue

Do **not** open a public GitHub issue. Email `security@dmj.one`. See [`SECURITY.md`](./SECURITY.md) for the full disclosure process and the threat model.

---

## Sign-off

A Developer Certificate of Origin sign-off (`Signed-off-by:` line, `git commit -s`) is welcome but not required for this project. By contributing you confirm that your contribution is your own work or that you have permission to submit it under the project's MIT licence.

---

Thanks again. Patches that make SevaSetu faster on a 2G connection, more accessible to a screen reader user, or harder to break into are doubly welcome.
