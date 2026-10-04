import { unstable_cache } from 'next/cache';
import { getArchivedPlayerIds, getFranchiseCards } from '@/lib/data/league';
import { playerName, publishedMatchups, type LeagueSnapshot, type MatchupScores, type Period, type ScheduledMatchup } from './model';

export const FANTRAX_LEAGUE_ID = 'rf5o9cu2mutybszr';
export const FANTRAX_LEAGUE_URL = `https://www.fantrax.com/fantasy/league/${FANTRAX_LEAGUE_ID}/home`;
const DAY = 86400;

// Fantrax team IDs belong to this season; archive franchise IDs persist across seasons and renames.
const FRANCHISE_IDS: Record<string, number> = {
    p4zire2bmutybt24: 5, ewlj8cwqmutybt24: 8, '6pfjiq07mutybt24': 1,
    '4num7i90mutybt24': 2, '1cbgg930mutybt24': 6, ru2wvs6mmutybt24: 7,
    '7jmn4yymmutybt24': 4, a9lp9hbcmutybt24: 3, e3alkww9mutybt24: 9, kr34cpssmutybt24: 13,
};

interface LeagueInfo {
    seasonYear: number;
    teamInfo: Record<string, { name: string; id: string }>;
    scoringPeriods: Period[];
    rosterPeriods: Period[];
    matchups: { period: number; matchupList: ScheduledMatchup[] }[];
    playoffs: { numPlayoffTeams: number; lastRegularSeasonPeriod: number };
}
interface RosterResponse {
    period: number;
    rosters: Record<string, { rosterItems: { id: string; position: string; status: string }[] }>;
}
interface Standing {
    teamId: string;
    rank: number;
    points: string;
    totalPointsFor: number;
}
interface PlayerInfo { name: string; position: string; team?: string }

async function request<T>(endpoint: string, parameters: Record<string, string> = {}): Promise<T> {
    const url = new URL(`https://www.fantrax.com/fxea/general/${endpoint}`);
    url.search = new URLSearchParams(parameters).toString();
    const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(12000) });
    if (!response.ok) throw new Error(`Fantrax ${endpoint} returned ${response.status}`);
    return response.json();
}

const normalizePeriod = (period: Period): Period => ({
    ...period,
    startDate: new Date(period.startDate.replace(/([+-]\d{2})(\d{2})$/, '$1:$2')).toISOString(),
    endDate: new Date(period.endDate.replace(/([+-]\d{2})(\d{2})$/, '$1:$2')).toISOString(),
});

// Cache the data and its actual fetch time together. Refresh on the next visit after 24 hours;
// no cron, client polling, persistent worker, or database writes are needed.
async function loadFantrax() {
    const [info, rosters, standings, players] = await Promise.all([
        request<LeagueInfo>('getLeagueInfo', { leagueId: FANTRAX_LEAGUE_ID, excludePlayerInfo: 'true' }),
        request<RosterResponse>('getTeamRosters', { leagueId: FANTRAX_LEAGUE_ID }),
        request<Standing[]>('getStandings', { leagueId: FANTRAX_LEAGUE_ID }),
        request<Record<string, PlayerInfo>>('getPlayerIds', { sport: 'NHL' }),
    ]);
    if (!info.teamInfo || !info.scoringPeriods?.length || !rosters.rosters || !Array.isArray(standings)) {
        throw new Error('Fantrax returned an incomplete league snapshot');
    }
    // Only rostered players leave this cache. The full NHL directory is about a megabyte.
    const rosteredPlayers = Object.fromEntries(Object.values(rosters.rosters).flatMap(roster =>
        roster.rosterItems.map(item => [item.id, players[item.id] ?? null])));
    return { info, rosters, standings, players: rosteredPlayers, fetchedAt: new Date().toISOString() };
}
const getDailyFantrax = unstable_cache(loadFantrax, ['fantrax-daily', FANTRAX_LEAGUE_ID], { revalidate: DAY });

export async function getLeagueSnapshot(options: { fresh?: boolean } = {}): Promise<LeagueSnapshot> {
    const [source, franchises, archivePlayers] = await Promise.all([
        options.fresh ? loadFantrax() : getDailyFantrax(), getFranchiseCards(), getArchivedPlayerIds(),
    ]);
    const archiveIds = new Map(archivePlayers.map(player => [player.id.replace(/\*/g, ''), player.id]));
    const teams = Object.entries(source.info.teamInfo).map(([id, team]) => {
        const franchise = franchises.find(item => item.ID === FRANCHISE_IDS[id]);
        const standing = source.standings.find(item => item.teamId === id);
        return {
            id, franchiseId: franchise?.ID ?? null,
            name: franchise?.Team ?? team.name,
            abbreviation: franchise?.Abbreviation ?? team.name.split(' ').map(word => word[0]).join('').slice(0,5),
            logo: franchise?.LogoUrl ?? null, owner: franchise?.Owner ?? null,
            rank: standing?.rank ?? null, record: standing?.points ?? null, points: standing?.totalPointsFor ?? null,
            players: (source.rosters.rosters[id]?.rosterItems ?? []).map(item => ({
                id: item.id, name: playerName(source.players[item.id]?.name ?? item.id),
                position: source.players[item.id]?.position ?? item.position,
                lineupPosition: item.position,
                nhlTeam: source.players[item.id]?.team ?? '—', status: item.status,
                archiveId: archiveIds.get(item.id) ?? null,
            })).sort((a,b) => a.name.localeCompare(b.name)),
        };
    }).sort((a,b) => (a.rank ?? Infinity) - (b.rank ?? Infinity) || a.name.localeCompare(b.name));
    return {
        fetchedAt: source.fetchedAt, seasonYear: source.info.seasonYear, teams,
        scoringPeriods: source.info.scoringPeriods.map(normalizePeriod).sort((a,b) => a.number - b.number),
        rosterPeriod: source.info.rosterPeriods.find(p => p.number === source.rosters.period)
            ? normalizePeriod(source.info.rosterPeriods.find(p => p.number === source.rosters.period)!) : null,
        schedule: source.info.matchups.map(round => ({ ...round, matchupList: publishedMatchups(round.matchupList) })),
        playoffTeams: source.info.playoffs.numPlayoffTeams,
        lastRegularSeasonPeriod: source.info.playoffs.lastRegularSeasonPeriod,
    };
}

export const getMatchupScores = unstable_cache(async (period: number): Promise<MatchupScores> => {
    const scores = await request<Omit<MatchupScores, 'fetchedAt'>>('getMatchupScores', {
        leagueId: FANTRAX_LEAGUE_ID, period: String(period),
    });
    if (!Array.isArray(scores.matchups) || scores.period !== period) throw new Error('Fantrax returned invalid matchup scores');
    return { ...scores, fetchedAt: new Date().toISOString() };
}, ['fantrax-matchup-scores', FANTRAX_LEAGUE_ID], { revalidate: DAY });
