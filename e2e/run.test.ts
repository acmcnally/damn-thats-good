import { describe, expect, it } from 'vitest';

import { classifyStack, type ComposePsRow, decideMode, parseComposePs, parseWebPort } from './run';

describe('decideMode', () => {
  it('staging when E2E_BASE_URL is set (even inside GitHub Actions)', () => {
    expect(decideMode({ E2E_BASE_URL: 'https://x', GITHUB_ACTIONS: 'true' })).toBe('staging');
  });

  it('skip inside the GitHub Actions verify job (no base url)', () => {
    expect(decideMode({ GITHUB_ACTIONS: 'true' })).toBe('skip');
  });

  it('local otherwise — including when other tooling exports CI', () => {
    expect(decideMode({ CI: 'true' })).toBe('local');
    expect(decideMode({})).toBe('local');
  });
});

describe('parseComposePs', () => {
  it('parses a JSON array (Compose < 2.21)', () => {
    expect(parseComposePs('[{"Service":"api","State":"running","Health":"healthy"}]')).toEqual([
      { Service: 'api', State: 'running', Health: 'healthy' },
    ]);
  });

  it('parses NDJSON (Compose >= 2.21)', () => {
    const out =
      '{"Service":"api","State":"running","Health":"healthy"}\n' +
      '{"Service":"web","State":"running","Health":"starting"}';
    expect(parseComposePs(out).map((r) => r.Service)).toEqual(['api', 'web']);
  });

  it('empty input → no rows', () => {
    expect(parseComposePs('   ')).toEqual([]);
  });
});

describe('classifyStack', () => {
  const row = (Service: string, State: string, Health: string): ComposePsRow => ({
    Service,
    State,
    Health,
  });

  it('absent when nothing required is running', () => {
    expect(classifyStack([])).toBe('absent');
    expect(classifyStack([row('postgres', 'exited', '')])).toBe('absent');
  });

  it('healthy only when postgres + api + web are all running and healthy', () => {
    expect(
      classifyStack([
        row('postgres', 'running', 'healthy'),
        row('api', 'running', 'healthy'),
        row('web', 'running', 'healthy'),
      ]),
    ).toBe('healthy');
  });

  it('partial when some are up but not all healthy', () => {
    expect(
      classifyStack([
        row('postgres', 'running', 'healthy'),
        row('api', 'running', 'healthy'),
        row('web', 'running', 'starting'),
      ]),
    ).toBe('partial');
    expect(classifyStack([row('postgres', 'running', 'healthy')])).toBe('partial');
  });
});

describe('parseWebPort', () => {
  it('takes the port off the last line', () => {
    expect(parseWebPort('0.0.0.0:8080')).toBe('8080');
    expect(parseWebPort('[::]:32769\n0.0.0.0:32769')).toBe('32769');
  });

  it('falls back to 8080 on unexpected output', () => {
    expect(parseWebPort('')).toBe('8080');
    expect(parseWebPort('garbage')).toBe('8080');
  });
});
