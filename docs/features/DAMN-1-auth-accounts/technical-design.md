# Feature: Auth / accounts

**Linear issue:** DAMN-1
**Release:** V1

## Summary

Wire authentication end to end: hosted WorkOS AuthKit (email OTP) gates the whole SPA, the API verifies bearer JWTs and just-in-time provisions a local `users` row, and the walking-skeleton page is replaced by a minimal authenticated landing. Invite-only — no public sign-up (enforced by WorkOS, not app code).

## UX / UI

No bespoke UI. The login surface is WorkOS-hosted (AuthKit on `*.authkit.app`), themed only through WorkOS Branding settings — not a page we design or build. The one in-app screen is a bare "signed in as ‹email›" landing with a sign-out button, explicitly unstyled scaffolding that DAMN-2 replaces. Mockup pass skipped by owner decision — no app-level look-and-feel calls are being made here; deferred to a future whole-site UI pass (not yet tracked).

## Data model

New table, `packages/db/src/schema.ts`. `app_meta` (DAMN-26 scaffold) is dropped in the same migration.

```ts
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  workosUserId: text('workos_user_id').notNull().unique(),
  // Lower-cased before storage; WorkOS treats email as case-insensitive per environment.
  email: text('email').notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
```

Deliberately minimal: no name/avatar/role columns (that's `profiles`, out of scope — DAMN-4/DAMN-14) and no credential-type column (ADR-0007 — stays agnostic; a V3 Google identity is a separate association, not a column here).

**Migration:** one `drizzle-kit generate` pass — drops `app_meta`, adds `users`. DAMN-2 regenerates the baseline migration and squashes this one in (already called out in the locked scope); nothing here should try to anticipate that squash.

## API surface

### Token verification

- `TokenVerifier` interface (`apps/api/src/auth/`): `verify(bearerToken: string): Promise<{ sub: string }>`, throws a typed `TokenInvalidError` (bad signature/claims) or `TokenExpiredError` (expired) — the guard maps these to different HTTP responses (see below), and a third case, JWKS-fetch failure, maps separately.
- Real implementation (`WorkosTokenVerifier`): `jose.jwtVerify` against the WorkOS JWKS (`https://api.workos.com/sso/jwks/{WORKOS_CLIENT_ID}`), checking `iss` and `exp` (`clockTolerance: 5s`). The JWKS key set must be fetched once and reused (`jose.createRemoteJWKSet`, or the WorkOS SDK's own cached JWKS helper if it fits more cleanly — confirm exact call during implementation) — never re-created per request, both for latency and to respect WorkOS's rate limits.
- **`aud` claim: deliberately not checked in V1.** AuthKit session tokens don't carry one by default; enabling it means configuring a JWT template in the WorkOS dashboard for no real gain with a single first-party API client. Flagged here so it reads as a decision, not an oversight, for the pre-merge security review. Revisit if a second API client ever consumes these tokens.
- Stub implementation for the component test tier, injected via a NestJS provider token so tests never need a live WorkOS.
- **Authorize on claims WorkOS itself won't repurpose** — key the local user strictly on `sub`, never on email (WorkOS's own guidance: email can change; `sub` doesn't).

### Guard

- `JwtAuthGuard`, registered globally (`APP_GUARD`). `@Public()` decorator (metadata + `Reflector`) exempts `GET /api/health`.
- Reads `Authorization: Bearer <token>`. Success path: `UsersService.findOrProvision(sub)` (see below), attaches `req.user = { id, workosUserId, email }`.
- Error mapping matters here, not just "401 on failure":
  - Missing/malformed header → 401 `{ error: 'unauthenticated' }`.
  - Verification fails on signature/claims → 401 `{ error: 'invalid_token' }`.
  - Verification fails on expiry → 401 `{ error: 'token_expired' }` (distinct code — the AuthKit React SDK already auto-refreshes before expiry client-side, so this should be rare, but the client can tell "refresh and retry" apart from "sign in again").
  - **JWKS fetch itself fails (network/WorkOS outage) → 503, not 401.** Treating a transient JWKS-fetch failure as an invalid token would sign out every active session during a WorkOS blip — the one failure mode worth explicitly guarding against.
- **Frontend consumption of the two 401 variants:** a small API client wrapper around `fetch` (used for every `/api/*` call, including `GET /api/me`) checks for a 401 response and, for V1, treats `invalid_token` and `token_expired` identically — both trigger `signIn()` from the AuthKit SDK (re-running the hosted flow; a lapsed session just means another quick OTP round trip). No distinct UX per code yet; the server-side distinction is kept for future observability/UX rather than dropped, since it costs nothing to emit. No attempt at our own silent refresh-and-retry: the AuthKit SDK already refreshes proactively before expiry via `getAccessToken()`, so by the time a 401 reaches our API, that automatic refresh has already failed or never had a chance to run — there's nothing left to retry ourselves. Without this wrapper, a lapsed/invalid session would just show a broken fetch on the landing page with no path back to login.

### Endpoints

- `GET /api/me` — returns `{ id, email }` from `req.user`. Protected by the global guard (no decorator needed).
- No sign-out endpoint on our API — sign-out is client-side (AuthKit SDK) plus WorkOS-side session revocation; nothing for our API to do.
- Remove `MetaModule`, `GET /api/meta`, and its `MetaResponse` type from `packages/shared`.

### JIT provisioning

`UsersService.findOrProvision(sub: string)`:

1. `SELECT` by `workos_user_id`. Hit → return as-is — no re-sync of `email` from WorkOS on this path (see "known limitation" below).
2. Miss → look up the user through a `WorkosUserLookup` interface (`lookup(sub: string): Promise<{ email: string }>`) — the same shape as `TokenVerifier`, for the same reason: a real implementation wraps `userManagement.getUser(sub)`, a stub serves the component test tier, so that tier never needs a live WorkOS (ADR-0012). Then **upsert** (`INSERT ... ON CONFLICT (workos_user_id) DO UPDATE ... RETURNING`), not check-then-insert — two concurrent first-requests from the same brand-new session (e.g. two tabs) must not race into a duplicate-row error or a lost update.
3. If the `WorkosUserLookup` call itself fails (WorkOS Management API outage — distinct from a JWKS-fetch failure), map it to **503**, same reasoning as the guard's JWKS-failure case: a brand-new user's first request shouldn't surface a WorkOS-side blip as an undifferentiated 500.

No webhook path (no public ingress until DAMN-30) — this is the only provisioning path in V1.

**Known V1 limitation, accepted:** `users.email` is never re-synced after the row is created, on any path, including a later sign-in. In practice this is low-stakes: AuthKit's hosted login flow (what V1 uses) has no self-service "change my email" surface, and no one but the owner has WorkOS dashboard access — so the only way a user's email actually changes is the owner editing it directly in WorkOS, a rare, deliberate, owner-visible action. Impact is cosmetic only (`GET /api/me`'s display) since access control keys on `sub`, never email. Revisit if/when DAMN-4/DAMN-14 build real profile editing, or WorkOS ships self-service account management — either is the natural trigger to add a re-fetch step, not this issue.

### E2E auth bypass

Implements the contract already stubbed in `e2e/support/auth.ts`, resolving both ends (it only described the frontend/API contract loosely; this pins it down):

- Gated on `E2E_AUTH_BYPASS=1` on the **API** process only — present on the local e2e Compose stack and staging, **never** on prod (`deploy/compose.yaml`'s `x-app-env` anchor is shared between staging and prod, so this must be a per-environment `deploy/.env` value, not baked into the anchor).
- `loginAsTestUser(page)` sets a cookie (`e2e_bypass=1`) on the browser context before navigation. Same-origin, so it rides along automatically on every `/api/*` fetch the SPA makes — no frontend code needs to know how to attach it.
- **Frontend** needs one small bypass-awareness change: if that cookie is present, skip the "redirect to AuthKit" gate and render the app directly (there's no headless way to complete a real email-OTP round trip in CI). This must be a **runtime** check (cookie), not a build-time env flag — `deploy/compose.yaml` promotes the *same image tag* from staging to prod, so anything baked in at build time would be identical in both, which is exactly what must not happen here.
- **API** guard: when `E2E_AUTH_BYPASS=1` and the `e2e_bypass` cookie (or, for direct `request.*` calls with no page context, an `X-E2E-Test-User: 1` header — the sibling helper the scaffold comment anticipates) is present, skip WorkOS verification entirely and provision/return a fixed deterministic test user (`workos_user_id: 'e2e-test-user'`, `email: 'e2e@example.test'`).
- **Both environments this must actually reach:**
  - `deploy/compose.yaml` gains `E2E_AUTH_BYPASS: ${E2E_AUTH_BYPASS:-}` in `x-app-env`; the `e2e-staging` CI job's staging `deploy/.env` sets it (owner applies this by hand per the runbook, once).
  - The **local** stack is a separate file — root `docker-compose.yml`, driven by `e2e/run.ts`, not `deploy/compose.yaml`. It needs the identical `E2E_AUTH_BYPASS: ${E2E_AUTH_BYPASS:-}` addition to its `api` service, *and* `e2e/run.ts` must set `E2E_AUTH_BYPASS=1` in the environment it passes to the `docker compose` invocation before bringing the stack up. Missed in the first draft of this design — without it, local `pnpm e2e` and `docker compose up` both break outright, since `apps/api/src/config/env.ts` will also require `WORKOS_API_KEY`/`WORKOS_CLIENT_ID` (see Config / env changes) which the root compose file doesn't currently pass through either.
- **Invariant: the server-side env var is the sole authority.** The cookie and header are not secrets and are trivially forgeable by anyone (setting `e2e_bypass=1` on yourself in prod is one devtools call away) — they carry zero trust on their own. The guard only inspects them at all when `process.env.E2E_AUTH_BYPASS === '1'` on that specific server process, which is not client-supplied data; a browser has no path to influence it. Where that env var is unset (prod, by design), the cookie/header branch is dead code at runtime, not merely "checked and denied." The one real residual risk is therefore operational — `E2E_AUTH_BYPASS` ending up set on the prod box's `.env` by mistake — not anything a client can do from the browser. `DAMN-30` tracks a hard `deploy.sh` guard against exactly that (hostname-based allow-list, logged on that issue).

## Config / env changes

- `apps/api/src/config/env.ts`: add `WORKOS_API_KEY`, `WORKOS_CLIENT_ID` (both required — fail loud on boot if missing), `E2E_AUTH_BYPASS` (optional, defaults falsy).
- `apps/web`: `VITE_WORKOS_CLIENT_ID`, `VITE_WORKOS_REDIRECT_URI` — build-time is fine for these (they're not secrets and don't vary staging/prod in a way that breaks image promotion the way the E2E flag would; if that turns out wrong once redirect URIs are nailed down per-environment, revisit before merge).
- **Root `docker-compose.yml` (the local/dev stack, distinct from `deploy/compose.yaml`) needs the same `WORKOS_API_KEY`/`WORKOS_CLIENT_ID`/`E2E_AUTH_BYPASS` wiring into its `api` service.** Easy to miss because the design's other env-var bullets all talk about `deploy/compose.yaml` — this is the one that backs local `docker compose up` and `pnpm e2e`'s local mode, so it needs its own pass, not an assumption that the deploy-side change covers it.
- `.env.example`, `deploy/.env.example`: document the new vars (WorkOS Staging keys for local dev + staging; Production keys only ever touch the prod box, out of scope until DAMN-30).
- `AuthKitProvider` mounted in `apps/web/src/main.tsx` (or a new `AuthProvider` wrapper), `clientId` + `redirectUri` from the Vite env vars.
- `/login` route: WorkOS's dashboard requires a registered Sign-in URL that calls `signIn()` (used for admin-impersonation / shared links, not our primary flow, but AuthKit expects it to exist). Add a trivial route that does nothing but call `signIn()` on mount.

## WorkOS dashboard runbook (owner-executed)

Documented as its own doc (`docs/features/DAMN-1-auth-accounts/workos-setup.md`) rather than buried in this file, since it's a checklist, not a design artifact:

0. **Pre-flight, before any implementation code is written:** on Staging, enable Magic Auth, toggle "Sign up" OFF, send yourself one invite, and confirm you can complete an OTP sign-in through it end to end. This combination is load-bearing for the entire chosen approach — if an invited user can't complete Magic Auth with public sign-up off, the invite-only mechanism needs rethinking, not a config tweak. Cheap to check now (~10 min); expensive to discover after the guard/provisioning code is built on top of the assumption.
1. Confirm Staging + Production environments exist (both do — not yet configured).
2. Both environments: enable email OTP ("Magic Auth") as the sign-in method.
3. Both environments: **toggle "Sign up" OFF** (Authentication settings) — already verified live in step 0 above for Staging; repeat the same check for Production before it goes live (DAMN-30).
4. Both environments: register the redirect URI (`http://localhost:5173/callback` for local dev; staging's tailnet hostname `/callback` for staging) and the `/login` Sign-in URL.
5. Send yourself (and any V1 testers) an invite via the dashboard Invites tab.
6. Branding pass (logo/colors/light-dark) — cosmetic, do whenever.
7. Copy Staging API key + Client ID into local `.env` and staging's `deploy/.env` (password manager, per ADR-0010).

## Test plan

- **Unit:** `WorkosTokenVerifier` claim/expiry/JWKS-failure branches (mocked JWKS), `UsersService.findOrProvision` upsert-on-conflict logic (mocked db), guard's error-mapping branches.
- **Component (Testcontainers Postgres):** `JwtAuthGuard` + `UsersService` against a real Postgres — the concurrent-first-request race (two parallel provisioning calls for the same new `sub` produce one row, using the stub `WorkosUserLookup`), `GET /api/me` round trip, `@Public()` bypass for `/api/health`. WorkOS itself stays mocked (stub `TokenVerifier` + stub `WorkosUserLookup`).
- **Workflow (Playwright):** replaces the DAMN-26 skeleton assertions — `loginAsTestUser` bypass gets past the auth wall, `GET /api/me` returns the fixed e2e user, sign-out (if reachable without real WorkOS — otherwise assert the sign-out button exists and calls the SDK method, without asserting the full round trip through a real WorkOS session).

## Open decisions from phase 1 — resolved here

- Express adapter: locked (ADR-0001, separate commit already on this branch).
- Session TTLs: 5 min / 30 days / 1 year (ADR-0003, same commit).
- Invite-only sign-up: WorkOS-native toggle, no app code (ADR-0003, same commit).
- `aud` claim: skipped in V1, documented above as deliberate.
- E2E bypass mechanics: cookie (page) + header (direct request) dual mechanism, pinned down above — the scaffold comment left this loose.
