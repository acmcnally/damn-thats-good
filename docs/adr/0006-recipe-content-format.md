# ADR-0006: Recipe content representation

**Status:** Accepted (owner, 2026-08-28). The format is decided: structured content, stored as JSONB on `RecipeVersion`. The **concrete field-level schema is deliberately out of scope here** — it is settled per feature (`DAMN-2` entry, `DAMN-3` versioning) and is expected to evolve additively. Do not reopen this ADR for schema changes; it records only the choices that constrain other work.
**Decision drivers:** product preference (versioning + authoring UX) · scope & simplicity

## Context

`RecipeVersion` stores the versioned part of a recipe — **ingredients + steps**. Title, photo, tags, servings, etc. live on `Recipe` and are not versioned (ADR-0007). This ADR is about how the ingredients-and-steps content is represented.

Already settled (ADR-0007): versioning lives in the relational DB, one `RecipeVersion` row per save; not a git / flat-file store.

Three V1 features need a content representation before they can be built: **`DAMN-2`** (manual entry), **`DAMN-3`** (versioning — revisions *and diffs*), **`DAMN-5`** (import from URL). `DAMN-3` ships version comparison in V1, so **diff quality is a V1 concern** and it follows directly from this choice.

The original lean was Cooklang (`.cook` text), because `cooklang-rs` appeared to hand us V2 serving-size scaling (`DAMN-7`) and unit conversion (`DAMN-8`) for free. Two problems surfaced: a flat text blob produces noisy, hard-to-interpret version diffs (reordering one ingredient rewrites many lines; ingredient markup is interleaved with prose), and `cooklang-rs`'s conversion turned out to be basic — the "free" scaling/conversion was oversold. A review also confirmed a preference for a genuinely structured ingredient list and step list over Cooklang's inline ingredient syntax.

## Decision

**Store recipe content as structured data in a single JSONB `content` column on `RecipeVersion`** — an ordered ingredient list and an ordered step list, not a text blob and not Cooklang. JSONB rather than child tables because version content is immutable once written, always read as a whole, and never queried field-by-field (search reads a derived structure — see Consequences).

**Standing requirements on the schema.** These constrain feature work and are the reason this ADR exists; the schema *shape* itself is settled in `DAMN-2` / `DAMN-3`:

1. **Stable per-line identifiers.** Every ingredient line and every step carries an immutable identifier assigned on creation. Diff and any future merge (ADR-0007) key on these, not on array position. Retrofitting identifiers onto stored content is a migration, so `DAMN-2` must include them in the first schema.
2. **Additive evolution, version-tagged.** Stored content carries a `content_schema_version`. Schema changes are additive (new optional fields) and migrated incrementally. A schema change does not reopen this ADR.
3. **Single source of truth in `packages/shared`.** The content schema is defined once in `packages/shared` (leaning Zod — runtime validation plus inferred types, usable on both sides; confirm when scaffolding `packages/shared`, ADR-0005) and imported by both the web editor and the NestJS API. Not duplicated, not DB-enforced in V1.

**Flag for `DAMN-2` (not decided here):** ingredient and step **sectioning** ("For the sauce:", "For the filling:") is a common real-world structure and is expensive to retrofit into a flat list. `DAMN-2` should decide it in-or-out deliberately, not by default.

**Interop formats:**

- **Schema.org `Recipe` (JSON-LD)** is the primary import and export interchange format — the URL-import parse target (`DAMN-5`) and the portable export (`DAMN-23`). Interop only; the app has no anonymous/public access, so this is never an SEO or public artifact.
- **Cooklang import and export are supported but explicitly best-effort and lossy** — Cooklang cannot cleanly round-trip notes, sectioning, or quantity ranges. Native JSON is the lossless internal form; JSON-LD is the lossless-enough portable form; Cooklang is a convenience for people who write it.
- Import pipeline shape: source (JSON-LD / scraped / pasted text / Cooklang) → ingredient-line parsing → structured `content`. The specific ingredient-string parser is a `DAMN-5` implementation choice; LLM-based extraction (already roadmapped as `DAMN-12`) is the quality tier for messy pasted text.

**Scaling and unit conversion (V2):**

- **Serving-size scaling** (`DAMN-7`): multiply structured quantities by a factor; flag the non-scaling cases (to taste, a pinch, oven temperature, pan size).
- **Like-for-like unit conversion** (`DAMN-8`): a library (`convert-units` / `js-quantities`) owns the math — volume↔volume, mass↔mass, temperature.
- **Volume↔weight conversion** (`DAMN-8`): needs per-ingredient density. Seed a density table from USDA FoodData Central (`foodPortions` gram weights) plus King Arthur Baking's ingredient weight chart, fuzzy-match the ingredient name, multiply. Degrade gracefully — no density data means that conversion is unavailable, with an option to add it. This is data curation, not numerical work.
- **`cooklang-rs` / Rust / WASM is rejected** for scaling and conversion — its converter only does the like-for-like tier anyway, and it adds a toolchain the project deliberately avoids (portability lens, `CLAUDE.md`). Revisit only if the TypeScript conversion work hits a wall in V2.

## Alternatives considered

- **Cooklang text blob as source of truth.** Simplest to build, nicest free-text authoring, trivial export. Rejected: noisy version diffs, parse-on-read for every derived need, the "did ingredients or a step change?" problem unsolved, and a stated preference against inline ingredient syntax.
- **Cooklang text + a derived parsed cache.** Faster to start, but carries cache-invalidation discipline, still needs a parser on the save path, and still authors in Cooklang syntax. No lasting advantage over storing structured directly.
- **Structured content in child tables** (rows per ingredient / step) instead of JSONB. Better if version content were mutable or queried field-by-field — it is neither. JSONB keeps a version as one immutable document. A canonical ingredient dictionary can still be added later as a separate entity that `content` lines reference (`ingredientRef`), without normalising the content itself.
- **Schema.org JSON-LD as internal storage.** Rejected: ingredients are unstructured free text with no quantity/unit/item separation. Kept as the interop format instead.

## Consequences

- **ADR-0007's diff mechanism follows from this:** structural, field-level comparison keyed by line identifier — not a text diff. Finalise the concurrent-edit half of ADR-0007 against this shape before `DAMN-3`.
- **Search (ADR-0002)** reads a derived structure, not the JSONB directly: ingredient text goes into the weighted `tsvector` on write; faceted / structured ingredient filtering (V2) uses a small extracted `(recipe_id, ingredient)` table, keyed by `ingredientRef` once a dictionary exists.
- **Import from URL (`DAMN-5`)** parses JSON-LD / scraped data into the structured shape via the pipeline above.
- **Export (ADR-0011)** serialises the structured content directly — near-lossless to native JSON and JSON-LD, best-effort to Cooklang text. The export `manifest.json` tracks `content_schema_version`.
- **The concrete recipe schema is a `DAMN-2` / `DAMN-3` deliverable**, not a prerequisite decision — this ADR unblocks that design work rather than doing it.
- Rust stays out of the stack unless V2 TypeScript conversion hits a wall.
