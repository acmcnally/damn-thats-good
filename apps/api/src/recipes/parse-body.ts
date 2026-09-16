import { BadRequestException } from '@nestjs/common';
import type { z } from 'zod';

/** Direct `.parse()` at the controller boundary (design doc's "Content schema
 * library" note) — Nest's default `ValidationPipe` expects `class-validator`, which
 * this project deliberately doesn't use for the Zod-first shared schemas. */
export function parseBody<T extends z.ZodType>(schema: T, body: unknown): z.infer<T> {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new BadRequestException({ error: 'invalid_request', issues: result.error.issues });
  }
  return result.data;
}
