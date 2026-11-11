// Outside lib/fantrax/, code imports only the live season module's public files.
const publicFantraxFiles = ['./live-season.ts', './config.ts', './season.ts', './schedule.ts'];
const fantraxBoundary = (except, message) => ['error', { zones: [{ target: '.', from: './lib/fantrax', except, message }] }];
const boundaryMessage = 'Outside lib/fantrax/, import the live season entry point (lib/fantrax/live-season.ts), config, season or schedule';

module.exports = {
  root: true,
  extends: ['next/core-web-vitals', 'next/typescript'],
  rules: {
    'import/no-restricted-paths': fantraxBoundary(publicFantraxFiles, `${boundaryMessage}.`),
  },
  // Later overrides win, so the module's own files come last.
  overrides: [
    {
      // Tests and test harnesses may also run the live season on its in-memory source.
      files: ['**/*.test.ts', '**/testing/**'],
      rules: {
        'import/no-restricted-paths': fantraxBoundary([...publicFantraxFiles, './memory-live-season.ts'],
          `${boundaryMessage}; tests and test harnesses may also import the in-memory live season (lib/fantrax/memory-live-season.ts).`),
      },
    },
    {
      files: ['lib/coachs-corner/production/**', 'db/schema.ts'],
      rules: {
        'import/no-restricted-paths': fantraxBoundary([...publicFantraxFiles, './fantrax-client.ts'],
          `${boundaryMessage}; the Coach's Corner production code and the database schema may also import the Fantrax client.`),
      },
    },
    {
      files: ['lib/fantrax/**'],
      rules: { 'import/no-restricted-paths': 'off' },
    },
  ],
};
