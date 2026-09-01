# ADR-0011: Data export and portability

**Status:** Proposed — V4 feature, early. Covers export only; the import / round-trip half of `DAMN-23` is not yet specified (see Open question).
**Decision drivers:** product preference (data ownership)

## Context

Several other ADRs lean on an "own your data" principle — ADR-0009 keeps backups client-side-encrypted so the off-site host holds only ciphertext; ADR-0008 self-hosts photos; ADR-0003 keeps only a content-anchoring `users` row locally and leaves auth identity with the managed provider, on the basis that this principle is about content, not credentials. The principle is about **user content** (recipes, books, versions, profiles, photos — all in our own systems regardless of the auth choice), and it is only real if a user can actually *get their content out*. This ADR makes that concrete and gives the other ADRs something to point at.

This is not a V1-critical feature (it lands in V4 App Experience, Linear `DAMN-23`), but the data-model and content-format choices that make export cheap or expensive are being made now, so the decision belongs on the record early.

**Not the same as offline support.** This ADR is about producing a **portable export file** the user takes elsewhere. The separate possible V4 idea of downloading a recipe book to a **local store for offline reading** (a synced local read copy — `DAMN-21`, ADR-0001) is a different feature with its own sync/staleness questions. Don't conflate them.

**Scope note:** this is a *data-portability* feature only. The app has no anonymous / public-to-the-internet access (see CLAUDE.md), so the Schema.org / JSON-LD output below is for interop with other tools a user chooses to move their data into — it is never published, crawled, or used for SEO.

## Decision

- **Every user can export everything they own**, on demand, with no admin involvement: their profile, their recipe books, every recipe in them, and the **full version history** of each recipe (per ADR-0007, history is never destroyed, so export includes it).
- **Format: a single ZIP** containing:
  - `recipes/<book>/<recipe>/` with one file per version of the content (the structured `content` JSON from ADR-0006, also rendered to best-effort `.cook` text for readability), plus a `recipe.json` for the non-versioned fields (title, tags, servings, provenance, visibility, `forked_from`, timestamps).
  - Photos as files alongside each recipe.
  - A top-level `manifest.json` describing structure and schema version.
  - Also emit a **Schema.org `Recipe` JSON-LD** file per recipe for portability into other tools the user chooses (JSON-LD is ADR-0006's primary interop format — interop only, not a public/SEO artifact).
- **Collection references** (links to other people's recipes) export as lightweight pointers with enough metadata to be human-useful, not as copies — they are not the user's content to take.
- Export is a background job that produces a downloadable artifact; the user is notified when it is ready.
- **Account deletion** offers the user an export first (prompt, not automatic), then removes the user's owned content (with the multi-owner-book edge case — see Consequences). Deletion also calls the auth provider's delete-user API (ADR-0003 — WorkOS).

## Alternatives considered

- **No export / "it's all in Postgres, do a dump"**: a DB dump is not user-accessible, not portable, and not per-user. It does not satisfy the principle the other ADRs invoke.
- **Per-recipe export only** (no bulk): useful and probably ships first, but does not cover "leave the app with everything."
- **A live API for third-party clients instead of a file export**: larger surface, ongoing compatibility burden, and not what "portability" requires. The REST API (ADR-0001) is for our own clients; a documented export file is the portability guarantee.
- **Cooklang-only export** (no JSON-LD): more faithful to internal representation but less interoperable with the wider recipe ecosystem. Do both.

### Open question: import / round-trip

`DAMN-23` is "import **and** export." This ADR only covers export. Still to specify: can a user re-import an export archive (restore a book, move between instances)? That is different from recipe-level import (Cooklang paste / URL scrape — ADR-0006, `DAMN-5`). A faithful round-trip is the real test of "own your data," so the export format above should be designed with re-import in mind (stable ids, the `manifest.json` schema version, `forked_from` / collection-reference resolution rules). Design the import side before the export format is frozen.

## Consequences

- With structured content (ADR-0006) and history as complete rows (ADR-0007), this export is nearly a straight serialization — no lossy transformation to native JSON or JSON-LD, and each version also renders to best-effort `.cook` text. The `manifest.json` schema version tracks the `content_schema_version` from ADR-0006.
- **Multi-owner books** (data model): a book owned by several users cannot be unilaterally deleted when one owner leaves. On account deletion, the leaving user is removed from the ownership set; the book and its recipes remain for the other owners. A book with only the leaving user as owner is deleted (after export). This rule needs to be stated in the account-deletion feature spec.
- Export bundles include photos (once photos exist — V3, ADR-0008 / `DAMN-24`), so export artifact size is dominated by images — bundle the master rendition from ADR-0008 (there are no kept originals) to keep the archive reasonable.
- Export artifacts contain a user's full data and must themselves be access-controlled (signed, expiring download URL; deleted after a short window).
