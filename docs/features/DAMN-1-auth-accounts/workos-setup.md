# WorkOS dashboard setup — DAMN-1

Owner-executed checklist against the existing WorkOS account. Not app code; nothing here is committed as config. See `technical-design.md` for how each piece is consumed.

- [ ] **Pre-flight (do this first, before any implementation code exists):** on Staging, enable Magic Auth, toggle "Sign up" OFF, send yourself a test invite, and confirm you can complete OTP sign-in through it end to end. Load-bearing for the whole invite-only approach — cheap to check now, expensive to discover after code is built on the assumption.
- [ ] Confirm **Staging** and **Production** environments both exist under the account.
- [ ] Both environments: enable **email OTP ("Magic Auth")** as the sign-in method.
- [ ] Both environments: toggle **"Sign up" OFF** in Authentication settings (already verified live on Staging in the pre-flight step above; repeat for Production before DAMN-30).
- [ ] Both environments: register the redirect URI —
  - local dev: `http://localhost:5173/callback`
  - staging: `https://<staging-tailnet-hostname>/callback`
  - and the `/login` Sign-in URL (same host, `/login` path).
- [ ] Send an invite (dashboard → Users → Invites) for yourself and any V1 testers.
- [ ] Branding pass — logo, colors, light/dark, corner radius. Cosmetic, no rush.
- [ ] Copy the **Staging** API key + Client ID into local `.env` (git-ignored) and staging's `deploy/.env` on the box (`chmod 600`), and into the password manager per ADR-0010.
- [ ] Production keys: **not needed until DAMN-30** — don't configure the prod `.env` yet.
