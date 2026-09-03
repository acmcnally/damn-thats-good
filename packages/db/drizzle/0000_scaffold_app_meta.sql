-- SCAFFOLD(DAMN-26): provisional baseline. `app_meta` exists only for the walking-skeleton
-- round-trip. DAMN-2 REGENERATES this baseline from the real schema (deletes these files,
-- runs `generate` fresh) rather than layering a drop migration on top — safe while no
-- migration has been applied to a persistent DB (no staging/prod yet — ADR-0010; CI uses
-- ephemeral Testcontainers). See docs/features/DAMN-26-local-compose-stack/technical-design.md.

CREATE TABLE "app_meta" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"name" text NOT NULL,
	"seeded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "app_meta_single_row" CHECK ("app_meta"."id" = 1)
);
--> statement-breakpoint
-- Seed the single row. Added by hand — `drizzle-kit generate` emits DDL only; the
-- meta/ snapshot therefore does not describe this INSERT, which is fine for a
-- provisional baseline (DAMN-2 regenerates it).
INSERT INTO "app_meta" ("id", "name") VALUES (1, 'Damn That''s Good') ON CONFLICT DO NOTHING;
