# Feature: Manual recipe entry + recipe/version data model

**Tracker:** DAMN-2 · **Depends on:** DAMN-4 (Recipe Book, shipped — `books.id` this references), ADR-0006 (content format, decided), ADR-0007 (versioning model, decided). **Blocks:** DAMN-3 (version-history/diff/revert UI), DAMN-5 (URL import — shares the ingredient-line parser).

## Status

Scope locked (phase 1). This document currently captures only the decisions made during scope lock-in that belong in a design doc rather than tracker text — the full technical design (concrete schema, interfaces, migration plan, test plan) is still pending phase 4. UX mockups (phase 3) haven't started either.

## Scope (locked)

- **Bundled, not split:** this issue covers both the recipe/version data model *and* the manual entry/edit UX (line-oriented editor). No separate issue owns the entry form. DAMN-3 owns only the version-history/diff/revert UI on top of what this issue defines.
- **Sectioning: in for V1.** Ingredient/step sectioning ("For the sauce:") ships via interleaved heading lines in the same ordered array (`{ id, kind: 'heading', text }`), per ADR-0006's low-cost approach. Chosen because retrofitting into a flat list is the expensive direction and the interleaved-heading mechanism itself is cheap.
- **Concurrency guards (ADR-0007) are a permanent floor**, not conditional on multi-owner books — the same recipe open in two tabs/devices can race even with a single owner. `DAMN-19` (multi-owner books) is parked, unscheduled; only the *assisted-merge* extension planned on top of the floor is parked with it.

## Content schema library — Zod (decided)

ADR-0006 requires the recipe `content` schema be defined once in `packages/shared`, consumed as raw TS source (no build step) by both `apps/web` (React) and `apps/api` (NestJS), with runtime validation *and* inferred types from a single definition. ADR-0006 only "leaned" toward Zod pending confirmation when `packages/shared` was scaffolded (ADR-0005) — that confirmation never actually happened until this issue. Locked here rather than as a standalone ADR: ADR-0006 already narrowed the field enough that this isn't a weighty decision on its own (see "Assessment" below).

### Options considered

**1. Zod (or a Zod-shaped library — Valibot, ArkType) — chosen**
- Pros: schema is the source of truth, types inferred (`z.infer<...>`) — directly satisfies ADR-0006. Framework-agnostic — no decorators, no `reflect-metadata`, identical import in React or NestJS. Fits `packages/shared`'s raw-source, no-build model. Zod's discriminated unions are a good match for the sectioned content shape (heading vs. ingredient vs. step lines). Currently the de facto standard for this pattern in the TS ecosystem — strong on the portability/marketable-skill driver (`CLAUDE.md`).
- Cons: one more dependency to learn. NestJS's `ValidationPipe` default expects `class-validator`, so this needs a small adapter (or direct `.parse()` calls in services) instead of the framework default. Zod had a real breaking v3→v4 rewrite — pin and verify current stable per the usual dependency-version-check convention. Runtime parse cost, negligible at this project's scale.

**2. `class-validator` + `class-transformer` (NestJS's native pattern) — rejected**
- Pros: zero glue with Nest — `ValidationPipe` uses it out of the box. Decorator-annotated DTO classes map closely onto Java Bean Validation / JSR-380, which is directly in the owner's existing background.
- Cons: fundamentally a backend/decorator pattern, awkward in a hooks-based React app; would drag `experimentalDecorators` / `emitDecoratorMetadata` into `apps/web`'s TS config for no reason `apps/web` otherwise needs. Awkward for expressing the sectioning discriminated union. Two libraries instead of one. Structurally fights the "one framework-agnostic shared package" architecture despite the familiar syntax.

**3. Hand-written TS interfaces + manual validation, no library — rejected**
- Pros: zero new dependency.
- Cons: not really a live option — fails ADR-0006's standing requirement outright. Either the validation logic duplicates the type (the exact drift ADR-0006 exists to prevent), or the API boundary goes unvalidated against genuinely untrusted input (pasted text, `DAMN-5`'s URL-scrape pipeline).

### Assessment

Light decision. ADR-0006 already required "schema-first, single definition, inferred types, framework-agnostic," which rules out hand-rolled types and makes `class-validator` a worse structural fit regardless of its familiarity to the owner. No formal ADR was written for this — this write-up is the record; ADR-0006 now points here instead of leaving the lean unconfirmed.

## Open (not yet designed)

- UX mockups (phase 3).
- Concrete `Recipe` / `RecipeVersion` Drizzle schema, migration plan, HTTP interfaces, `diffContent` shape, full test plan (phase 4).
