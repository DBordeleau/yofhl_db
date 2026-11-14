// The season sync (GLOSSARY.md, "Season sync"): the daily write of the live season into the archive. The cron
// route and the admin action call its one operation and hold no rules of their own.
//
// Its interface is one operation:
//  - run (run.ts): sync the live season at a given time, returning what it did
//
// What it reads from Fantrax is its port (ports.ts): production binds it in season-sync.ts, tests use the
// in-memory binding (memory-fantrax.ts). Each part of the season it writes (team-seasons.ts) is read and checked
// in read-season.ts and written in one statement with the run's status row (write.ts, status.ts).
import type { SeasonSyncPorts } from './ports';
import { createRun } from './run';

export type { FantraxLeagueInfo, FantraxStanding, FantraxWeek, SeasonSyncFantrax, SeasonSyncPorts } from './ports';
export type { RunInput, SeasonSyncResult } from './run';
export type { SeasonSyncStatus, SyncCounts } from './status';

export function createSeasonSync(ports: SeasonSyncPorts) {
    return { run: createRun(ports) };
}

export type SeasonSync = ReturnType<typeof createSeasonSync>;
