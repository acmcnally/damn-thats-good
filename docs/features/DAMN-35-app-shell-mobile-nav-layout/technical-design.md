# Feature: App shell — mobile nav layout

**Tracker:** DAMN-35 · **Depends on:** DAMN-32 (shipped — the app shell this replaces the mobile treatment of). **Blocks:** nothing; the desktop shell is unaffected.

## Summary

Below the existing 640px breakpoint, `NavRail` currently collapses into a full-width block stacked between the top bar and the main content (`AppShell.module.css`'s `grid-template-areas: 'topbar' 'nav' 'main'`) — a deliberate DAMN-32 scope cut, not a bug. This issue replaces that with a real mobile nav pattern: a **fixed bottom tab bar** (Recipes / Shopping Lists / Data) with **Create as a floating action button (FAB)** that overlaps the bar's top-right corner.

No API, schema, or route changes. This is `apps/web`-only, scoped to `NavRail` and `AppShell`'s mobile breakpoint. Desktop (≥640px) is untouched.

## UX / UI

Direction settled via the `ux-ui-design` skill — two directions explored (bottom tab bar vs. a floating menu-drawer), tab bar chosen. See `mockups/mobile-nav.html` (both directions, kept for documentation) and `mockups/mobile-nav-tab-bar-theme-check.html` (the chosen direction, verified in both Terracotta light and dark).

**Settled spec:**
- Tab bar: fixed to the viewport bottom, full width, 62px tall, `--color-bg-secondary` background, `1px solid --color-border` top edge. Three tabs — Recipes (`BookIcon`), Shopping Lists (`CartIcon`), Data (`DatabaseIcon`) — icon above an 11px label, equal-width flex columns. Active tab colored `--color-accent` (same `NavLink`-driven active state the desktop rail already uses).
- Create FAB: 56px circle, `--color-accent` fill, `--color-text-on-accent` icon, no border, no box-shadow. Positioned `right: var(--space-4)`, `bottom: 53px` — overlaps the tab bar's top edge by ~9px. **Correction (adversarial review):** the FAB's full horizontal footprint sits inside the Data tab's column (375px viewport ÷ 3 equal columns puts Data at x=250–375px; the FAB at `right:16px`/56px wide spans x=303–359px) — it does **not** horizontally clear Data as originally claimed here. The overlap is real but small: ~9px at the top edge of Data's 62px-tall hit box, so most taps (center-mass) are unaffected. Confirm in a real rendered build (not just the static mockup, which has no click handlers on this state) that Data's actually-reachable tap target isn't meaningfully degraded; revisit the FAB's horizontal offset if it is. Opens the same Create popover (Recipe / Shopping list) as the desktop rail, via the existing `usePopover('create')` / `PopoverGroup` machinery — just re-anchored (see Component changes).
- No shadow/border on the FAB: the solid accent fill contrasts cleanly against both the content background and the tab bar background in both themes without one (confirmed in both light and dark during mockup review).
- Menu-drawer direction (screenshots in `mockups/mobile-nav.html`) was explored and **rejected** — the two named mobile use cases (quick lookup while cooking; grabbing a recipe/list at the store) both favor zero-tap, always-visible nav over a pattern that requires opening a drawer first.

## Open decisions from phase 1 — resolved

None were left open at scope lock-in beyond the pattern itself (bottom tab bar vs. drawer), which is what phase 3 (UX) resolved above. Scope was confirmed narrow — nav rail only; top-bar search/popovers and the Home hero are unaffected, per their existing flexbox-based layouts already degrading acceptably at mobile widths (verified by inspection at scope lock-in, no dedicated mobile CSS needed there).

## Component changes (`apps/web/src/shell/`)

**Architecture change from the original draft (adversarial review, findings #1–#3):** the original plan — both the desktop rail markup and the mobile tab-bar/FAB markup always mounted, a CSS media query just hiding one — has two compounding problems: (a) `usePopover`'s single `triggerRef` can't correctly serve two simultaneously-mounted trigger buttons (whichever renders later silently wins the ref; the other becomes unclosable-by-reclick and mis-returns focus on Escape — not mobile-specific, could just as easily hit desktop depending on render order), and (b) jsdom doesn't evaluate media queries, so `AppShell.component.test.tsx`'s singular `getByRole('navigation', {name: /primary/i})` / `getByRole('link', {name: /recipes/i})` queries would find two matches and throw — and for the same reason a screen reader in production would see two "Primary" landmarks and duplicate, independently-focusable controls.

**Fix:** a small `useMediaQuery('(max-width: 640px)')` hook (`apps/web/src/shell/useMediaQuery.ts`, backed by `window.matchMedia` — already mocked in `vitest.setup.ts` since DAMN-32) drives which markup block *actually mounts* — not which one is CSS-hidden. Only one `<nav aria-label="Primary">`, one set of route links, and one Create trigger button exist in the tree at a time. This resolves the `usePopover` ref conflict for free (only one trigger button ever mounts, so `usePopover('create')` only ever has one to attach to), and lets component tests genuinely exercise both branches by driving the `matchMedia` mock, rather than relying on CSS the test environment can't see.

To avoid duplicating the route/active-state data between the two render paths, the three `{ to, icon, label }` entries (Recipes/Shopping Lists/Data) are extracted into one shared const both paths map over — sharing the *data*, not the JSX; the desktop and mobile markup shapes are different enough (vertical list w/ divider vs. horizontal tab row) that a single shared JSX block isn't a good fit.

| File | Change |
|---|---|
| `useMediaQuery.ts` (new) | `useMediaQuery(query: string): boolean` — subscribes to a `matchMedia` `MediaQueryList`'s `change` event, returns current match state. Small, generic, no `NavRail`-specific logic — reusable if a future feature needs another breakpoint check. |
| `NavRail.tsx` | `const isMobile = useMediaQuery('(max-width: 640px)')` selects which block renders: the existing desktop rail (unchanged markup/behavior) or the new tab-bar + FAB block. Both call `usePopover('create')` from the same call site (whichever branch is active), so there's exactly one trigger ref at a time. `Data`'s divider (visual grouping from Shopping Lists) is dropped in the mobile block — three equal-weight tabs read fine without it; the divider was a rail-specific affordance for a vertical list. |
| `NavRail.module.css` | Add `.tabbar`, `.tab`, `.tab.active`, `.fab`, `.fabWrap`, `.fabCreateMenu` rules per the settled spec. Since rendering is now JS-conditional (not CSS-visibility-based), these don't need to be wrapped in a `@media` block themselves — only one set is ever in the DOM — but keep `640px` as a named/shared constant with `AppShell.module.css`'s breakpoint (both currently hardcode `640px` independently; worth a shared source, e.g. a CSS custom property or a constant re-exported from `useMediaQuery.ts`'s call site) so the two can't silently drift apart. |
| `AppShell.module.css` | Mobile grid currently reserves a `nav` row (`grid-template-rows: var(--topbar-height) auto 1fr; grid-template-areas: 'topbar' 'nav' 'main'`). Since the mobile nav becomes `position: fixed` (not a grid participant), drop the `nav` row on mobile: `grid-template-rows: var(--topbar-height) 1fr; grid-template-areas: 'topbar' 'main'`. `.main` needs bottom padding on mobile large enough to clear the fixed FAB, whose top edge sits `53px + 56px = 109px` above the viewport bottom — **correction:** the original draft's `--space-8` (64px) guess is too small; pad to something like `--space-8` plus the FAB's height/offset (~120–125px total), computed against the FAB's actual extent rather than an arbitrary token, so scrolled-to-bottom content is never tucked under it. |
| `PopoverGroup.tsx` / `usePopover` | No change to the hook's implementation — only enabled by the JS-conditional rendering above (exactly one trigger button mounted at a time). **Positioning fix (finding #3):** the original draft contradicted itself (said `.createMenu` is hidden below 640px, but also needs a repositioned mobile variant). Resolution: the mobile block gets its own `.fabWrap` (`position: relative`, sized/positioned to match the FAB, mirroring `.createWrap`'s role for the desktop button) wrapping both the FAB and its popover; the popover stays `position: absolute` (not `fixed` — `fixed` would make the `calc()` resolve against the viewport instead of the FAB, breaking the positioning math) with `bottom: calc(100% + var(--space-2)); right: 0;` inside that wrapper, opening upward. Same `hidden={!isOpen}` element, same `role="group"` / `aria-label="Create"` content as desktop — only the wrapper and direction differ. **Visually confirmed** in `mockups/mobile-nav-tab-bar-theme-check.html` (Create-open state, both themes) — 248px width fits the 375px frame with margin to spare; it overlaps the last visible content card when open, same as the desktop menu already overlays content below it. Not yet confirmed on a short viewport (e.g. iPhone SE height) — confirm during implementation/review. |

**Icons:** no new icons needed — `BookIcon`, `CartIcon`, `DatabaseIcon`, `PlusIcon` (`components/icons.tsx`) are reused as-is, matching the mockups.

**Safe-area inset:** the tab bar needs `padding-bottom: env(safe-area-inset-bottom, 0)` (present in the mockup, must carry into the real CSS) so it isn't obscured by the home-indicator area on notched iOS devices.

## Data model / API surface

None. No schema, migration, or endpoint changes — this is presentational routing/layout only, reusing routes and icons that already exist.

## Test plan (ADR-0012 tiers)

Because `useMediaQuery` makes the breakpoint JS-evaluated rather than CSS-only, component tests can genuinely drive both branches via the `matchMedia` mock (`vitest.setup.ts`) — not just assert markup exists regardless of viewport, which the original draft's test plan was limited to.

### Component-web (inside `AppShell.component.test.tsx`, where existing `NavRail` coverage already lives — the original draft's reference to a standalone `NavRail.component.test.tsx` was inaccurate; no such file exists today)
- With `matchMedia` mocked to match `(max-width: 640px)`: tab bar renders, with all three routes as links; the active route's tab carries the active state; exactly one `nav[aria-label="Primary"]` landmark exists (guards against the two-landmark regression the adversarial review flagged); Create FAB click toggles the popover (`aria-expanded`), and clicking Recipe/Shopping list closes it without navigating (same inert behavior as desktop, per DAMN-32's non-goals — this issue doesn't wire the create targets either).
- With `matchMedia` mocked to *not* match: desktop rail renders instead — same assertions as today, confirming the mobile block does not also mount.
- Regression: existing desktop-path assertions (rail renders, Create menu behavior, active states) continue to pass, now explicitly run under the "not mobile" branch of the same mock rather than implicitly.

### Component-web (`AppShell.component.test.tsx`)
- Existing tests (search placement, hero-return-on-`/`) continue to pass unmodified — this change touches only the mobile grid rows, not the routing/search-placement logic they cover.

### Workflow (Playwright) — not adding new coverage
No new Playwright coverage planned. With the breakpoint now JS-evaluated and covered at the component tier (both branches, not just markup presence), a dedicated mobile-viewport workflow test would be largely redundant — component tests plus manual verification (real device / browser dev-tools device emulation) cover this adequately, consistent with ADR-0012's tiering (workflow tier reserved for cross-service flows, not single-component layout logic that's now directly testable).

## Accessibility

- `<nav aria-label="Primary">` retained on the mobile tab bar (same label as desktop, screen readers already announce it consistently regardless of which variant renders).
- Touch targets: tabs are full-height (62px) × 1/3 width flex columns — well over the 44px minimum. FAB is 56px — also over the minimum, matching the desktop Create button's existing `min-height: 44px` convention.
- Popover reachability: the re-anchored (upward-opening) Create menu keeps the same `role="group"` / `aria-label="Create"` / focus behavior as desktop — only its CSS position changes.

## Known limitations — accepted for this issue

- The Create popover's items (Recipe / Shopping list) remain inert (no navigation) — same as desktop, per DAMN-32's original non-goals. Wiring them up is DAMN-2 / DAMN-11's job.
- No landscape-orientation-specific treatment — the 640px width breakpoint applies regardless of orientation, matching the existing desktop/mobile split's behavior today.

## Adversarial design review — resolved

Fresh-context subagent review against this doc, the mockups, the live `apps/web/src/shell/` implementation, DAMN-32's technical-design.md, and the DAMN-35 Linear issue text.

**Findings, all incorporated above:**
1. `usePopover`'s single `triggerRef` can't correctly serve two simultaneously-mounted trigger buttons (the original "both markup blocks always mounted, CSS hides one" plan) — fixed by switching to JS-conditional rendering via a new `useMediaQuery` hook, so only one trigger ever mounts.
2. The same CSS-only approach would break `AppShell.component.test.tsx`'s singular `getByRole` queries (jsdom doesn't evaluate media queries) and, in production, would present duplicate landmarks/controls to assistive tech — fixed by the same `useMediaQuery` change; test plan updated to drive both branches via the `matchMedia` mock.
3. The original draft self-contradicted on whether `.createMenu` is hidden or repositioned below 640px, and never defined a positioning anchor for the FAB equivalent to `.createWrap` — fixed with an explicit `.fabWrap` container and a corrected `position: absolute` (not `fixed`) plan so the `calc()` offsets resolve against the FAB, not the viewport.
4. The claim that the FAB "clears" the Data tab horizontally was wrong (its footprint sits fully inside Data's column; only the ~9px vertical overlap is genuinely small) — doc corrected, with a note to confirm real hit-testing in a rendered build rather than only the static mockup.

Non-blocking notes also incorporated: `.main`'s bottom-padding estimate corrected to account for the FAB's actual extent; no data-model/API surface or cross-feature (DAMN-14, DAMN-6) collisions found.

## Pre-PR diff review (`/code-review high`) — 10 findings, all applied

Ran against the full branch diff before opening the PR. All incorporated directly:

1. `.tabbar`'s safe-area padding was inside its fixed height, so a real inset (once `viewport-fit=cover` lands) would have shrunk the tab content instead of extending the bar — fixed to grow the bar's total height instead.
2. The new `stubMatchMedia(true)` test stub blanket-matched every query, silently forcing `AppearanceProvider`'s dark-mode query to match too whenever the mobile breakpoint was stubbed — fixed with a query-scoped shared helper (`apps/web/src/test/matchMedia.ts`), with a regression assertion.
3. `useMediaQuery` called `matchMedia` unguarded, unlike `AppearanceProvider`'s existing try/catch pattern — matched.
4. The FAB's square hit box sat inside the Data tab's column (the ~9px overlap flagged in the design review) — fixed with `clip-path: circle(closest-side)` so the hit-test region matches the visual circle; no visual change.
5. The Create popover could stay open across a live breakpoint flip (resize/rotation) since its single trigger ref would silently reattach to the other markup block — fixed with an effect that closes it on every `isMobile` change.
6. The `640px` breakpoint was hardcoded independently in `NavRail.tsx` and `AppShell.module.css` — consolidated to one JS constant (`shell/breakpoints.ts`), cross-referenced by comment where CSS can't import it.
7. + 9. (duplicate findings, same root cause as #2) `stubMatchMedia` was copy-pasted across three files — resolved by the same shared helper.
8. The FAB's geometry (`NavRail.module.css`) and `.main`'s bottom-padding `calc()` (`AppShell.module.css`) were two independently hand-computed numbers linked only by a comment — consolidated into shared `tokens.css` custom properties (`--fab-size`, `--fab-offset-bottom`).
10. `.createMenu` (desktop) and `.fabCreateMenu` (mobile) duplicated nearly all of their CSS — merged into one shared base class plus two small positional variants.

Verified after fixes: 104/104 tests, typecheck, lint, and formatting clean; re-confirmed live against the running dev server (mobile viewport, both themes) with no visual regression from the CSS changes.

## Post-implementation: mobile dev-server access + an auth robustness fix

While setting up a way to view the dev build on a real phone (a Tailscale-isolated dev box + `tailscale serve`, tracked outside this repo), two small additions landed on this branch rather than as separate PRs (both trivial in size):

- `apps/web/vite.config.ts` / `.env.example`: an optional, machine-specific `DEV_ALLOWED_HOSTS` env var for Vite's `server.allowedHosts`, so the dev server can be reached over a personal Tailscale hostname without committing that hostname anywhere.
- `apps/web/src/routes/AuthCallback.tsx`: real sign-in testing surfaced a CORS misconfiguration in WorkOS, which in turn surfaced a latent bug — `/callback` never had an error path; any failed code exchange (this case, a network blip, or mobile Chrome discarding the PKCE `code_verifier` from `sessionStorage` while backgrounded for an OTP email) hung the "Signing you in…" spinner forever with zero feedback. Fixed to show a retry link once the SDK's `isLoading`/`user` state settles with no session — the only externally-observable signal available, since the SDK exposes no error field.
