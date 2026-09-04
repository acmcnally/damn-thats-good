# WorkOS dashboard setup — DAMN-1

Owner-executed checklist against the existing WorkOS account. Not app code; nothing here is committed as config. See `technical-design.md` for how each piece is consumed.

- [x] **Pre-flight:** on Staging, enable Magic Auth, toggle "Sign up" OFF, send yourself a test invite, and confirm you can complete OTP sign-in through it end to end. Done 2026-09-04 — worked. (Note: WorkOS's dashboard invite form prompts for an Organization but it's optional — leave it blank; Organizations are a B2B/multi-tenant concept this app has no use for.)
- [x] Confirm **Staging** and **Production** environments both exist under the account.
- [x] Both environments: enable **email OTP ("Magic Auth")** as the sign-in method.
- [x] Both environments: toggle **"Sign up" OFF** in Authentication settings. Done 2026-09-04.
- [x] **Staging: register BOTH as redirect URIs** — `http://localhost:5173/callback` and `https://<staging-tailnet-hostname>/callback`. Done 2026-09-04.
- [x] **Staging: set the Initiate Login URI** to `https://<staging-tailnet-hostname>/login`. Done 2026-09-04.
- [ ] Send an invite (dashboard → Users → Invites) for yourself and any V1 testers. *(Not blocking implementation — the pre-flight invite already proved the mechanism works.)*
- [ ] Branding pass — logo, colors, light/dark, corner radius. Cosmetic, no rush.
- [x] Copy the **Staging** API key + Client ID into local `.env` — confirmed present, 2026-09-04.
- [x] Copy the same into staging's `deploy/.env` on the box (`chmod 600`). Confirmed 2026-09-04.
- [x] Both environments: disable every sign-in method except Magic Auth (Google/SSO buttons observed during pre-flight testing, otherwise unused and undesired for V1). Confirmed 2026-09-04.
- [ ] Production keys: **not needed until DAMN-30** — don't configure the prod `.env` yet.

WorkOS dashboard setup complete as of 2026-09-04 — everything needed to start implementation is in place.
