# ADR-0007: Recipe versioning — relational, linear history, no branching

**Status:** Accepted — no open items. The versioning model (relational, two-table split, content-only versioning, linear history) is settled; the diff mechanism follows from ADR-0006 (structural, field-level, keyed by stable per-line ids); concurrent-edit handling is settled (optimistic concurrency + draft-preserving reject in V1, an assisted-merge workflow planned for V3 — see Consequences).
**Decision drivers:** product preference

## Context

Wanted recipe edit history (see what changed, revert mistakes). Considered storing recipes as flat files (e.g. `.cook` files) with git as the version store, inspired by a pattern seen in other from-scratch recipe-app projects.

But this project already requires, from V1 onward: multi-owner Recipe Books, per-recipe visibility, copy-with-lineage (`forked_from`), and cross-cutting search/joins (e.g. "recipes tagged dessert containing cinnamon, ranked by relevance"). A flat-file+git approach would need a relational index built on top of the file layer anyway — two sources of truth that can drift — and git-as-a-library is awkward to operate in this stack. (Read-permission enforcement is not the reason: that lives in the app layer regardless of where content is stored.)

## Decision

Versioning lives inside the relational schema, split across two tables:

- **`Recipe`** — stable identity + all **non-versioned**, mutable-in-place fields: title, photo, servings/yield, provenance, tags, visibility, `book_id`, `current_version_id`.
- **`RecipeVersion`** — one row per save, holding only the **versioned** content: ingredients + steps (plus `recipe_id`, `version_number`, author, `created_at`, optional change note).

Only a change to ingredients or steps creates a new `RecipeVersion`. Changes to title, photo, servings, provenance, tags, notes, or visibility update the `Recipe` row in place and do **not** create a new version.

**Revert** = create a new version whose content matches an older version's (history stays linear and honest; no versions are ever destructively removed). **Diff / version comparison** is structural and field-level, keyed by the stable per-line ids ADR-0006 mandates — not a text diff — see Consequences.

Scope is intentionally simple: linear history only, no branching/merging. The `forked_from` pointer (set when a recipe is copied via "Copy to Recipe Book") already covers the "divergent copy" case without needing true git-like branch semantics.

## Alternatives considered

- **Flat files + git**: rejected — see Context. Operationally awkward (`isomorphic-git` or shelling out), messy history across renames, and it would still need the relational DB as the query index (two sources of truth).
- **Branching/mergeable version history**: rejected as unnecessary complexity for the *history* need ("what did this used to say" / "undo my mistake"). This is a different question from **concurrent edits to the same recipe** — two owners of a shared book editing at the same time — which is handled separately by optimistic concurrency (see the subsection in Consequences). (Offline editing, which would also cause concurrent edits, is permanently out of scope — ADR-0001.)
- **Real-time collaborative editing (CRDT / OT — Yjs, Automerge)**: rejected. It would dissolve the "conflict" concept, but it fights the linear, one-row-per-save model, needs an always-on sync service (ADR-0004, §3), and solves a problem — frequent simultaneous co-editing — this app does not have.
- **Whole-recipe snapshot instead of a content/non-content split**: a single append-only `recipe_revisions` table that snapshots the entire recipe (title, tags, servings, visibility, content, …) on every save — history and revert for *every* field, at negligible extra storage. Not chosen: the owner wants history to mean "the recipe's content changed," and title/photo/tags/servings/visibility to be plain mutable metadata. That is a deliberate product call. The trade-off it accepts is spelled out in Consequences.

## Consequences

- Both halves of this feature build on the content representation (ADR-0006 — structured JSONB, decided): the "did the content actually change?" check at save time is a structural compare of the two `content` documents, and the diff *presentation* is field-level, keyed by stable per-line ids.

### What the content/non-content split costs (accepted)

Only ingredients/steps are versioned. Title, photo, servings, provenance, tags, and visibility update in place with **no history and no revert**. So a fat-fingered servings value or a wrecked tag set can't be rolled back the way a bad edit to the steps can. The owner has accepted this: those fields are treated as lightweight metadata, and "version history" deliberately means content history only.

If full-field undo is ever wanted later, the migration is not painful: add an append-only `recipe_revisions` table that snapshots the whole `Recipe` row on write, backfill one row per existing recipe, and switch revert to restore from it. History stays linear either way. No need to design for that now.

### Concurrent edits to the same recipe

Recipe Books are multi-owner with flat/equal ownership, so two owners can edit the same recipe at the same time (both online — offline editing is out of scope, ADR-0001). This is impossible until shared books ship (`DAMN-19`, V3) and rare even then, but linear history alone gives silent last-write-wins, so it needs an answer. `forked_from` does **not** help — it is for explicit copies, not concurrent edits of one recipe.

**V1 / permanent floor — optimistic concurrency:**

- A content save carries the `current_version_id` it was based on; the server rejects it (HTTP 412) if that is stale.
- The non-versioned `Recipe` fields (title, photo, servings, tags, visibility, notes) carry a **separate** guard — a `Recipe` row version / `updated_at` — since editing them does not advance `current_version_id`.
- On rejection the client **preserves the user's draft** and shows the current version alongside it with a "reconcile and re-save" prompt. Manual, but nothing is lost. This is a correct, no-data-loss design on its own.

**V3 — assisted merge (planned, may be scoped out):**

When shared books ship, an assisted-merge workflow on rejection is planned: a side-by-side, field-level reconciliation UI (pick per line), with automatic merge of non-conflicting structured changes as a follow-on **only if** the manual step proves tedious in practice. Both may be dropped from V3 without harm — the V1 floor still holds. The stable per-line ids from ADR-0006 are what keep this tractable (per-id 3-way compare; order divergence surfaces as a conflict the user resolves).

**Not doing:** real-time collaborative editing (CRDT / OT) — see Alternatives.
