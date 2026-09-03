import { describe, expect, it, vi } from 'vitest';

import type { DatabaseService } from '../database/database.service';
import { HealthService } from './health.service';

function serviceWith(execute: () => Promise<unknown>) {
  const database = { db: { execute } } as unknown as DatabaseService;
  return new HealthService(database);
}

describe('HealthService', () => {
  it('reports ok/up when the DB round-trip succeeds', async () => {
    const execute = vi.fn().mockResolvedValue([{ '?column?': 1 }]);
    await expect(serviceWith(execute).check()).resolves.toEqual({ status: 'ok', db: 'up' });
    expect(execute).toHaveBeenCalledOnce();
  });

  it('reports error/down when the DB round-trip throws', async () => {
    const execute = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    await expect(serviceWith(execute).check()).resolves.toEqual({ status: 'error', db: 'down' });
  });
});
