// Outside lib/fantrax/, code imports only the live season module's public files.
const publicFantraxFiles = ['./live-season.ts', './live-season-year.ts', './config.ts', './season.ts', './schedule.ts'];
const fantraxBoundary = (except, message) => ['error', { zones: [{ target: '.', from: './lib/fantrax', except, message }] }];
const boundaryMessage = 'Outside lib/fantrax/, import the live season entry point (lib/fantrax/live-season.ts), the live season rule (live-season-year.ts), config, season or schedule';

module.exports = {
  root: true,
  extends: ['next/core-web-vitals', 'next/typescript'],
  rules: {
    'import/no-restricted-paths': fantraxBoundary(publicFantraxFiles, `${boundaryMessage}.`),
  },
  // Later overrides win, so the module's own files come last.
  overrides: [
    {
      // Tests and test harnesses may also run the live season on its in-memory source, or the production live season
      // over the fake Fantrax.
      files: ['**/*.test.ts', '**/testing/**'],
      rules: {
        'import/no-restricted-paths': fantraxBoundary([...publicFantraxFiles, './memory-live-season.ts', './testing/fake-fantrax.ts'],
          `${boundaryMessage}; tests and test harnesses may also import the in-memory live season (lib/fantrax/memory-live-season.ts) or the fake Fantrax (lib/fantrax/testing/fake-fantrax.ts).`),
      },
    },
    {
      files: ['lib/coachs-corner/production/**', 'db/schema.ts', 'lib/season-sync/season-sync.ts'],
      rules: {
        'import/no-restricted-paths': fantraxBoundary([...publicFantraxFiles, './fantrax-client.ts'],
          `${boundaryMessage}; the Coach's Corner production code, the database schema and the season sync's production binding may also import the Fantrax client.`),
      },
    },
    {
      files: ['lib/award-vote/award-vote.ts'],
      rules: {
        'import/no-restricted-paths': fantraxBoundary([...publicFantraxFiles, './fantrax-client.ts', './ranged-stats.ts'],
          `${boundaryMessage}; the award vote's production binding may also import the Fantrax client and the ranged-stats reader.`),
      },
    },
    {
      // The award vote's ports name the ranged-stats reader's player types; only its production binding runs the reader.
      files: ['lib/award-vote/ports.ts'],
      rules: {
        'import/no-restricted-paths': fantraxBoundary([...publicFantraxFiles, './ranged-stats.ts'],
          `${boundaryMessage}; the award vote's ports may also import the ranged-stats reader's types.`),
        '@typescript-eslint/no-restricted-imports': ['error', {
          patterns: [{ group: ['**/fantrax/ranged-stats'], allowTypeImports: true, message: "The award vote's ports may import only types from the ranged-stats reader." }],
        }],
      },
    },
    {
      files: ['lib/fantrax/**'],
      rules: { 'import/no-restricted-paths': 'off' },
    },
  ],
};
