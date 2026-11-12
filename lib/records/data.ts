import { sql } from 'drizzle-orm';
import { cached, rows } from '../data/db';
import { leagueTags } from '../data/cache-tags';
import { getFranchiseCards } from '../data/league';
import { fantraxLeagueUrl } from '../fantrax/config';
import { fantraxLeagueIdOf, getLiveSeason } from '../fantrax/live-season';
import regularSeason from '../rivalries/regular-season-history.json';
import periods from './periods.json';
import playerCategories from './player-category-history.json';
import playerPortraits from './player-portraits.json';
import type { PlayerStat } from './player-stats';
import { buildChases, buildRecords, matchupFormats, type Award, type PlayerSeason, type TeamSeason, type RecordSource } from './model';

// Keep checked-in history outside the data cache. Combining it with all player
// rows exceeds Next's 2 MB entry limit and silently repeats the database reads.
const getRecordArchive = cached(async () => {
    const [teams, players, seasons, awards, competitions] = await Promise.all([
        getFranchiseCards(),
        rows<PlayerSeason>(sql`select p.id, p.name, ps.season_year as year, ps.fpts::float8 as points, ps.positions
            from league.player_seasons ps join league.players p on p.id = ps.player_id order by ps.season_year`),
        rows<TeamSeason>(sql`select t.franchise_id as team, st.name, t.season_year as year, t.wins, t.losses, t.ties, t.fpts_for::float8 as points, st.logo, st.abbreviation
            from league.team_seasons t join league.season_teams st on st.team_season_id = t.id`),
        rows<Award>(sql`select a.player_id as player, p.name, at.label as award, a.season_year as year, t.franchise_id as team
            from league.awards a join league.players p on p.id = a.player_id join league.award_types at on at.id = a.award_type_id
            left join league.team_seasons t on t.id = a.team_season_id`),
        rows<{ year: number }>(sql`select year from league.seasons where playoff_status = 'complete' order by year`),
    ]);
    return { teams, players, seasons, awards, competitions: competitions.map(c => c.year) };
}, 'records-archive-v1', [leagueTags.records]);

const categories = new Map(playerCategories.players.map(p => [`${p.id}:${p.year}`, p]));
const games = regularSeason.games.map(g => ({ ...g, stage: 'regular' as const }));
export async function getRecordSource(): Promise<RecordSource> {
    const archive = await getRecordArchive();
    return { ...archive, players: archive.players.map(p => ({ ...p, stats: categories.get(`${p.id}:${p.year}`) })), games, periods };
}

export async function getRecordBook(filter: { team?: number; position?: string; format?: string; stat?: PlayerStat } = {}) {
    const [source, result] = await Promise.all([getRecordSource(), getLiveSeason({ now: Date.now() })]);
    const live = result.status === 'available' ? result.value : null;
    const stats = live?.rosterStats.status === 'available' ? live.rosterStats.value : null;
    const formats = matchupFormats(source);
    const requestedFormat = filter.format?.startsWith('2019:') ? 'weekly' : filter.format;
    const format = formats.find(f => f.id === requestedFormat)?.id ?? formats[0]?.id;
    const portraits: Record<string, string> = playerPortraits;
    const records = buildRecords(source, { ...filter, format }).map(record => ({ ...record, entries: record.entries.map(entry => ({
        ...entry, portrait: entry.href.startsWith('/player/') ? portraits[entry.href.slice('/player/'.length)] : undefined,
    })) }));
    return { teams: source.teams, records, chases: buildChases(source, live, stats),
        formats, format, stat: filter.stat, through: Math.max(...source.seasons.map(s => s.year)), liveYear: live?.seasonYear ?? null,
        updated: stats ? [stats.fetchedAt, live!.fetchedAt].sort()[0] : live?.fetchedAt ?? null, playerStatsAvailable: stats !== null, seasonUrl: fantraxLeagueUrl(fantraxLeagueIdOf(result)) };
}
