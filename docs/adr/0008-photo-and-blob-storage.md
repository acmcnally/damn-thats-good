# ADR-0008: Recipe photo / blob storage

**Status:** Accepted — the storage approach is settled. The **feature is deferred to V3** (`DAMN-24`): recipe photos and profile avatars are not a V1 concern (recipe content is the V1 priority; presentation polish is V3), and avatars are needed for the V3 profiles work anyway. **No `media` schema ships in V1** — adding the table and the `photo_media_id` / `avatar_media_id` FKs later is an additive migration. Wiring details (exact rendition sizes, accepted formats, HEIC handling) are settled when the V3 work starts.
**Decision drivers:** scope & simplicity · product preference (auth on every photo; content over presentation in V1)

## Context

Recipes will have a photo (one per recipe); Profiles will have an avatar (CLAUDE.md § Data model essentials). These are the only binary blobs the app stores. ADR-0004 says photos live on the platter HDDs but does not say *how* they are stored, resized, served, or backed up. This ADR fills that gap so the approach is on record before the V3 build.

Carried from other ADRs: the cost preference (ADR-0004 — free/low-cost preferred, not mandatory); the Cloudflare free-plan concern about serving a lot of non-HTML content through the proxy (ADR-0004); every recipe view requires auth (CLAUDE.md), so photos are **not** world-readable by URL.

Realistic scale: hundreds to low-thousands of recipes, one photo each, plus a handful of avatars. Total on the order of a couple of GB.

## Decision

- **Store blobs on the filesystem**, on the HDD-backed volume, under a **UUID path** (e.g. `/data/blobs/<uuid>/<size>.webp`). Not in Postgres — keeps the DB small, backups fast, and avoids large-object handling. Not content-addressed — there is nothing to dedup (one photo per recipe) and replace-in-place is the behaviour we want.
- **The database stores only metadata**: a `media` row (id, owner, `kind`, mime, width/height, byte size, created_at) referenced by `Recipe.photo_media_id` / `Profile.avatar_media_id`.
- **Process on upload**: validate, **strip EXIF** (privacy — location data) after applying any orientation, then **downscale to a retained "master"** at the largest display size ever needed (~1600–2048px) and generate a small set of smaller renditions, as WebP/AVIF, with `sharp` (Node-native, no extra service). **The true original is discarded** — the master is the archive copy. This halves storage and avoids holding users' raw multi-tens-of-MP files; the only cost is that a rendition larger than the master can never be produced, which does not matter for web display.
- **Replace = overwrite + delete the old files.** No photo history, no versioning of images (deliberate — this is not `RecipeVersion` content).
- **Upload guard is about protecting the box, not saving space.** Reject on **pixel dimensions** (~100MP cap — well above any real camera; checked from the image header *before* a full decode, so a decompression bomb is rejected cheaply). The file-size cap is secondary and set **generously**, near whatever the ingress layer forces (Cloudflare free/pro hard-cap request bodies at 100MB regardless — ADR-0004). An upload of a normal photo must never hit either limit.
- **Serve through the API**, not as static files: `GET /api/media/:id?size=card` **reuses the exact recipe-visibility check** (owner / `unlisted`-with-link / `public`-to-signed-in-users — the same logic as the recipe route, not a weaker one), then streams the file with `Cache-Control: private` and an ETag. This keeps auth on every photo, consistent with CLAUDE.md.
- **Avatars use their own rendition profile** — small, square-cropped — keyed off `media.kind`; their visibility check is "can the caller see this profile," not the recipe check.
- **Keep renditions small** so total photo bytes served through Cloudflare stays modest (ADR-0004 Cloudflare-ToS note). If Cloudflare ever objects, the fallback is to serve `/api/media/*` via a bypass route (Tunnel path not proxied / cached, or a separate hostname).

## Alternatives considered

- **Blobs in Postgres (`bytea` or large objects)**: simplest single-source-of-truth story and backups cover everything at once, but bloats the DB, slows `pg_dump`, and Postgres is not a good CDN. Rejected: unnecessary at this scale, actively bad at larger scale.
- **Self-hosted S3-compatible store (MinIO, Garage, SeaweedFS)**: gives a clean object API and presigned URLs, and would make a future move to real S3 trivial. Rejected for now as another always-on service to run and learn for a couple of GB of files — revisit only if blob volume or access patterns outgrow a directory.
- **Static serving straight from Caddy with signed URLs**: faster (no Node in the path) but implementing time-limited signed URLs + visibility checks correctly is more work than streaming through an API route that already has the session, and it splits auth logic across two systems.
- **A third-party image CDN / storage (Cloudinary, imgix, S3+CloudFront)**: a free tier would in fact cover a couple of GB at this scale, so cost isn't the objection. Not chosen because self-hosting photos on the box that already exists is genuinely simple, keeps user content in our own systems (consistent with the data-ownership stance in ADR-0011), and the resize/serve pipeline is small. Revisit if photo volume or traffic ever makes a CDN clearly worth it.
- **Keeping the true original alongside the renditions** (the earlier lean): rejected. Roughly doubles storage and means holding users' raw files, for the sole benefit of being able to re-render at a size larger than the master — which web display never needs. Downscale-on-upload to a generous master instead.

## Consequences

- **When built (V3), backups must cover two things**: the Postgres dump *and* the blob directory. ADR-0009 already accounts for both.
- Serving images through a Node API route costs some throughput vs. static serving — irrelevant at this scale, and `sharp` renditions plus HTTP caching keep repeat loads cheap.
- Filesystem and DB can drift (a `media` row with no file, or an orphan file). Mitigate with delete-file-after-commit ordering and a periodic reconciliation job.
- Changing the rendition set later means re-processing from the master — fine for any size at or below the master, impossible above it.
- V1 recipe schema (`DAMN-2` / `DAMN-4`) has **no photo field**. The `media` table and FKs arrive with `DAMN-24`.
