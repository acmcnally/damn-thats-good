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
| `react-router` (`^8` — current stable is 8.3.1; `^` range like the repo's `react`/`react-dom`) | Client-side routing | v8 peer deps (`react >=19.2.7`, `node >=22.22`) are satisfied (project: react 19.3, Node ≥24). **Data Mode** — `createBrowserRouter` + `<RouterProvider>` from `react-router/dom` (see Routing) — is still first-class in v8; we deliberately do **not** use v8's promoted Framework Mode (file-based routes + SSR machinery a static-served SPA doesn't need). One dep — `react-router-dom` was folded into `react-router`. v7→v8 breaking changes (`data`→`loaderData`, Cloudflare dev-proxy, Framework-Mode request handling) don't touch anything here. |
| `@fontsource-variable/rubik` (or `@fontsource/rubik` weights 400/500/600/700) | Self-hosted Rubik | Bundled, no runtime request to Google Fonts — fits ADR-0004's "no avoidable external runtime deps" and keeps the self-hosted app private. Imported once in `styles/base.css`. Latin subset only. |

No other additions. Icons are hand-inlined SVG (a small `components/icons.tsx` set) — no icon library.

## Styling approach — **decided: plain CSS + CSS Modules, tokens as CSS custom properties**

This issue sets the pattern for the whole frontend. Owner-approved 2026-09-10.

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

`react-router` v8 (Data Mode): `createBrowserRouter` + `<RouterProvider>` (from `react-router/dom`), route config as data — not JSX `<Routes>`, and not v8's file-based Framework Mode. Clean config/render separation, and the forward-looking API for when DAMN-2+ wants loaders.

### Structure — nested layout routes (not per-route wrappers)

`AppShell` must be **persistent** across every authed screen (the issue's premise), so it is a *layout route* with an `<Outlet/>`, not a wrapper repeated per page. Repeating `<AuthGate><AppShell>…` per route would remount the shell on every navigation → nav-rail flicker, lost scroll, and `hasNavigated` (see Search placement) reset on every click.

```
<AuthGate>                       layout route — auth gate, renders <Outlet/> when authed
  <AppShell>                     layout route — grid frame (top bar + nav rail + <Outlet/>)
    index            → <Home>              (centered search until first navigation)
    "recipes"        → <RecipesPage>       (placeholder)
    "shopping-lists" → <ShoppingListsPage> ("Coming soon")
    "data"           → <DataPage>          (reference-data placeholder + disabled export)
    "profile"        → <ProfilePage>       (placeholder)
"login"      → <LoginRedirect>   (outside AuthGate — calls signIn(); no shell)
"callback"   → <AuthCallback>    (outside AuthGate — inert; see below)
"*"          → <Navigate to="/" replace>  (outside AuthGate; a logged-out user hitting an
                                            unknown path lands on "/" → Splash, not a bounce)
```

`router.tsx` **exports the route-config array separately** from the `createBrowserRouter(...)` instance, so component tests can build a `createMemoryRouter(routes, { initialEntries: ['/login'] })` — the five migrated `App.component.test.tsx` path-based cases need this.

### `/callback` — explicit inert route (review finding #1)

DAMN-1's "`onRedirectCallback` intercepts before route code runs" held only because there was no router. With a data router, `/callback` is now matched route code: without an explicit entry, `*` matches it and its `<Navigate to="/">` fires on mount (child effects before parent) — `history.replace('/')` drops `?code=…` before `AuthKitProvider`'s effect reads it, and sign-in intermittently lands back on Splash.

Fix:
- Explicit `/callback` route rendering `<AuthCallback>` — an inert full-screen spinner that **never navigates**.
- `AuthKitProvider`'s `onRedirectCallback` is wired to `router.navigate(...)` (post-exchange) rather than letting the SDK do a raw `history.replaceState` that wouldn't re-trigger route matching.
- Component test: mounting `/callback` renders the spinner and **does not** render Splash or redirect.

### The E2E bypass, across the new route boundaries (review finding #3)

DAMN-1's `App.tsx` checks `hasE2eBypassCookie()` *first*, before anything else. In the new structure `/login` and `/callback` are **outside** `AuthGate`, and each has a component that acts on mount — `<LoginRedirect>` calls `signIn()`, `<AuthCallback>` waits for a code exchange — so a bypass-context hit on either (e.g. `apiClient.ts` doing `window.location.assign('/login')` on a stray 401) would fire a real WorkOS flow instead of rendering the app.

Fix: **every entry point that can trigger auth checks `hasE2eBypassCookie()` first** — a one-line guard, extracted to `auth/bypass.ts` (`hasE2eBypassCookie()` + a `<BypassRedirect/>` helper that `<Navigate to="/" replace>`s):
- `AuthGate` — bypass ⇒ render `<Outlet/>` (treat session as authed), exactly as `App.tsx` does today.
- `LoginRedirect` — bypass ⇒ `<Navigate to="/" replace>` instead of `signIn()`.
- `AuthCallback` — bypass ⇒ `<Navigate to="/" replace>` instead of waiting.

Everything else in `AuthGate` keeps DAMN-1's semantics: loading state; `!user` on `/` → Splash; `!user` elsewhere → `signIn()`. The **server env var remains the sole authority** — the cookie alone still grants nothing, and none of these client guards change that.

### Splash

`AuthGate`, signed out: on `/` it renders **Splash** (centered wordmark + "Log in" button → `signIn()`); on any other path it redirects through `signIn()`. This is a **frozen-scope requirement** — the issue's "Unauthenticated: splash screen" section — not a refinement; DAMN-1 simply deferred all UI. DAMN-1's WorkOS runbook is unaffected: the registered Initiate Login URI (`/login`), the redirect/CORS/sign-out-return allowlists, and the invite-only toggle are all unchanged. Only the *default* behaviour of unauthenticated `/` changes, from immediate bounce to a landing page.

### SPA fallback

Caddy (`infra/Caddyfile`) and the Vite dev server already do `try_files … /index.html`, so deep links to `/recipes` etc. resolve in every environment. No infra change.

## Design tokens & theming

### Token layer (`apps/web/src/styles/tokens.css`)

- **Structural tokens on `:root`** (palette-neutral): `--font-sans` (`'Rubik', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif`), the type scale per the locked table above (`--text-xs` = 12px is the floor), weights (`--weight-regular 400 / -medium 500 / -semibold 600 / -bold 700`), line-heights, spacing (`--space-1 … --space-8`, 8pt), radii (`--radius-sm/md/lg/full`), elevation (`--shadow-1/2`), motion (`--dur-*`, easing).
- **Color tokens scoped by palette + mode**: `:root[data-palette="terracotta"] { … light values … }` and `:root[data-palette="terracotta"][data-theme="dark"] { … dark overrides … }`, ×3 palettes. **The selector is `:root[data-palette=…]` — the FOUC script writes the attributes on `<html>` (`document.documentElement`).** The mockup (`app-shell.html`) scopes to `.app[data-palette=…]` only because it's a framed component inside a review page; do **not** copy that selector — attributes on `<html>` would match nothing and styling would silently break while an `html[data-theme]` e2e assertion still passed (review finding #6). Semantic names only — `--color-bg-primary`, `--color-text-primary/secondary/tertiary`, `--color-border`/`-strong`, `--color-brand` (fixed per palette across modes), `--color-accent`/`-hover`/`-muted`, `--color-text-on-accent`, `--color-focus`, `--color-danger`. Concrete hex values + WCAG-AA contrast results are in `mockups/palette-typography.html` (all pairs pass AA; `--color-brand` is checked at the 3:1 large-text/graphic threshold since it's the wordmark).
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
   `index.html` is promoted across environments unchanged (ADR-0010) — safe here: this script reads only `localStorage`, no env-specific or build-time content. The palette allow-list is duplicated (also in `appearance/types.ts`) — accepted, the pre-module script can't import; keep both in sync (a comment cross-references). **CSP note:** this inline script forecloses a nonce-free strict CSP when Cloudflare ingress lands (ADR-0004 / DAMN-30). It's static — commit to shipping its `sha256-…` hash in the eventual `script-src` and leave a `<!-- CSP: hash this -->` marker.
2. **`AppearanceProvider`** (React context) takes over after mount: holds `{ mode: 'light' | 'dark' | null, palette }`, writes both `data-*` attributes on `document.documentElement` via effect, persists to `localStorage` on change, exposes `useAppearance()` → `{ mode, palette, effectiveMode, setMode, setPalette }`. `mode: null` = follow system (default until the user first flips the switch); the switch shows `effectiveMode`. **DAMN-14 seam:** the provider takes optional props `remoteValue?: AppearancePref` and `onLocalChange?: (pref) => void` — unused in DAMN-32, the injection point for DAMN-14's server reconciliation so it doesn't have to rewrite the provider.
   - **Known one-way door (accepted for V1):** once the user touches the switch, `mode` is `'light' | 'dark'` and there's no UI to return to `'follow system'`. Fine for V1; DAMN-14 can add a "System" option to the control if wanted, and its sync semantics should preserve `null` as a real state.
3. **`resolve.ts`** — pure helpers (`readStored()`, `writeStored()`, `resolveEffectiveMode(stored, systemPrefersDark)`, `mergePref(local, remote)`), unit-tested independently of React/DOM.
4. **Stored shape** (`dtg.appearance` in `localStorage`): `{ mode: 'light' | 'dark' | null, palette: Palette, updatedAt: number }`. `updatedAt` (epoch ms, written on every change) is included **now** — DAMN-14's "server value reconciles against the local copy on login" needs a merge signal, and a client that wrote entries without it can't be migrated later (review finding #7). `readStored()` tolerates a missing `updatedAt` (treats as `0`).

### Motion

Menu/popover open uses a ≤150ms scale+fade (`--dur-quick` ceiling per ADR-0012's testing doc references design-tokens guidance: input-gating ≤300ms). `@media (prefers-reduced-motion: reduce)` collapses it. No looping/ambient motion anywhere in the shell.

## Component inventory (`apps/web/src/`)

| File | Role |
|---|---|
| `main.tsx` | Keep DAMN-1's `GET /api/config` bootstrap, then mount `<RouterProvider>` (from `react-router/dom`) inside `AuthKitProvider` + `AppearanceProvider`. `onRedirectCallback` on `AuthKitProvider` calls `router.navigate`. |
| `router.tsx` | Exports `routes` (the config array) **and** `router = createBrowserRouter(routes)` separately — tests import `routes` for `createMemoryRouter`. |
| `auth/AuthGate.tsx` | Layout route — auth gate logic from `App.tsx`: bypass cookie first → `<Outlet/>`; then `isLoading` → loader; `!user` on `/` → `<Splash>`; `!user` elsewhere → `signIn()`; else `<Outlet/>`. |
| `auth/bypass.ts` | `hasE2eBypassCookie()` (moved from `e2eBypass.ts`, or re-exported) + `<BypassRedirect/>`. Used by `AuthGate`, `LoginRedirect`, `AuthCallback`. |
| `routes/AuthCallback.tsx` | `/callback`: bypass → redirect to `/`; else an inert full-screen spinner that never navigates (see Routing). |
| `routes/Splash.tsx` | Unauthenticated landing — centered wordmark, "Log in" (→ `signIn()`). |
| `auth/LoginRedirect.tsx` | `/login`: bypass → redirect to `/`; else `signIn()` on mount (DAMN-1's `SignInRedirect`, unchanged). |
| `shell/AppShell.tsx` | Grid frame: `<TopBar>` + `<NavRail>` + `<Outlet/>`. Holds a `hasNavigatedRef` (set true the first time `useLocation().pathname` becomes `!== '/'`); search placement is **derived**, not a pure latch: `pathname !== '/' || hasNavigatedRef.current` → top-bar, else hero (review finding #4 — a pure event latch leaves *no* search control on a deep-link/reload to `/recipes`). |
| `shell/PopoverGroup.tsx` + `usePopoverGroup()` | A context/registry so "one popover open at a time" actually works — three independent `usePopover()` instances can't coordinate. The group tracks the open id; opening one closes the others. Each menu still owns its own outside-click / `Escape` / focus-return. |
| `shell/TopBar.tsx` | Search slot (placement-aware) + gear + avatar. |
| `shell/NavRail.tsx` | Create button + menu (Recipe / Shopping list — inert), nav items (Recipes, Shopping Lists, divider, Data), active-route highlight via `NavLink`. |
| `shell/SearchControl.tsx` | Inert search input; `variant="hero" | "bar"`. |
| `appearance/SettingsMenu.tsx` | Gear popover — Light/Dark switch + palette `<select>`. |
| `shell/AvatarMenu.tsx` | Profile (→ `/profile`) / Sign out (→ `signOut()`). Identity line from `GET /api/me`: default avatar renders immediately and always; the email/name line shows a skeleton while pending and **stays silent on error** (no error UI in a menu — the avatar + Profile/Sign out still work). |
| `routes/Home.tsx` | Authed home — renders the hero search only when `AppShell` says placement is `hero`; otherwise minimal. |
| `routes/RecipesPage.tsx` `ShoppingListsPage.tsx` `DataPage.tsx` `ProfilePage.tsx` | Placeholder pages per the mockup. |
| `appearance/{types,resolve,AppearanceProvider}.ts(x)` | Theming (above). |
| `components/DefaultAvatar.tsx` | Inline SVG person mark, `currentColor`. Static, until DAMN-24. |
| `components/icons.tsx` | Inlined SVG set (gear, search, book, cart, database, arrow, sign-out, user). |
| `styles/tokens.css` `styles/base.css` | Global stylesheets (reset, `@font-face` via `@fontsource`, tokens). |

**Moved/deleted:** `Landing.tsx`, `Landing.component.test.tsx` deleted (absorbed into `Home` + shell). `App.tsx` → `auth/AuthGate.tsx` + `auth/LoginRedirect.tsx`. `e2eBypass.ts` → `auth/bypass.ts` (same `hasE2eBypassCookie`, plus `<BypassRedirect/>`). `apiClient.ts` unchanged. `App.component.test.tsx`'s five cases migrate into `auth/AuthGate.component.test.tsx` using `createMemoryRouter(routes, …)`.

## Data model

**None.** No schema, no migration.

## API surface

**None new.** `GET /api/me` (DAMN-1) still backs the avatar menu / profile placeholder identity line. `GET /api/config` bootstrap unchanged. No sign-out endpoint (client + WorkOS only, per DAMN-1).

## Config / env changes

**None.** No new env vars. `index.html` gains the inline FOUC script (no env content). `docker-compose.yml` / `deploy/compose.yaml` untouched. `apps/web/vitest.setup.ts` gains a `matchMedia` mock (test infra, not runtime).

## Known limitations — accepted for V1

- **Deep-link to a protected route while logged out loses the intended destination** — after auth the user lands on `/`, not the link they clicked. Acceptable for V1 (invite-only, single user); revisit if it bites. Would need stashing the target and honouring it in `onRedirectCallback`.
- **`mode: 'follow system'` is a one-way door** once the switch is touched (no UI back to `null`). See the AppearanceProvider note; DAMN-14 can add a "System" option.
- **The inline FOUC script blocks a nonce-free strict CSP** — hash it when DAMN-30 adds CSP.

## Test plan (ADR-0012 tiers)

**Test setup:** `apps/web/vitest.setup.ts` currently only imports jest-dom. Add a `window.matchMedia` mock (jsdom has none) — `AppearanceProvider` and `resolve.ts` call it, tests throw without it (review nit).

### Unit (`*.test.ts`, node)
- `appearance/resolve.ts`: `readStored()` with absent / malformed / partial JSON / missing `updatedAt` (→ `0`) / valid; `resolveEffectiveMode()` truth table (`mode` set vs `null` × `prefers-color-scheme`); `writeStored()` round-trips and stamps `updatedAt`; `mergePref(local, remote)` picks the newer `updatedAt`; unknown palette → `terracotta`.

### Component-web (`*.component.test.tsx`, jsdom + RTL + MSW)
- **Auth gate** — the five `App.component.test.tsx` cases migrated to `createMemoryRouter(routes, { initialEntries: [...] })`: `isLoading` → loader; `!user` on `/` → Splash (**changed from DAMN-1**: was `signIn()`, now a landing — assert Splash + "Log in", `signIn` not called); `!user` on `/recipes` → `signIn()`; `user` present → shell renders; `initialEntries: ['/login']` → always `signIn()`; bypass cookie → shell renders even while `isLoading` with no user.
- **`/callback`** — `initialEntries: ['/callback?code=x']` renders the spinner, does **not** render Splash, does **not** navigate away on its own (review finding #1). With the bypass cookie → redirects to `/`.
- **Routing:** clicking each nav item renders the matching placeholder page and updates the URL; `ShoppingListsPage` shows "Coming soon"; `DataPage` shows the disabled export control; unknown path → redirect to `/`.
- **Shell persistence:** navigating Recipes → Data → Profile keeps one `AppShell` mounted (the nav rail node identity is stable / a `useEffect` mount-counter on `AppShell` fires once).
- **Search placement (review finding #4):** hero on `/` with no prior navigation; top-bar after navigating away and back to `/`; **top-bar on a direct mount at `/recipes`** (deep-link); **still correct after a simulated reload** (fresh mount) at `/recipes`. There must always be exactly one search control.
- **Avatar menu:** opens on click; "Profile" navigates to `/profile`; "Sign out" calls the injected `signOut`; identity line shows a skeleton while `GET /api/me` is pending and renders nothing (no error UI) on a 500.
- **Settings menu:** opens on gear click; toggling dark / changing palette does **not** close it; outside click closes it; `Escape` closes it. Opening the avatar menu closes the settings popover and vice-versa (the `PopoverGroup` registry). Toggling dark sets `document.documentElement.dataset.theme`; palette sets `dataset.palette`; both write `localStorage['dtg.appearance']` (with `updatedAt`).
- **Appearance provider:** mounts from a seeded `localStorage` value and applies both attributes to `<html>`; `prefers-color-scheme` drives the default when `mode` is `null` (mocked `matchMedia`); `remoteValue` prop, when newer, wins over the local copy.

### Workflow (Playwright, `e2e/tests/`)
Extend the smoke spec (or add `shell.spec.ts`), reusing `loginAsTestUser`:
- Existing `GET /api/health` check stays.
- After bypass login, the shell renders (nav rail + top bar visible).
- Click "Recipes" → URL is `/recipes`, the Recipes placeholder heading is visible.
- Open settings → toggle Dark → `<html data-theme="dark">` **and** a visible computed-style assertion (e.g. body background matches the dark token — guards against the `.app` vs `:root` selector trap, review finding #6) → **reload** → still dark. Switch palette → `data-palette` updates.
- Avatar menu opens and shows the "Sign out" button. **Sign-out is not exercised end-to-end here** (review finding #5): under the bypass cookie `signOut()` doesn't clear `e2e_bypass`, so `AuthGate` bounces straight back to the shell — a real assertion would fail deterministically, and it would fire a live `api.workos.com/logout` call the bypass design avoids. Sign-out → Splash is covered in the component tier instead (mock `signOut`, assert Splash renders for `!user` + no cookie).

`pnpm verify` (all tiers + `pnpm e2e`) is the gate; CI `verify` is the backstop; `e2e-staging` runs the workflow tier against staging and gates the prod promote.

## Accessibility

- Menus: `aria-haspopup`, `aria-expanded`, `Escape` to close, focus returns to the trigger on close, focus-visible ring uses `--color-focus`.
- The Light/Dark control is a real `role="switch"` with `aria-checked`; the flanking labels are `<label>`/clickable and associated.
- Nav uses `<nav>` + `NavLink` with `aria-current="page"`.
- All AA contrast pairs verified in the palette mockup, both modes, all three palettes.
- `prefers-reduced-motion` honoured for the popover animation.
- Hit targets ≥44px (buttons, nav items, switch).

## Adversarial design review (2026-09-10) — resolved

A fresh-context review against the frozen scope, the mockups, this doc, DAMN-1's design, and the ADRs. Twelve findings; all folded into this doc, none changed scope. Discussed with the owner, who approved the revisions wholesale.

**Blocking (design bugs, now fixed above):**
1. `/callback` would race AuthKit's code exchange under a data router → explicit inert `/callback` route + `onRedirectCallback` → `router.navigate` (see Routing).
2. `AppShell` must be a nested *layout* route, not a per-route wrapper, or it remounts every navigation (flicker, lost scroll, `hasNavigated` reset) → route structure made explicit.
3. The E2E bypass short-circuit must cover `/login` and `/callback`, now outside `AuthGate` → shared `auth/bypass.ts` guard on all three entry points; server env var stays sole authority.
4. The `hasNavigated` pure-latch leaves *no* search control on a deep-link/reload to a sub-route → placement derived from `pathname !== '/' || hasNavigatedRef` + explicit tests.
5. The e2e sign-out→Splash assertion fails deterministically under the bypass cookie (and fires a live WorkOS logout) → moved to the component tier; e2e only checks the button exists.

**Should-fix (addressed above):**
6. Token selector must be `:root[data-palette=…]` (attributes land on `<html>`), not the mockup's `.app[data-palette=…]` → called out in Design tokens + an e2e computed-style guard.
7. Stored appearance shape gains `updatedAt` now (can't migrate later) + `AppearanceProvider` gains `remoteValue`/`onLocalChange` injection points for DAMN-14.
8. Unspecified states pinned down: `GET /api/me` pending (skeleton) / error (silent) in the avatar menu; "one popover at a time" via a `PopoverGroup` registry, not three isolated hooks.
9. Frozen issue said "Nunito throughout" — the ux-pass switched to Rubik with owner sign-off; issue text updated to match.

**Minor (noted, mostly deferred):** inline-script CSP hash (DAMN-30); `matchMedia` mock in `vitest.setup.ts` (added to test plan); `mode: null` one-way door (accepted); deep-link destination lost post-auth (accepted); `react-router` `^8` (current stable; owner-checked 2026-09-10) not an exact pin; `*` route sits outside `AuthGate` (a logged-out unknown path → Splash).
