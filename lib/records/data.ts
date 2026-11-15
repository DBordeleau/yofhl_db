import { sql } from 'drizzle-orm';
import { cached, rows } from '../data/db';
import { leagueTags } from '../data/cache-tags';
import { getFranchiseCards, getSeasonArchive } from '../data/league';
import { fantraxLeagueUrl } from '../fantrax/config';
import { fantraxLeagueIdOf, getLiveSeason } from '../fantrax/live-season';
import regularSeason from '../rivalries/regular-season-history.json';
import periods from './periods.json';
import playerCategories from './player-category-history.json';
import playerPortraits from './player-portraits.json';
import type { PlayerCategories, PlayerStat } from './player-stats';
import { storedRegularSeasonGames, storedWeeks } from '../data/regular-season-games';
import { buildChases, buildRecords, HISTORY_THROUGH, matchupFormats, type Award, type PlayerSeason, type TeamSeason, type RecordSource } from './model';

// Games, weeks and skater categories for 2026 and earlier are checked in; the season sync stores later seasons'.

// Keep checked-in history outside the data cache. Combining it with all player
// rows exceeds Next's 2 MB entry limit and silently repeats the database reads.
const getRecordArchive = cached(async () => {
    const [teams, players, seasons, awards, storedGames, storedPeriods] = await Promise.all([
        getFranchiseCards(),
        // A stored player season's categories, or none while any total is null.
        rows<PlayerSeason & { stats: PlayerCategories | null }>(sql`select p.id, p.name, ps.season_year as year, ps.fpts::float8 as points, ps.positions,
                case when ps.season_year > ${HISTORY_THROUGH} and num_nulls(ps.goals, ps.assists, ps.shots, ps.hits, ps.blocks) = 0
                    then json_build_object('goals', ps.goals, 'assists', ps.assists, 'shots', ps.shots, 'hits', ps.hits, 'blocks', ps.blocks) end as stats
            from league.player_seasons ps join league.players p on p.id = ps.player_id order by ps.season_year`),
        rows<TeamSeason>(sql`select t.franchise_id as team, st.name, t.season_year as year, t.wins, t.losses, t.ties, t.fpts_for::float8 as points, st.logo, st.abbreviation
            from league.team_seasons t join league.season_teams st on st.team_season_id = t.id`),
        rows<Award>(sql`select a.player_id as player, p.name, at.label as award, a.season_year as year, t.franchise_id as team
            from league.awards a join league.players p on p.id = a.player_id join league.award_types at on at.id = a.award_type_id
            left join league.team_seasons t on t.id = a.team_season_id`),
        storedRegularSeasonGames(),
        storedWeeks(),
    ]);
    return { teams, players, seasons, awards, storedGames, storedPeriods };
}, 'records-archive-v4', [leagueTags.records]);

const categories = new Map(playerCategories.players.map(p => [`${p.id}:${p.year}`, p]));
const historyGames = regularSeason.games.map(g => ({ ...g, stage: 'regular' as const }));
export async function getRecordSource(): Promise<RecordSource> {
    // Only the season archive decides which seasons are published (lib/seasons.ts).
    const [{ storedGames, storedPeriods, ...archive }, seasons] = await Promise.all([getRecordArchive(), getSeasonArchive()]);
    const published = [...seasons.published].reverse(); // oldest first
    return { ...archive, published: published.map(season => season.year),
        competitions: published.filter(season => season.playoffStatus === 'complete').map(season => season.year), players: archive.players.map(p => ({ ...p, stats: p.year > HISTORY_THROUGH ? p.stats ?? undefined : categories.get(`${p.id}:${p.year}`) })),
        games: [...historyGames, ...storedGames], periods: [...periods, ...storedPeriods] };
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
