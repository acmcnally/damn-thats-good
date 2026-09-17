import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { apiFetch, ApiTimeoutError } from './apiClient';

const originalFetch = globalThis.fetch;

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  globalThis.fetch = originalFetch;
});

describe('apiFetch', () => {
  it('attaches the bearer token and returns the response on the happy path', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    globalThis.fetch = fetchMock;

    const promise = apiFetch('/api/recipes', () => Promise.resolve('a-token'));
    await vi.runAllTimersAsync();
    const res = await promise;

    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/recipes',
      expect.objectContaining({ headers: expect.any(Headers) }),
    );
    const headers = fetchMock.mock.calls[0]![1].headers as Headers;
    expect(headers.get('Authorization')).toBe('Bearer a-token');
  });

  it('times out instead of hanging forever when getAccessToken never settles', async () => {
    // Simulates a stuck AuthKit silent token refresh (e.g. after the tab regains
    // focus) — the exact scenario this timeout exists to bound.
    const getAccessToken = () => new Promise<string>(() => {});

    const promise = apiFetch('/api/recipes', getAccessToken);
    const assertion = expect(promise).rejects.toBeInstanceOf(ApiTimeoutError);
    await vi.runAllTimersAsync();
    await assertion;
  });

  it('times out instead of hanging forever when the request itself never settles', async () => {
    globalThis.fetch = vi.fn().mockImplementation(() => new Promise(() => {}));

    const promise = apiFetch('/api/recipes', () => Promise.resolve('a-token'));
    const assertion = expect(promise).rejects.toBeInstanceOf(ApiTimeoutError);
    await vi.runAllTimersAsync();
    await assertion;
  });

  it('does not fire the timeout once the request has already settled', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));

    const res = await apiFetch('/api/recipes', () => Promise.resolve('a-token'));
    expect(res.status).toBe(200);

    // No pending timers left dangling once everything already settled.
    expect(vi.getTimerCount()).toBe(0);
  });
});
