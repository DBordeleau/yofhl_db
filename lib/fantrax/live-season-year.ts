// The live season rule (GLOSSARY.md, "Live season"): the live season is the latest season year in the Fantrax team
// mapping (league.fantrax_teams, from league.yml's `fantrax` blocks). The live season source, the season sync and the
// award vote's rehearsal all read it from here.
import { sql } from 'drizzle-orm';

/** a SQL subquery giving the live season's year, or null when no season has Fantrax teams */
export const LIVE_SEASON_YEAR = sql`(select max(season_year) from league.fantrax_teams)`;
