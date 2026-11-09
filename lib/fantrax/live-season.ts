// The live season: the only way into the current season as Fantrax has it now (GLOSSARY.md, "Live season").
// Callers render what it returns; see assemble-live-season.ts for the shapes and rules.
import { createLiveSeason } from './assemble-live-season';
export { fantraxLeagueIdOf } from './assemble-live-season';
import { fantraxSource } from './fantrax-source';

export type { Availability, LiveSeason, LiveSeasonResult, LiveTeam, PlayoffRound, ScoringLeader, Standings, StandingsRow, Week, WeekScores } from './assemble-live-season';

export const { getLiveSeason, getWeekScores, refreshLiveSeason, setWeekFinal } = createLiveSeason(fantraxSource);
