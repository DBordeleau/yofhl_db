import { defineConfig } from 'drizzle-kit';

// `npm run db:generate` turns changes in db/schema.ts into SQL migrations under db/migrations.
// Everything, including drizzle's migration log, lives in the "league" schema.
export default defineConfig({
    schema: './db/schema.ts',
    out: './db/migrations',
    dialect: 'postgresql',
    schemaFilter: ['league'],
    migrations: { schema: 'league' },
});
