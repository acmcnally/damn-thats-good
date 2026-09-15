# Feature: Manual recipe entry + recipe/version data model

**Tracker:** DAMN-2 · **Depends on:** DAMN-4 (Recipe Book, shipped — `books.id` this references), ADR-0006 (content format, decided), ADR-0007 (versioning model, decided). **Blocks:** DAMN-3 (version-history/diff/revert UI), DAMN-5 (URL import — shares the ingredient-line parser).

## Status

Scope locked (phase 1). UX signed off (phase 3) — see `mockups/`. This document now also covers phase 4 (technical design): concrete schema, API surface, shared types, migration plan, test plan, and every open decision resolved.

## Scope (locked)

- **Bundled, not split:** this issue covers both the recipe/version data model *and* the manual entry/edit UX (line-oriented editor). No separate issue owns the entry form. DAMN-3 owns only the version-history/diff/revert UI on top of what this issue defines.
- **Sectioning: in for V1.** Ingredient/step sectioning ("For the sauce:") ships via interleaved heading lines in the same ordered array (`{ id, kind: 'heading', text }`), per ADR-0006's low-cost approach. Chosen because retrofitting into a flat list is the expensive direction and the interleaved-heading mechanism itself is cheap.
- **Concurrency guards (ADR-0007) are a permanent floor**, not conditional on multi-owner books — the same recipe open in two tabs/devices can race even with a single owner. `DAMN-19` (multi-owner books) is parked, unscheduled; only the *assisted-merge* extension planned on top of the floor is parked with it.
- **Recipe list + detail view** is in scope (added during UX design, phase 3) — nothing else in the tracker owns it. Minimal: a card grid list and a read view. No search/filter UI (see Non-goals).

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

**Version pin:** `zod@^4.6.5` (verified against the npm registry at design time — latest stable on the 4.x line, no beta/canary). `packages/shared` currently has zero dependencies; this is its first.

## UX (phase 3 — signed off)

See `mockups/index.html` for the comparison grid and research summary, and `mockups/entry-option-2-live-inline.html` for the chosen direction. Locked interaction decisions this schema/API design depends on:

- **Live inline tokenization, not discrete form fields.** Ingredients and steps are each a single free-text field; parsing happens live as the user types, rendered via highlight overlay. No "+ add row" buttons.
- **Correction mechanism:** a drag-to-adjust boundary between the detected quantity and the item text on each ingredient line, snapped to word boundaries. This is a hard product requirement (not cosmetic) — DAMN-2's own scaling/conversion/shopping-list groundwork depends on corrected data being trustworthy, not just auto-parsed and left wrong.
- **Sectioning** via a heading line ending in `:` (colon is a live-typed character, not gobbled during editing).
- **Tags** are tokenized chips; a `+` control opens an inline search-or-create input against the book's existing tags.
- **Provenance** is a free-text field (not structured) — "Grandma's recipe," a book + page citation, or a URL are all valid, and the app doesn't try to parse or validate the shape.
- **Servings** is a free-text field, not a numeric stepper/spinner — consistent with the no-dropdowns constraint.
- **Steps** support literal Markdown list syntax (`1. `, `- `, `* `) with editor auto-continuation as a typing convenience; the list markers are ordinary characters in the stored text, not a separate structured list model (see "List-marker renumbering," below).
- Known, accepted mockup-only rough edge: the title `<input>` doesn't reflow at all viewport widths (see "Non-goals" — this is implementation-phase polish, not a design gap).

## Data model

### `content` (JSONB, on `recipe_versions`)

Two ordered arrays — ingredients and steps — each a discriminated union of a heading line or its content-line type, per ADR-0006. Defined once in `packages/shared` as the Zod source of truth; `z.infer` produces the TS types used by both apps.

```ts
// packages/shared/src/recipe-content.ts
import { z } from 'zod';

export const CONTENT_SCHEMA_VERSION = 1 as const;

const lineId = z.uuid(); // crypto.randomUUID() — assigned once, client-side, at line creation

const headingLine = z.object({
  id: lineId,
  kind: z.literal('heading'),
  text: z.string().trim().min(1).max(200), // stored WITHOUT trailing colon — see decision #3
});

/**
 * `quantity` and `item` are the two substrings either side of the tokenizer's detected
 * (or user-dragged) boundary. Both plain strings in V1 — "2 cups", "1 1/2", "a pinch" for
 * quantity; numeric/unit decomposition for scaling (DAMN-7/8) is an additive V2 field,
 * not built here (ADR-0006 permits additive evolution; only per-line ids are load-bearing
 * enough to need to be right on the first pass).
 */
const ingredientLine = z.object({
  id: lineId,
  kind: z.literal('ingredient'),
  raw: z.string().trim().min(1).max(500), // full line, verbatim — source of truth for re-editing
  quantity: z.string().max(100), // '' when the parser found no leading quantity
  item: z.string().trim().min(1).max(500),
  parseStatus: z.enum(['auto', 'confirmed']), // see decision #2
});

const stepLine = z.object({
  id: lineId,
  kind: z.literal('step'),
  text: z.string().trim().min(1).max(4000), // markdown; list markers are literal characters
});

export const recipeContentSchema = z.object({
  contentSchemaVersion: z.literal(CONTENT_SCHEMA_VERSION),
  ingredients: z.array(z.discriminatedUnion('kind', [headingLine, ingredientLine])).max(300),
  steps: z.array(z.discriminatedUnion('kind', [headingLine, stepLine])).max(300),
});

export type RecipeContent = z.infer<typeof recipeContentSchema>;
```

`content_schema_version` (ADR-0006, clause 2) lives *inside* the JSONB document (`contentSchemaVersion`) rather than as a separate DB column — it needs to round-trip with export (ADR-0011) regardless, and V1 has no migration-in-place need for a queryable column. Add a generated/indexed column later only if a real "find recipes on schema version N" migration task shows up.

### `diffContent`

```ts
// packages/shared/src/recipe-content.ts (cont.)
export type LineDiff<T> =
  | { type: 'added'; after: T }
  | { type: 'removed'; before: T }
  | { type: 'changed'; before: T; after: T } // same id, different fields
  | { type: 'unchanged'; line: T };

export interface ContentDiff {
  ingredients: LineDiff<RecipeContent['ingredients'][number]>[];
  steps: LineDiff<RecipeContent['steps'][number]>[];
}

export function diffContent(a: RecipeContent, b: RecipeContent): ContentDiff;
export function contentEquals(a: RecipeContent, b: RecipeContent): boolean; // degenerate diffContent case
```

Diffs each array (ingredients, steps) independently, keyed by `id` — an id present in both with any field changed is `changed`; present only in `a` is `removed`; only in `b` is `added`; identical in both is `unchanged`. **Reordering is intentionally not a distinct diff type in this issue's scope** — DAMN-2 only needs `contentEquals` (the save-time "did anything change?" check, i.e. `diffContent(a, b)` producing no `added`/`removed`/`changed` entries). Order-aware move detection and the diff *rendering* are DAMN-3's job; this issue ships the function and its degenerate case, not the UI that makes full use of it.

### `recipes` table

```ts
// packages/db/src/schema.ts (additions)
export const recipeVisibility = pgEnum('recipe_visibility', ['private', 'unlisted', 'public']);

export const recipes = pgTable('recipes', {
  id: uuid('id').primaryKey().defaultRandom(),
  bookId: uuid('book_id').notNull().references(() => books.id),
  title: text('title').notNull(),
  servings: text('servings'), // free text — "serves 4-6", "makes a dozen"; see decision #5
  provenance: text('provenance'),
  visibility: recipeVisibility('visibility').notNull().default('private'),
  currentVersionId: uuid('current_version_id').references(() => recipeVersions.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
```

`currentVersionId` is nullable at the DB level only to break the insertion cycle with `recipe_versions` (see migration plan) — `RecipesService` is the only writer, and the invariant "every `recipes` row has a non-null `currentVersionId` once its creating transaction commits" is enforced there, the same style as `BookProvisioningRaceError` documents an application-level invariant today.

`updatedAt` doubles as the optimistic-concurrency token for non-content fields (see decision #7) — bumped by `RecipesService` on every metadata `PATCH`.

### `recipe_versions` table

```ts
export const recipeVersions = pgTable(
  'recipe_versions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    recipeId: uuid('recipe_id').notNull().references(() => recipes.id),
    versionNumber: integer('version_number').notNull(),
    content: jsonb('content').notNull().$type<RecipeContent>(),
    authorId: uuid('author_id').notNull().references(() => users.id),
    note: text('note'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('recipe_versions_recipe_version_idx').on(t.recipeId, t.versionNumber)],
);
```

### `tags` + `recipe_tags` (decision #6)

```ts
export const tags = pgTable(
  'tags',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    bookId: uuid('book_id').notNull().references(() => books.id),
    name: text('name').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('tags_book_name_idx').on(t.bookId, sql`lower(${t.name})`)],
);

export const recipeTags = pgTable(
  'recipe_tags',
  {
    recipeId: uuid('recipe_id').notNull().references(() => recipes.id),
    tagId: uuid('tag_id').notNull().references(() => tags.id),
  },
  (t) => [primaryKey({ columns: [t.recipeId, t.tagId] })],
);
```

## Migration plan

One Drizzle migration (`drizzle-kit generate`), in this order (tables are created in dependency order; `recipes.current_version_id` is added without its FK constraint enforced until `recipe_versions` exists):

1. `CREATE TYPE recipe_visibility AS ENUM ('private', 'unlisted', 'public')`
2. `CREATE TABLE recipes` (`current_version_id` nullable, no FK yet)
3. `CREATE TABLE recipe_versions` (FK to `recipes.id`)
4. `ALTER TABLE recipes ADD CONSTRAINT ... FOREIGN KEY (current_version_id) REFERENCES recipe_versions(id)`
5. `CREATE TABLE tags`, `CREATE TABLE recipe_tags`

Drizzle's schema file expresses steps 2–4 as ordinary `.references()` calls (Drizzle resolves the two-table circular reference from the TS module graph and emits the FK-add as a separate statement in the generated SQL automatically) — no hand-written SQL needed, same `drizzle-kit generate` → commit → `migrate` flow as the existing `books`/`users` migrations.

**Write path for creating a recipe** (`RecipesService.create`), one DB transaction:
1. Resolve the caller's book via `BooksService.getOrCreateForOwner` (existing pattern).
2. Upsert each submitted tag by `(bookId, lower(name))`, `ON CONFLICT DO NOTHING` + re-select on conflict — same race-safe shape as `BooksService.getOrCreateForOwner`.
3. `INSERT INTO recipes (... current_version_id = NULL ...) RETURNING id`.
4. `INSERT INTO recipe_versions (recipe_id, version_number = 1, content, author_id) RETURNING id`.
5. `INSERT INTO recipe_tags` rows linking the recipe to the tag ids from step 2.
6. `UPDATE recipes SET current_version_id = <id from 4>`.

All in one transaction — never observable outside it with a null `current_version_id`.

## API surface

REST, resource-oriented, all routes behind the existing global `JwtAuthGuard`. No route ever takes a `bookId` param — V1 has exactly one book per user (DAMN-4), so every handler resolves the caller's book server-side, the same way `AuthController.me` resolves the caller's user. Concretely: a new `BookContextGuard` (registered per-controller, running after `JwtAuthGuard`) calls `BooksService.getOrCreateForOwner(user.id)` and attaches the result to the request; a `@CurrentBook()` param decorator reads it back — same shape as the existing `@CurrentUser()` decorator in `authenticated-user.ts`.

| Method | Path | Notes |
|---|---|---|
| `GET` | `/recipes` | List, scoped to the caller's book. Lightweight shape (no `content`) — `id, title, servings, tags, visibility, updatedAt`. Sorted by `updatedAt desc`. No query params in V1 (see Non-goals). |
| `GET` | `/recipes/:id` | Detail — full metadata + current version's `content` + `currentVersionId`/`versionNumber`. 404 if the recipe isn't in the caller's book. |
| `POST` | `/recipes` | Create. Body: `{ title, servings?, provenance?, tags: string[], content: { ingredients, steps } }` (server stamps `contentSchemaVersion`). Runs the transaction above. Returns the detail shape, 201. |
| `PATCH` | `/recipes/:id` | Metadata only (title, servings, provenance, tags, visibility) — never touches `content`/version. Body carries `expectedUpdatedAt`; mismatch → 412 with the current row. |
| `PUT` | `/recipes/:id/content` | Content save. Body: `{ baseVersionId, content }`. If `baseVersionId !== recipes.currentVersionId` → 412 with the current version. Else runs `contentEquals(current.content, body.content)`: if equal, no-op, return the existing version (200); if changed, insert a new `recipe_versions` row (`version_number` = previous + 1) and update `recipes.currentVersionId` (200, new version). |
| `DELETE` | `/recipes/:id` | Hard delete (decision #8). |
| `GET` | `/tags` | Book-scoped tag list, for the `+` add-tag control's search-or-create. `{ id, name }[]`, sorted by name. |

`RecipesModule` owns `recipes`, `recipe_versions`, and `tags`/`recipe_tags` together (decision below) — imports `BooksModule`.

## Shared types (`packages/shared`)

- `recipeContentSchema` / `RecipeContent` / `diffContent` / `contentEquals` — above, in `packages/shared/src/recipe-content.ts`.
- Request/response types, in `packages/shared/src/recipes.ts`, built from Zod schemas so validation and the wire type are the same declaration (mirrors the `content` schema's own rationale):

```ts
export const visibilitySchema = z.enum(['private', 'unlisted', 'public']);

export const createRecipeRequestSchema = z.object({
  title: z.string().trim().min(1).max(200),
  servings: z.string().trim().max(120).optional(),
  provenance: z.string().trim().max(2000).optional(),
  tags: z.array(z.string().trim().min(1).max(60)).max(50),
  content: recipeContentSchema.omit({ contentSchemaVersion: true }),
});
export type CreateRecipeRequest = z.infer<typeof createRecipeRequestSchema>;

export const updateRecipeMetadataRequestSchema = z.object({
  expectedUpdatedAt: z.iso.datetime(),
  title: z.string().trim().min(1).max(200).optional(),
  servings: z.string().trim().max(120).optional(),
  provenance: z.string().trim().max(2000).optional(),
  tags: z.array(z.string().trim().min(1).max(60)).max(50).optional(),
  visibility: visibilitySchema.optional(),
});

export const saveContentRequestSchema = z.object({
  baseVersionId: z.uuid(),
  content: recipeContentSchema.omit({ contentSchemaVersion: true }),
});

export interface RecipeSummary {
  id: string;
  title: string;
  servings: string | null;
  tags: string[];
  visibility: z.infer<typeof visibilitySchema>;
  updatedAt: string;
}

export interface RecipeDetail extends RecipeSummary {
  provenance: string | null;
  currentVersionId: string;
  currentVersionNumber: number;
  content: RecipeContent;
  createdAt: string;
}
```

- The ingredient-line boundary detector (`autoDetectBoundary` in the mockup) is promoted to `packages/shared/src/ingredient-parser.ts` — same module DAMN-5 (URL import) reuses per its tracker text. Ports the mockup's `QTY_WORD`/word-boundary logic; component/unit tests own its correctness, not this design doc.

## Decisions resolved

1. **Ingredient quantity/item representation:** two plain strings (`quantity`, `item`) either side of the tokenizer boundary, plus the verbatim `raw` line. **Recommendation, applied.** Alternative (full numeric `{ value, unit }` decomposition now) rejected: V2 scaling (DAMN-7/8) needs that shape eventually, but ADR-0006 explicitly permits additive schema evolution and only per-line *ids* are expensive to retrofit — building numeric parsing now would be speculative work against a V2 feature that isn't designed yet.

2. **What invalidates a `confirmed` boundary override:** any edit to a line's `raw` text re-runs the auto-detector and resets `parseStatus` to `'auto'`, discarding a prior manual confirmation *for that line*. **Recommendation, applied.** Simpler and more predictable than trying to detect "the edit didn't touch the quantity part" — the user is already looking at the live boundary while typing and can re-drag if the fresh auto-guess is wrong; a stale confirmation silently surviving an edit to the same line risks the worse failure mode (wrong data marked "confirmed").

3. **Heading colon at persistence:** store `text` *without* the trailing colon; the editor adds it back as a display/typing affordance only. **Recommendation, applied.** The live editor must not strip the colon during typing (that's the cursor-alignment bug fixed earlier in phase 3) — but that's a *display* constraint, separate from normalizing stored data. Storing consistently punctuation-free keeps heading text comparable/searchable without colon-sensitivity, at the cost of one string transform at save time.

4. **List-marker renumbering:** not built. Markers (`1.`, `-`, `*`) are literal characters in a step's `text`, edited by hand like any text, per the "steps are Markdown" framing already in the tracker text. **Recommendation, applied.** Auto-renumbering on insert/delete is a real feature (mini outliner behavior) with its own edge cases (mixed marker styles, nested lists) — out of proportion to what was asked for ("support numbered and bulleted lists"), which the literal-Markdown approach already satisfies. Flag as a possible V2 nice-to-have, not committed.

5. **Servings field type:** free text (`recipes.servings: text`), not a numeric column. **Recommendation, applied.** Matches the explicit no-dropdowns/no-discrete-controls product constraint from phase 3. Costs V2 scaling (DAMN-7) a small amount of future work (parsing a free-text serving count, or adding a structured numeric field alongside it) — acceptable per ADR-0006's additive-evolution allowance, and scaling's own design is DAMN-7's job, not this issue's.

6. **Tags storage:** normalized `tags` (book-scoped, case-insensitive-unique) + `recipe_tags` join table, not a `text[]` column on `recipes`. **Recommendation, applied.** The mockup's `+` control explicitly offers "select an existing tag or create one" — that's a real autocomplete against the book's tag vocabulary, which a `text[]` column would need a `SELECT DISTINCT unnest(...)` workaround for and would leave prone to near-duplicate drift ("Dessert" vs "desserts"). A join table also positions tag rename/cleanup as a one-row update later, and gives `GET /tags` a clean source. The alternative (`text[]`) would have been simpler to write today; rejected because the UX already committed to tag identity, not just tag strings.

7. **Recipe-metadata optimistic-concurrency token:** reuse `recipes.updated_at`, no dedicated `row_version` integer column. **Recommendation, applied.** `updated_at` already changes on every metadata write and is timestamp-comparable; a separate counter column would be redundant state to keep in sync for no behavioral difference at this scale.

8. **Recipe delete:** hard delete, `DELETE /recipes/:id`, client-side confirmation only — no `deleted_at`/trash/undo in V1. **Recommendation, applied.** No backup/trash feature has been requested anywhere in the roadmap; a soft-delete column would be unused complexity until (if ever) "I deleted the wrong recipe" becomes a real, reported pain — consistent with this project's general "add complexity only when the pain is real" posture (`CLAUDE.md` § Scope & simplicity).

9. **Visibility enforcement:** the `visibility` column and enum are added now (cheap, and per ADR-0006-adjacent forward-compat reasoning it's better in the first schema than retrofitted), but **no enforcement logic is built in DAMN-2.** **Recommendation, applied.** V1 has no route through which one user could ever see another user's book — every handler resolves strictly to the caller's own book (`BookContextGuard`) — so `unlisted`/`public` are inert until multi-owner/sharing (`DAMN-19`, parked) or some other cross-book read path exists. Building enforcement against a non-existent access path would be speculative.

10. **Search/filter on `GET /recipes`:** out of scope. Returns the full list, sorted by `updatedAt`. **Recommendation, applied.** ADR-0002 already flags the FTS/`pg_trgm` blending strategy as a genuinely open design task for "the V1 search build" — folding a half-designed version of it into this issue's list endpoint would mean redoing it properly later anyway.

11. **`content_schema_version` storage:** embedded in the JSONB document, no DB column. **Recommendation, applied.** See "`content` (JSONB...)" above.

## Non-goals

- **Search/filter UI or query params** — separate V1 deliverable (ADR-0002).
- **Version history / diff / revert UI** — DAMN-3, built on `diffContent` shipped here.
- **Full numeric quantity/unit decomposition, scaling, unit conversion** — DAMN-7/DAMN-8 (V2).
- **Assisted-merge UI on a 412** — parked with DAMN-19; V1 shows the reconcile prompt only.
- **Recipe photos** — DAMN-24 (V3); no `media` FK on `recipes` in this schema.
- **Title input reflow at arbitrary viewport widths.** Real product decisions were made and proven in the mockup (tokenization, sectioning, tags, provenance, mobile layout shape); this is left-over mockup fit-and-finish, not a locked interaction decision — the real entry form's title control gets sized correctly during implementation (candidates: fluid `clamp()` sizing, or promoting it to the same auto-grow technique already used for ingredients/steps), verified against real title lengths rather than the mockup's single seed recipe.
- **Auto-renumbering Markdown lists in Steps** — see decision #4.

## Test plan (ADR-0012 tiers)

- **Unit (`packages/shared`):** `recipeContentSchema` accept/reject cases (valid content; missing/duplicate `id`; wrong `kind`; wrong `contentSchemaVersion`); `diffContent`/`contentEquals` for added/removed/changed/unchanged/no-op cases; the ingredient boundary detector's edge cases (no quantity, ranges like "2-3", fractions like "1 1/2", no unit, leading/trailing whitespace) ported from the mockup's manual test cases into real assertions.
- **Component (`apps/api`, Testcontainers Postgres — same shape as `books.component.test.ts`):**
  - `RecipesService.create`: recipe + version + tag rows all land atomically; tag get-or-create is race-safe under `Promise.all` (mirrors `BooksService.getOrCreateForOwner`'s own race test).
  - Content save: `contentEquals` true → no new version row; false → new version, `version_number` incremented, `currentVersionId` updated.
  - Optimistic concurrency: stale `baseVersionId` → 412 with current version attached; stale `expectedUpdatedAt` on metadata `PATCH` → 412.
  - List/detail scoping: a second user's book never appears in `GET /recipes` or is reachable via `GET /recipes/:id`.
  - Tag upsert case-insensitivity: submitting `"Dessert"` when `"dessert"` already exists in the book reuses the row.
- **Workflow (`@dtg/e2e`, Playwright):** create a recipe through the real entry UI (title, servings, provenance, tags, ingredient/step tokenization including a manual boundary correction) → save → appears in the list → open detail → edit content → save again and confirm (via API assertion, since the version-history UI is DAMN-3) that a second version was created. Scoped to the DAMN-2 happy path only; version-history/diff/revert workflow coverage is DAMN-3's.

## Open (carried to phase 5)

None outstanding for design purposes — every item flagged during scope-lock and UX design is resolved above. Phase 5 (adversarial design review) may surface more.
