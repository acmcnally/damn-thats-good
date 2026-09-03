# ADR-0002: PostgreSQL + Drizzle ORM

**Status:** Accepted — PostgreSQL + Drizzle decided; wired to a running stack as of DAMN-26 (Postgres 17.11, `drizzle-kit generate` → committed SQL → a one-shot `migrate` step, never on app boot). The search *implementation* (how FTS and `pg_trgm` blend; prefix matching for type-ahead) is an open design task for the V1 search build — see "Known soft spots".
**Decision drivers:** skill development (portability lens) · scope & simplicity

## Context

Data model is genuinely relational: multi-owner Recipe Books, visibility-scoped Recipes, a linear version history per recipe, collection references, and cross-cutting search across all of it. Need a database and an ORM/data-access layer in TypeScript. This leans on the owner's prior relational-database and ORM experience — see `CLAUDE.md`.

PostgreSQL is chosen on all four relevant counts: it is a stated learning target (a real RDBMS plus full-text search learned directly), it is the industry-standard, marketable choice (portability lens), it fits the owner's existing relational background, and it stays within hobbyist scope (one container, no new ongoing cost).

Search is a product requirement: exact-match-first, weighted relevance across recipe name > tags > ingredients > provenance, with live filter-as-you-type. (On "provenance" as a field, see CLAUDE.md § Data model essentials.)

## Decision

- **Database:** PostgreSQL.
- **ORM:** Drizzle — schema defined in TypeScript, queries stay close to SQL, thin runtime (migrations still go through `drizzle-kit`).
- **Search:** Postgres full-text search (`tsvector`/`ts_rank`) for weighted relevance + `pg_trgm` for typo tolerance. The exact way the two combine is **not** settled — see "Known soft spots"; do not assume the naive "FTS first, trigram only on zero results" flow. No dedicated search engine (Meilisearch/Typesense/Elasticsearch) planned — not worth an extra always-on service at this scale (hundreds to low thousands of recipes).

## Alternatives considered

- **Prisma** instead of Drizzle: more polished tooling (Prisma Studio, migration ergonomics), but it puts a generated client between you and the SQL. The driver for Drizzle is skill development: its close-to-SQL style complements learning Postgres FTS/`pg_trgm` directly, and its schema-and-query model sits close to the owner's prior ORM instincts. Note: Drizzle is *not* codegen-free — `drizzle-kit generate` produces migrations; the real difference from Prisma is the thin runtime and SQL-shaped queries. On the portability lens alone, Prisma has wider adoption, but both are mainstream, marketable choices and the owner's rationale holds. The choice stands.
- **TypeORM**: the older, JPA/Hibernate-style option in this ecosystem — both Prisma and Drizzle are generally considered its successors; not seriously considered.
- **SQLite (with Litestream for off-site backup)**: technically sufficient at this scale (single box, low-thousands of recipes; FTS5 is capable and simple; Litestream handles off-site backup). Not chosen because it is *less* aligned with every driver here: it is not the learning target, it is the less-marketable choice on the portability lens, and it does not match the owner's RDBMS background. Kept in mind only as the fallback if single-box Postgres ops ever became a genuine burden.
- **A dedicated search engine from day one** (Meilisearch, etc.): deferred as premature — Postgres FTS + `pg_trgm` covers the requirement (exact match to top, weighted ranking) at this project's scale, and it's one fewer always-on service. Revisit only if search quality or query volume becomes a real pain point (see "Known soft spots" for what "quality" actually means here).

## Consequences

- Postgres FTS setup requires understanding `tsvector`/`tsquery`, GIN indexing, and relevance ranking directly — more upfront learning than a magic search SaaS, but transferable database skill and no extra service to run.
- If search needs ever do outgrow Postgres, a dedicated engine becomes an *addition* alongside Postgres (which remains system of record), not a replacement.

### Known soft spots in the search plan

- **"Not enough rows to need a search engine" is the wrong reason to defer one.** Dedicated engines (Meilisearch etc.) earn their keep on *relevance quality, typo tolerance, faceting, and instant-search latency* — not on corpus size. Meilisearch at 2,000 rows still gives noticeably better out-of-the-box search feel than hand-tuned `tsvector`. Deferring is still right here — it's an extra always-on service — but the honest reason is "not worth the extra service yet," and the trade-off is real search-quality effort in Postgres instead.
- **`pg_trgm` "fallback only on zero FTS results" is a poor UX.** The user sees an empty result set, then a different set appears — it reads as flakiness. Better: blend FTS rank and trigram similarity in a single ranked query. More work than the ADR implies.
- **"Filter-as-you-type" against `tsvector` means running FTS on every keystroke**, which needs prefix matching (`to_tsquery('foo:*')`). Prefix queries interact awkwardly with both `ts_rank` weighting and the `pg_trgm` path. This is the genuinely fiddly part of the search work and is currently under-specified — treat it as a design task during the V1 search build, not a solved detail.
- **Open: is `provenance` worth a weight tier?** The four tiers (name > tags > ingredients > provenance) map neatly onto `tsvector`'s A/B/C/D, but people rarely search *by* provenance ("from Bon Appétit"). A recipe description / notes field might deserve that D slot instead. Decide when the fields are finalised for the V1 search build.
