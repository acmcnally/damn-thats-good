# WorkOS dashboard setup — DAMN-1

Owner-executed checklist against the existing WorkOS account. Not app code; nothing here is committed as config. See `technical-design.md` for how each piece is consumed.

- [ ] Confirm **Staging** and **Production** environments both exist under the account.
- [ ] Both environments: enable **email OTP ("Magic Auth")** as the sign-in method.
- [ ] Both environments: toggle **"Sign up" OFF** in Authentication settings. Verify this doesn't block the Magic Auth flow itself for an *invited* user before relying on it (send yourself a test invite and confirm you can complete OTP sign-in through it).
- [ ] Both environments: register the redirect URI —
  - local dev: `http://localhost:5173/callback`
  - staging: `https://<staging-tailnet-hostname>/callback`
  - and the `/login` Sign-in URL (same host, `/login` path).
- [ ] Send an invite (dashboard → Users → Invites) for yourself and any V1 testers.
- [ ] Branding pass — logo, colors, light/dark, corner radius. Cosmetic, no rush.
- [ ] Copy the **Staging** API key + Client ID into local `.env` (git-ignored) and staging's `deploy/.env` on the box (`chmod 600`), and into the password manager per ADR-0010.
- [ ] Production keys: **not needed until DAMN-30** — don't configure the prod `.env` yet.
