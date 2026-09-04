/**
 * `pnpm e2e` entry point for the workflow (E2E) tier — ADR-0012 / DAMN-29.
 *
 * Three modes, decided from the environment:
 *
 *   staging  — E2E_BASE_URL is set. Run `playwright test` against it, no stack
 *              management. Used by the `e2e-staging` CI job (points at staging)
 *              and by a dev pointing at any running instance.
 *   skip     — GITHUB_ACTIONS=true and no E2E_BASE_URL. This is the CI `verify`
 *              job: the tier runs in `e2e-staging`, not here. Loud banner, exit 0.
 *   local    — otherwise. Stand up the root docker-compose.yml stack (reused if
 *              already healthy), run `playwright test` against it, tear it down
 *              on success.
 *
 * Discriminator is GITHUB_ACTIONS, not CI — some local tools export CI=true and
 * must not silently skip the tier.
 */
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..');

export type Mode = 'staging' | 'skip' | 'local';

export function decideMode(env: NodeJS.ProcessEnv): Mode {
  if (env.E2E_BASE_URL) return 'staging';
  if (env.GITHUB_ACTIONS === 'true') return 'skip';
  return 'local';
}

export interface ComposePsRow {
  Service: string;
  State: string;
  Health: string;
}

/** `docker compose ps --format json` is a JSON array pre-v2.21, NDJSON after. */
export function parseComposePs(stdout: string): ComposePsRow[] {
  const trimmed = stdout.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith('[')) return JSON.parse(trimmed) as ComposePsRow[];
  return trimmed
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as ComposePsRow);
}

export type StackState = 'healthy' | 'absent' | 'partial';

const REQUIRED_SERVICES = ['postgres', 'api', 'web'] as const;

export function classifyStack(rows: ComposePsRow[]): StackState {
  const byService = new Map(rows.map((r) => [r.Service, r]));
  const anyRunning = REQUIRED_SERVICES.some((s) => byService.get(s)?.State === 'running');
  if (!anyRunning) return 'absent';
  const allHealthy = REQUIRED_SERVICES.every((s) => {
    const row = byService.get(s);
    return row?.State === 'running' && row.Health === 'healthy';
  });
  return allHealthy ? 'healthy' : 'partial';
}

/** `docker compose port web 8080` → "0.0.0.0:8080" (last line wins). */
export function parseWebPort(portOutput: string): string {
  const last = portOutput.trim().split('\n').filter(Boolean).pop() ?? '';
  const port = last.split(':').pop();
  return port && /^\d+$/.test(port) ? port : '8080';
}

// --- I/O -------------------------------------------------------------------

function dcRun(args: string[]): void {
  const res = spawnSync('docker', ['compose', ...args], { cwd: REPO_ROOT, stdio: 'inherit' });
  if (res.status !== 0) {
    throw new Error(`docker compose ${args.join(' ')} exited ${String(res.status)}`);
  }
}

function dcCapture(args: string[]): string {
  const res = spawnSync('docker', ['compose', ...args], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    stdio: ['inherit', 'pipe', 'inherit'],
  });
  return res.status === 0 ? (res.stdout ?? '') : '';
}

function playwright(args: string[], baseUrl?: string): number {
  const env = baseUrl ? { ...process.env, E2E_BASE_URL: baseUrl } : process.env;
  const res = spawnSync('pnpm', ['exec', 'playwright', ...args], {
    cwd: HERE,
    stdio: 'inherit',
    env,
  });
  return res.status ?? 1;
}

function banner(lines: string[]): void {
  const bar = '='.repeat(74);
  console.log(`\n${bar}\n${lines.map((l) => `  ${l}`).join('\n')}\n${bar}\n`);
}

// --- main -----------------------------------------------------------------

function main(): number {
  const mode = decideMode(process.env);

  if (mode === 'skip') {
    banner([
      'workflow (e2e) tier: SKIPPED here by design.',
      'It runs in the `e2e-staging` CI job, against the real staging deployment.',
      'Run it locally with `pnpm e2e` (stands up a Docker Compose stack).',
    ]);
    return 0;
  }

  if (mode === 'staging') {
    return playwright(['test']);
  }

  // local
  const state = classifyStack(parseComposePs(dcCapture(['ps', '--format', 'json'])));

  if (state === 'partial') {
    banner([
      'A dtg compose stack is up but not fully healthy.',
      'Inspect it (`docker compose ps`, `docker compose logs`) or `docker compose down`,',
      'then re-run `pnpm e2e`.',
    ]);
    return 1;
  }

  const keep = process.env.E2E_KEEP?.toLowerCase();
  const keepStack = keep !== undefined && keep !== '' && keep !== '0' && keep !== 'false';
  const weStarted = state === 'absent';

  // DAMN-1 E2E auth bypass — only ever set here, for the local stack `dcRun` spawns
  // below (it inherits process.env). Never set for `staging`/`skip` mode, and never on
  // a real deploy (deploy/compose.yaml's own opt-in is separate — set by hand, staging
  // only, per the DAMN-1 runbook).
  process.env.E2E_AUTH_BYPASS = '1';

  try {
    if (weStarted) {
      console.log('[e2e] no stack running — building images (first run is slow) and starting…');
      dcRun(['build']);
      dcRun(['up', '-d', 'postgres', '--wait', '--wait-timeout', '60']);
      dcRun(['run', '--rm', 'migrate']);
      // --no-deps: postgres is up and migrations are applied. Without it, `up`
      // re-pulls the one-shot `migrate` service (api's depends_on, kept for the
      // bare `docker compose up` dev path) and can hit docker/compose#10596.
      dcRun(['up', '-d', '--wait', '--wait-timeout', '180', '--no-deps', 'api', 'web']);
    } else {
      console.log('[e2e] reusing the running stack.');
    }
  } catch (err) {
    if (weStarted) {
      banner([
        'Stack setup failed — containers may be partly up.',
        '`docker compose ps` to check · `docker compose down` to clean up.',
      ]);
    }
    throw err;
  }

  // Cheap safety net — no-op when the browser is already in ~/.cache/ms-playwright.
  playwright(['install', 'chromium']);

  const baseUrl = `http://127.0.0.1:${parseWebPort(dcCapture(['port', 'web', '8080']))}`;
  console.log(`[e2e] running against ${baseUrl}`);
  const code = playwright(['test'], baseUrl);

  if (weStarted && code === 0 && !keepStack) {
    try {
      dcRun(['down']);
    } catch (err) {
      console.warn(
        '[e2e] tests passed but `docker compose down` failed — clean up manually:',
        err instanceof Error ? err.message : err,
      );
    }
  } else if (weStarted) {
    banner([
      code === 0
        ? 'Stack left running (E2E_KEEP set). `docker compose down` when done.'
        : 'Tests failed — stack left running for inspection.',
      'Report: e2e/playwright-report/index.html   ·   `docker compose down` when done.',
    ]);
  }

  return code;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try {
    process.exit(main());
  } catch (err: unknown) {
    console.error('[e2e]', err instanceof Error ? err.message : err);
    process.exit(1);
  }
}
