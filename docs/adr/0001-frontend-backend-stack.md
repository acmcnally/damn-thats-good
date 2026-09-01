# ADR-0001: Frontend/backend stack — React + TypeScript, NestJS

**Status:** Accepted — core stack (React, TypeScript, NestJS, REST) decided. Open sub-decision: HTTP adapter (Express vs Fastify), leaning Express, confirm when wiring auth. Offline scope settled: read-only, V4 only.
**Decision drivers:** skill development (portability lens) · product preference

## Context

Goals: learn React, stay strongly typed (TypeScript over plain JS), keep a REST API (not GraphQL), and leave room for a future installable/mobile client. The backend choice leans on the owner's prior server-side experience — see `CLAUDE.md`.

The frontend framework choice is a **skill-development choice**: the explicit goal is to learn React. React is also a squarely mainstream, marketable choice, so it satisfies the portability lens too. Other stacks (SvelteKit, SolidStart, a React metaframework) could serve the app's own needs with less boilerplate — they are not evaluated in depth because the learning goal settles it. This ADR does not claim React is "the best tool for the app," only that it is the right tool for the owner's goals.

## Decision

- **Frontend:** React + TypeScript. Responsive and installable (manifest) from the start. **No service worker in V1.** Offline support is read-only and lands in V4 — see Consequences.
- **Backend:** Node.js + TypeScript, using **NestJS** as the application framework. Adapter (Express vs Fastify) is **not yet locked** — see Consequences.
- **API style:** REST, resource-oriented.
- Shared TypeScript types between frontend and backend (see ADR-0005 on monorepo tooling).

## Alternatives considered

- **Express or bare Fastify** instead of NestJS: less ceremony, but no enforced module boundaries or DI. NestJS is chosen for two reasons that hold up: (1) it is an industry-standard, marketable structured Node framework (portability lens); (2) its modules/DI/guards/decorators map closely to the Spring-style concepts the owner already works in, which meaningfully lowers cognitive load while learning React, TS, and Postgres at the same time. The cost — more boilerplate on every endpoint — is real and accepted.
- **Bun** as a runtime (and/or package manager) instead of Node.js: reportedly works fine with NestJS/Drizzle/Postgres with minimal friction, but performance gains (2-4x throughput) are irrelevant at this project's scale, and native-module compatibility is less proven. Kept as a low-risk future swap-in, not adopted now.
- **GraphQL** instead of REST: not pursued. The real reason is that REST is simpler *for a solo developer* and the domain is resource-shaped with per-resource permissions. (The "simpler for a future mobile client" framing is weak — efficient mobile data-fetching is GraphQL's own headline pitch — so it is not the justification.)
- **Lighter backend frameworks** (bare Fastify with plugin encapsulation, Hono, AdonisJS, a thin structured Express): not evaluated in depth, and deliberately so — the NestJS choice is driven by the learning-load and portability reasons above, not by a claim that it is objectively lighter or faster. Noted for completeness: Fastify's plugin/encapsulation model would also provide module boundaries.

## Consequences

- NestJS's DI/module/guard system gives natural homes for cross-cutting concerns like visibility checks and auth guards as the sharing model (V3) comes online.
- More upfront ceremony/boilerplate than Express for simple endpoints — accepted as the cost of the architecture.

### Open: Express vs Fastify adapter

The original decision took the Fastify adapter "for better throughput," but throughput is irrelevant at this project's scale, so it is not a real tie-breaker. The tie-breaker is ecosystem friction:

- **Express adapter:** far more common in NestJS examples and tutorials; broadest middleware compatibility; the more standard, more documented path (portability lens). ADR-0003 landed on a managed provider (WorkOS AuthKit), so the adapter barely matters for auth — it is mostly frontend + a JWT-verification middleware — but Express keeps the broadest option open for any other middleware.
- **Fastify adapter:** officially supported but less-travelled — a second less-common path to debug, with little upside here.

**Leaning: Express adapter**, unless a concrete reason to prefer Fastify emerges during the V1 build. Settle this once the auth integration (ADR-0003) is wired up — that is where adapter friction shows first.

### PWA / offline scope (settled)

An installable, phone-friendly app is a **product preference** (category 2). Responsive layout + a web manifest ship from the start — cheap, no service worker needed.

**Offline support is read-only and deferred to V4** (Linear `DAMN-21`). Scope, when it lands:

- view recipes that are already loaded / cached when the connection drops
- **cook mode works offline** (cook mode itself ships in V2, online-only — but it must not be built to require a server round-trip per step, so V4 can make it offline-capable)
- a local cache of recently-viewed recipes
- possibly: download a whole recipe book to a local store for offline reading — the staleness/sync design for that is a **V4** sub-decision, not settled here

**Offline *editing* is permanently out of scope, in every release.** Two-way sync of edited recipes (conflict detection, merge UX) is exactly the complexity this project is choosing not to take on; the owner has ruled it out rather than solve it. So there is no offline-write path for ADR-0007's concurrency handling to worry about — that concern is limited to two online book-owners editing at once.

V4 does not touch the auth model — every recipe view still requires authentication (see `CLAUDE.md`).
