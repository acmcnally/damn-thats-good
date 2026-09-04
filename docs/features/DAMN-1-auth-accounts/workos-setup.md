# WorkOS dashboard setup — DAMN-1

Owner-executed checklist against the existing WorkOS account. Not app code; nothing here is committed as config. See `technical-design.md` for how each piece is consumed.

- [x] **Pre-flight:** on Staging, enable Magic Auth, toggle "Sign up" OFF, send yourself a test invite, and confirm you can complete OTP sign-in through it end to end. Done 2026-09-04 — worked. (Note: WorkOS's dashboard invite form prompts for an Organization but it's optional — leave it blank; Organizations are a B2B/multi-tenant concept this app has no use for.)
- [x] Confirm **Staging** and **Production** environments both exist under the account.
- [x] Both environments: enable **email OTP ("Magic Auth")** as the sign-in method.
- [x] Both environments: toggle **"Sign up" OFF** in Authentication settings. Done 2026-09-04.
- [ ] **Staging: register BOTH as redirect URIs** (same environment, same list — local dev and deployed staging share Staging's WorkOS keys per ADR-0010; each instance requests whichever matches its own origin at runtime, nothing to choose between manually):
  - `http://localhost:5173/callback`
  - `https://<staging-tailnet-hostname>/callback`
  - Also register the `/login` Sign-in URL for both origins if that field accepts more than one value (check live) — otherwise prioritize the staging URL.
- [ ] Send an invite (dashboard → Users → Invites) for yourself and any V1 testers.
- [ ] Branding pass — logo, colors, light/dark, corner radius. Cosmetic, no rush.
- [ ] Copy the **Staging** API key + Client ID into local `.env` (git-ignored) and staging's `deploy/.env` on the box (`chmod 600`), and into the password manager per ADR-0010.
- [ ] Production keys: **not needed until DAMN-30** — don't configure the prod `.env` yet.
