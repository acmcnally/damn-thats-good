# Feature: UX framework — app shell & navigation

**Linear issue:** DAMN-32
**Release:** V1
**Depends on:** DAMN-1 (auth, shipped). **Hands off to:** DAMN-14 (profile-synced appearance prefs), DAMN-2 / DAMN-11 / Data-page follow-ons (fill the placeholder routes), DAMN-6 (search behaviour).

## Summary

Replace DAMN-1's bare `Landing` with the persistent app shell every other V1 feature is built inside: an unauthenticated splash, then an authenticated frame with a left nav rail, a top bar (search + gear + avatar, all top-right except search), and real client-side routes to placeholder pages. Introduces `react-router`, a CSS-custom-property design-token layer, and a working appearance picker (light/dark + three color palettes) persisted to `localStorage`. No API or schema changes — this is an `apps/web`-only change plus the mockup docs already on the branch.

Two things are *functional*, not scaffolding: **Login / Sign out** (already wired in DAMN-1, re-hosted here) and **theming**. Everything else — search, nav page contents, the Create menu targets, the avatar image — is inert placeholder.

## UX / UI

Design pass done via the `ux-ui-design` skill. Artifacts on this branch:

- `mockups/app-shell.html` — interactive walkthrough (splash → login → shell → nav → placeholder pages → settings menu → live theme switching)
- `mockups/palette-typography.html` — the three-palette exploration + light/dark toggle demo
- `mockups/shots/*.png` — captured screenshots (the durable visual record)

Settled direction:

| Aspect | Decision |
|---|---|
| Type | **Rubik**, one family, everything. No serif. Chosen over Nunito/Figtree after a specimen comparison (`mockups/typography-*.html`): more composed at headings, more compact in the nav. |
| Type scale (locked) | Reading text (method, ingredients) 15px/400 · nav & buttons 14px/500 · metadata & captions 13px/500 · badges, all-caps eyebrows, counters **12px/600** · **hard floor 12px, nothing smaller**. All-caps gets +0.04em tracking. Rationale: Rubik closes its apertures and thickens up below ~12px on low-DPI panels — the 12px floor + easing badge weight from 700→600 keeps small chrome legible; density cost is nil for this app's screens. Mockups predate this scale and only approximate it — **this table is authoritative**. |
| Shape | Pill buttons (`--radius-full`), generously rounded cards (`--radius-lg` 18px). |
| Warmth | Comes from color + rounded shapes, not a characterful typeface. |
| Palettes | **Terracotta** (default), **Sage**, **Plum** — pure color-token swap, identical type + components, each with a light and dark variant. |
| Layout | Nav rail **left** (232px), top bar over the content column, gear + avatar **top-right**. |
| Splash | Centered wordmark only (no top-left mark, no tagline); "Log in" top-right. |
| Settings menu | Gear icon left of the avatar → click-to-open popover; `Light — ⬤ — Dark` switch (toggle centered between the two labels, labels also clickable) + a Terracotta/Sage/Plum `<select>`; dismissed by outside click only; every change repaints live. |
| Search | On `/` before the first navigation of the session: centered in the main pane. After navigating anywhere: in the top bar for the rest of the session. Inert either way (DAMN-6 owns behaviour). |

## Open decisions from phase 1 — resolved

| Decision | Resolution |
|---|---|
| Shopping Lists nav entry vs DAMN-11 | Real clickable route → placeholder page reading "Coming soon" (names DAMN-11 / V2). No list CRUD here. |
| Client-side routing | Add `react-router` now — DAMN-1's design flagged this as the trigger. |
| Theme scope | Color-only swap. Shared type + components. Terracotta default; Sage + Plum ship wired. |
| Settings picker location | New top-bar settings menu (gear popover) in this issue. Full working picker, not just architecture. |
| Appearance prefs storage | `localStorage` (device-local) here; cross-device profile sync is DAMN-14's job (comment posted there). Not a cookie. |
| Layout orientation | Nav left / account controls right (reverses the original issue text — description updated inline). |

## New dependencies

| Package | Why | Notes |
|---|---|---|
| `react-router` (v7.x, exact-pinned) | Client-side routing | v7 is the current line; `createBrowserRouter` + `<RouterProvider>` API (see Routing). One dep — `react-router-dom` merged into `react-router` in v7. |
| `@fontsource-variable/rubik` (or `@fontsource/rubik` weights 400/500/600/700) | Self-hosted Rubik | Bundled, no runtime request to Google Fonts — fits ADR-0004's "no avoidable external runtime deps" and keeps the self-hosted app private. Imported once in `styles/base.css`. Latin subset only. |

No other additions. Icons are hand-inlined SVG (a small `components/icons.tsx` set) — no icon library.

## Styling approach — **decision needed**

This issue sets the pattern for the whole frontend, so it's called out explicitly rather than assumed.

**Recommendation: plain CSS + CSS Modules, tokens as CSS custom properties.**

- `styles/tokens.css` and `styles/base.css` — plain global stylesheets, imported once in `main.tsx`. Not modules.
- Every component gets a colocated `Component.module.css`. Vite has built-in CSS-Modules support (`*.module.css`), zero config, zero runtime.
- Theming is pure CSS: `:root` holds structural tokens; `[data-palette="…"]` and `[data-palette="…"][data-theme="dark"]` selectors hold the color tokens. Components only ever reference `var(--color-…)` by role.

| Option | For | Against |
|---|---|---|
| **Plain CSS + CSS Modules** ✅ | Zero runtime, zero build additions (Vite native), portable/marketable skill with no lock-in, theming is trivially just CSS variables, small mental model for someone new to React | Slightly more boilerplate than utility classes; no design-system enforcement beyond token discipline |
| Tailwind | Fast to compose, popular | Config + mental-model overhead on top of learning React; the 3-palette theming still needs CSS-var-backed config underneath; large surface added at the worst time |
| CSS-in-JS (styled-components / emotion) | Colocated, dynamic | Runtime cost; the ecosystem has moved away from it; extra dep |
| vanilla-extract | Type-safe tokens, compile-time | Niche, another build integration to learn |

## Routing

`react-router` v7, `createBrowserRouter` + `<RouterProvider>` (route config as data, not JSX `<Routes>` — cleaner separation and the forward-looking API for when DAMN-2+ wants loaders).

```
/                 → AuthGate → AppShell → <Home>            (authed; centered search on first entry)
/recipes          → AuthGate → AppShell → <RecipesPage>     (placeholder)
/shopping-lists   → AuthGate → AppShell → <ShoppingListsPage> ("Coming soon")
/data             → AuthGate → AppShell → <DataPage>        (reference-data placeholder + disabled export)
/profile          → AuthGate → AppShell → <ProfilePage>     (placeholder)
/login            → <LoginRedirect>   (calls AuthKit signIn(); no shell)
/callback         → handled by AuthKitProvider's onRedirectCallback before any route renders
*                 → redirect to /
```

- **`AuthGate`** — extracted from DAMN-1's `App.tsx`. Same logic, unchanged semantics: E2E bypass cookie short-circuits; `/login` always triggers `signIn()`; loading state; `!user` → `signIn()`. It wraps the shell routes; `/login` sits outside it.
- **`AppShell`** — the CSS-grid frame (top bar + nav rail + `<Outlet/>`). Persistent across the authed routes.
- The unauthenticated **Splash** is what `AuthGate` renders in place of `signIn()`-redirect when we want a landing rather than an immediate bounce — i.e. `/` while signed out shows Splash with a "Log in" button (button calls `signIn()`); every other path while signed out redirects through `signIn()`. *(Minor refinement of DAMN-1, where any unauthenticated path bounced straight to AuthKit. Confirm during implementation that AuthKit's initiate-login expectations are still met — the `/login` route is unchanged.)*
- Caddy (`infra/Caddyfile`) and the Vite dev server already do SPA fallback (`try_files … /index.html`), so deep links to `/recipes` etc. work in every environment. No infra change.

## Design tokens & theming

### Token layer (`apps/web/src/styles/tokens.css`)

- **Structural tokens on `:root`** (palette-neutral): `--font-sans` (`'Rubik', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif`), the type scale per the locked table above (`--text-xs` = 12px is the floor), weights (`--weight-regular 400 / -medium 500 / -semibold 600 / -bold 700`), line-heights, spacing (`--space-1 … --space-8`, 8pt), radii (`--radius-sm/md/lg/full`), elevation (`--shadow-1/2`), motion (`--dur-*`, easing).
- **Color tokens scoped by palette + mode**: `[data-palette="terracotta"] { … light values … }` and `[data-palette="terracotta"][data-theme="dark"] { … dark overrides … }`, ×3 palettes. Semantic names only — `--color-bg-primary`, `--color-text-primary/secondary/tertiary`, `--color-border`/`-strong`, `--color-brand` (fixed per palette across modes), `--color-accent`/`-hover`/`-muted`, `--color-text-on-accent`, `--color-focus`, `--color-danger`. Concrete hex values + WCAG-AA contrast results are in `mockups/palette-typography.html` (all pairs pass AA; `--color-brand` is checked at the 3:1 large-text/graphic threshold since it's the wordmark).
- No `packages/` promotion — these are web-presentation-only. DAMN-14 promotes `ColorMode`/`Palette` *type* names to `@dtg/shared` if/when the profile DTO needs them.

### Applying the theme

Two `data-*` attributes on `<html>`: `data-palette` (`terracotta` default) and `data-theme` (`dark`, or absent for light).

1. **FOUC guard — blocking inline script in `index.html`**, before the module bundle:
   ```html
   <script>
     try {
       var p = JSON.parse(localStorage.getItem('dtg.appearance') || '{}');
       var pal = ['terracotta','sage','plum'].indexOf(p.palette) >= 0 ? p.palette : 'terracotta';
       var dark = p.mode === 'dark' || (p.mode == null &&
         window.matchMedia('(prefers-color-scheme: dark)').matches);
       document.documentElement.dataset.palette = pal;
       if (dark) document.documentElement.dataset.theme = 'dark';
     } catch (e) {}
   </script>
   ```
   `index.html` is promoted across environments unchanged (ADR-0010) — safe here: this script reads only `localStorage`, no env-specific or build-time content. The palette allow-list is duplicated (also in `appearance/types.ts`) — accepted, the pre-module script can't import; keep both in sync (a comment cross-references).
2. **`AppearanceProvider`** (React context) takes over after mount: holds `{ mode: 'light' | 'dark' | null, palette }`, writes both `data-*` attributes via effect, persists to `localStorage` on change, exposes `useAppearance()` → `{ mode, palette, effectiveMode, setMode, setPalette }`. `mode: null` = follow system (default until the user first flips the switch); the switch shows `effectiveMode`.
3. **`resolve.ts`** — pure helpers (`readStored()`, `writeStored()`, `resolveEffectiveMode(stored, systemPrefersDark)`), unit-tested independently of React/DOM.

### Motion

Menu/popover open uses a ≤150ms scale+fade (`--dur-quick` ceiling per ADR-0012's testing doc references design-tokens guidance: input-gating ≤300ms). `@media (prefers-reduced-motion: reduce)` collapses it. No looping/ambient motion anywhere in the shell.

## Component inventory (`apps/web/src/`)

| File | Role |
|---|---|
| `main.tsx` | Mount `<RouterProvider>` inside the existing `AuthKitProvider` + `AppearanceProvider`; keep DAMN-1's `GET /api/config` bootstrap. |
| `router.tsx` | Route config (above). |
| `auth/AuthGate.tsx` | Extracted from `App.tsx` — auth gate + E2E bypass. Wraps shell routes. |
| `routes/Splash.tsx` | Unauthenticated landing — centered wordmark, "Log in" (→ `signIn()`). |
| `shell/AppShell.tsx` | Grid frame: `<TopBar>` + `<NavRail>` + `<Outlet/>`. Owns the session `hasNavigated` state (set true on first navigation away from `/`). |
| `shell/TopBar.tsx` | Search slot (placement-aware) + gear + avatar. |
| `shell/NavRail.tsx` | Create button + menu (Recipe / Shopping list — inert), nav items (Recipes, Shopping Lists, divider, Data), active-route highlight via `NavLink`. |
| `shell/SearchControl.tsx` | Inert search input; `variant="hero" | "bar"`. |
| `appearance/SettingsMenu.tsx` | Gear popover — Light/Dark switch + palette `<select>`. |
| `shell/AvatarMenu.tsx` | Profile (→ `/profile`) / Sign out (→ `signOut()`). |
| `shell/usePopover.ts` | Shared hook: open/close, outside-click-to-dismiss, one-open-at-a-time, `Escape` to close, focus return. Used by the three menus. |
| `routes/Home.tsx` | Authed home — hero search on first entry, otherwise minimal. |
| `routes/RecipesPage.tsx` `ShoppingListsPage.tsx` `DataPage.tsx` `ProfilePage.tsx` | Placeholder pages per the mockup. |
| `appearance/{types,resolve,AppearanceProvider}.ts(x)` | Theming (above). |
| `components/DefaultAvatar.tsx` | Inline SVG person mark, `currentColor`. Static, until DAMN-24. |
| `components/icons.tsx` | Inlined SVG set (gear, search, book, cart, database, arrow, sign-out, user). |
| `styles/tokens.css` `styles/base.css` | Global stylesheets (reset, `@font-face` via `@fontsource`, tokens). |

**Deleted:** `Landing.tsx`, `Landing.component.test.tsx` (absorbed into `Home` + shell). `App.tsx` → becomes `auth/AuthGate.tsx` (or stays as a thin composition root; decide during implementation). `apiClient.ts`, `e2eBypass.ts` unchanged.

## Data model

**None.** No schema, no migration.

## API surface

**None new.** `GET /api/me` (DAMN-1) still backs the avatar menu / profile placeholder identity line. `GET /api/config` bootstrap unchanged. No sign-out endpoint (client + WorkOS only, per DAMN-1).

## Config / env changes

**None.** No new env vars. `index.html` gains the inline FOUC script (no env content). `docker-compose.yml` / `deploy/compose.yaml` untouched.

## Test plan (ADR-0012 tiers)

### Unit (`*.test.ts`, node)
- `appearance/resolve.ts`: `readStored()` with absent / malformed / partial / valid JSON; `resolveEffectiveMode()` truth table (`mode` set vs `null` × `prefers-color-scheme`); `writeStored()` round-trips; unknown palette → falls back to `terracotta`.

### Component-web (`*.component.test.tsx`, jsdom + RTL + MSW)
- **Auth gate (migrated from `App.component.test.tsx`, all five behaviours preserved):** loading state; no-user → `signIn()`; user present → shell renders; `/login` → always `signIn()`; E2E bypass cookie → shell renders even while "loading" with no user.
- **Routing:** clicking each nav item renders the matching placeholder page and updates the URL; `ShoppingListsPage` shows "Coming soon"; `DataPage` shows the disabled export control; unknown path → redirect to `/`.
- **Avatar menu:** opens on click; "Profile" navigates to `/profile`; "Sign out" calls the injected `signOut`.
- **Settings menu:** opens on gear click; clicking inside (toggling dark, changing palette) does **not** close it; outside click closes it; `Escape` closes it. Toggling dark sets `document.documentElement.dataset.theme`; choosing a palette sets `dataset.palette`; both write `localStorage['dtg.appearance']` (asserted via a spy or a real jsdom `localStorage`).
- **Appearance provider:** mounts from a seeded `localStorage` value and applies both attributes; `prefers-color-scheme` drives the default when `mode` is null (mock `matchMedia`).
- **Search placement:** `<Home>` on `/` with `hasNavigated=false` renders the hero search and no top-bar search; after a navigation, the top-bar search renders.

### Workflow (Playwright, `e2e/tests/`)
Extend the smoke spec (or add `shell.spec.ts`), reusing `loginAsTestUser`:
- Existing `GET /api/health` check stays.
- After bypass login, the shell renders (nav rail + top bar visible).
- Click "Recipes" → URL is `/recipes`, the Recipes placeholder heading is visible.
- Open settings → toggle Dark → `<html>` has `data-theme="dark"` → **reload** → still dark (localStorage persisted). Switch palette → `data-palette` updates.
- Avatar menu → "Sign out" → back to the splash screen ("Log in" visible). *(Bypass note: `signOut()` clears AuthKit state; under the bypass cookie the app re-renders the gate. Confirm the cookie doesn't force an immediate re-auth loop — if it does, assert the button calls the SDK method instead, matching DAMN-1's smoke-test caveat.)*

`pnpm verify` (all tiers + `pnpm e2e`) is the gate; CI `verify` is the backstop; `e2e-staging` runs the workflow tier against staging and gates the prod promote.

## Accessibility

- Menus: `aria-haspopup`, `aria-expanded`, `Escape` to close, focus returns to the trigger on close, focus-visible ring uses `--color-focus`.
- The Light/Dark control is a real `role="switch"` with `aria-checked`; the flanking labels are `<label>`/clickable and associated.
- Nav uses `<nav>` + `NavLink` with `aria-current="page"`.
- All AA contrast pairs verified in the palette mockup, both modes, all three palettes.
- `prefers-reduced-motion` honoured for the popover animation.
- Hit targets ≥44px (buttons, nav items, switch).

## Adversarial design review

_(Pending — fresh-context review against the frozen scope, the mockups, this doc, and the ADRs, per the feature workflow. Findings + resolutions recorded here.)_
