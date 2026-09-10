# WorkOS dashboard setup — DAMN-1

Owner-executed checklist against the existing WorkOS account. Not app code; nothing here is committed as config. See `technical-design.md` for how each piece is consumed.

- [x] **Pre-flight:** on Staging, enable Magic Auth, toggle "Sign up" OFF, send yourself a test invite, and confirm you can complete OTP sign-in through it end to end. Done 2026-09-04 — worked. (Note: WorkOS's dashboard invite form prompts for an Organization but it's optional — leave it blank; Organizations are a B2B/multi-tenant concept this app has no use for.)
- [x] Confirm **Staging** and **Production** environments both exist under the account.
- [x] Both environments: enable **email OTP ("Magic Auth")** as the sign-in method.
- [x] Both environments: toggle **"Sign up" OFF** in Authentication settings. Done 2026-09-04.
- [x] **Staging: register BOTH as redirect URIs** (Applications → Damn That's Good → Redirects) — `http://localhost:5173/callback` and `https://<staging-tailnet-hostname>/callback`. Done 2026-09-04.
- [x] **Staging: set the Initiate Login URI** to `https://<staging-tailnet-hostname>/login`. Done 2026-09-04.
- [x] **Staging: register BOTH as CORS origins** (Applications → Damn That's Good → Sessions → CORS) — `http://localhost:5173` and `https://<staging-tailnet-hostname>` (bare origins, no `/callback` path, no trailing slash). Separate allowlist from Redirects above — required because `@workos-inc/authkit-react` calls `api.workos.com` directly from the browser (client-only integration), so WorkOS won't send an `Access-Control-Allow-Origin` header for an unlisted origin and the token exchange fails with a CORS error, manifesting as a sign-in redirect loop. Discovered 2026-09-09 debugging a local-dev callback loop. Done 2026-09-09.
- [x] **Staging: register BOTH as the sign-out/logout redirect URI** — `http://localhost:5173` and `https://<staging-tailnet-hostname>`. A fourth, separate allowlist from Redirects/CORS/Providers above (exact dashboard tab not re-noted here — same Applications → Damn That's Good area). Required because AuthKit's `signOut()` defaults to `returnTo: '/'`, which WorkOS validates against this list before completing sign-out; with nothing registered, clicking sign-out landed on WorkOS's generic `error.workos.com` page ("Couldn't sign in... contact your organization admin" — boilerplate text reused across flows, not specific to sign-in). Discovered 2026-09-09 testing sign-out. Done 2026-09-09.
- [ ] Send an invite (dashboard → Users → Invites) for yourself and any V1 testers. *(Not blocking implementation — the pre-flight invite already proved the mechanism works.)*
- [ ] Branding pass — logo, colors, light/dark, corner radius. Cosmetic, no rush.
- [x] Copy the **Staging** API key + Client ID into local `.env` — confirmed present, 2026-09-04.
- [x] Copy the same into staging's `deploy/.env` on the box (`chmod 600`). Confirmed 2026-09-04.
- [x] Both environments: disable every sign-in method except Magic Auth (Google/SSO buttons observed during pre-flight testing, otherwise unused and undesired for V1). Confirmed 2026-09-04. **Incomplete as originally checked off — see below**, discovered 2026-09-09: this only covers Authentication → Methods. Social providers (Google, Apple, etc.) and SSO have their own separate **Providers** tab.
- [ ] **Staging: also disable social providers under the separate Providers tab** (Authentication → Providers — distinct from Methods above) — Google, Apple, and any other social login buttons, plus the SSO toggle there. Discovered 2026-09-09: Methods being set to Magic-Auth-only did not stop these buttons from appearing on the hosted sign-in page.
- [ ] Production keys: **not needed until DAMN-30** — don't configure the prod `.env` yet.

WorkOS dashboard setup complete as of 2026-09-04 — everything needed to start implementation is in place.
