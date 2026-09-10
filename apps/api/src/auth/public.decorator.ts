import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/** Exempts a route from the global `JwtAuthGuard`. Used only by `GET /api/health` and
 * `GET /api/config` (ADR-0010 / technical-design.md) — every other route stays behind
 * auth by default, which is the point of a global guard. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
