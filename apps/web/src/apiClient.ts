/**
 * Fetch wrapper for every `/api/*` call. Attaches the current AuthKit access token
 * (`getAccessToken`, passed in by the caller rather than read from `useAuth()` here so
 * this stays a plain testable function) as `Authorization: Bearer <token>` before the
 * request goes out — every route but `/api/config` sits behind `JwtAuthGuard`, which
 * requires it.
 *
 * On a 401 (`invalid_token` or `token_expired` — see technical-design.md's guard
 * error-mapping), navigates to `/login` to re-run the hosted AuthKit flow rather than
 * attempting a silent refresh: the AuthKit SDK already refreshes proactively before
 * expiry via `getAccessToken()`, so a 401 reaching here means that already failed or
 * never had a chance to run. Both 401 variants get the same treatment for V1 — no
 * distinct UX yet, the server-side distinction is kept for future observability/UX
 * rather than dropped.
 */
export async function apiFetch(
  input: string,
  getAccessToken: () => Promise<string>,
  init?: RequestInit,
): Promise<Response> {
  const token = await getAccessToken();
  const headers = new Headers(init?.headers);
  headers.set('Authorization', `Bearer ${token}`);

  const res = await fetch(input, { ...init, headers });
  if (res.status === 401) {
    window.location.assign('/login');
    // Navigation is about to tear this page down — never resolve so callers don't
    // render a flash of "couldn't reach the API" right before the redirect lands.
    return new Promise<Response>(() => {});
  }
  return res;
}
