import { DB_PACKAGE } from '@dtg/db';
import { greeting } from '@dtg/shared';

// Placeholder entry point. The real NestJS application, `GET /api/health`, and
// the Drizzle/Postgres wiring land with DAMN-26.
console.log(greeting(`api (+ ${DB_PACKAGE})`));
