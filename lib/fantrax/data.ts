// Legacy entry point for callers not yet moved onto the live season module (lib/fantrax/live-season.ts).
// It shares the production adapter's loaders and caches; #61 deletes it with FRANCHISE_IDS.
import { getArchivedPlayerIds, getFranchiseCards } from '@/lib/data/league';
import { automaticFinalPeriods, playerName, publishedMatchups, type LeagueSnapshot, type MatchupScores } from './model';
import { FANTRAX_LEAGUE_ID } from './config';
import { getManualFinalPeriods } from './final-weeks';
import { normalizePeriod } from './fantrax-client';
import { fantraxClient, getCachedLeaders, getCachedRosterStats, getCachedWeekScores, getFantraxLeague, getPlayerDirectory } from './fantrax-source';
import { lastRegularSeasonWeek } from './assemble-live-season';

export { FANTRAX_LEAGUE_ID, FANTRAX_LEAGUE_URL } from './config';
export type { CurrentSeasonData } from './fantrax-client';

// Fantrax team IDs belong to this season; archive franchise IDs persist across seasons and renames.
const FRANCHISE_IDS: Record<string, number> = {
    p4zire2bmutybt24: 5, ewlj8cwqmutybt24: 8, '6pfjiq07mutybt24': 1,
    '4num7i90mutybt24': 2, '1cbgg930mutybt24': 6, ru2wvs6mmutybt24: 7,
    '7jmn4yymmutybt24': 4, a9lp9hbcmutybt24: 3, e3alkww9mutybt24: 9, kr34cpssmutybt24: 13,
};

export async function getLeagueSnapshot(options: { fresh?: boolean } = {}): Promise<LeagueSnapshot> {
    const [source, franchises, archivePlayers, players] = await Promise.all([
        options.fresh ? fantraxClient.league(FANTRAX_LEAGUE_ID) : getFantraxLeague(FANTRAX_LEAGUE_ID), getFranchiseCards(), getArchivedPlayerIds(),
        options.fresh ? fantraxClient.playerDirectory() : getPlayerDirectory(),
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
                id: item.id, name: playerName(players[item.id]?.name ?? item.id),
                position: players[item.id]?.position ?? item.position,
                lineupPosition: item.position,
                nhlTeam: players[item.id]?.team ?? '—', status: item.status,
                archiveId: archiveIds.get(item.id) ?? null,
            })).sort((a,b) => a.name.localeCompare(b.name)),
        };
    }).sort((a,b) => (a.rank ?? Infinity) - (b.rank ?? Infinity) || a.name.localeCompare(b.name));
    const snapshot: LeagueSnapshot = {
        fetchedAt: source.fetchedAt, seasonYear: source.info.seasonYear, teams,
        scoringPeriods: source.info.scoringPeriods.map(normalizePeriod).sort((a,b) => a.number - b.number),
        rosterPeriod: source.info.rosterPeriods.find(p => p.number === source.rosters.period)
            ? normalizePeriod(source.info.rosterPeriods.find(p => p.number === source.rosters.period)!) : null,
        schedule: source.info.matchups.map(round => ({ ...round, matchupList: publishedMatchups(round.matchupList) })),
        finalPeriods: [],
    };
    // The league's regular season, not Fantrax's, decides automatic final weeks.
    const automatic = automaticFinalPeriods({ ...snapshot, lastRegularSeasonPeriod: lastRegularSeasonWeek(snapshot.scoringPeriods) }, Date.now());
    snapshot.finalPeriods = [...new Set([...automatic, ...await getManualFinalPeriods(snapshot.seasonYear)])];
    return snapshot;
}

export async function getMatchupScores(period: number): Promise<MatchupScores | null> {
    const source = await getFantraxLeague(FANTRAX_LEAGUE_ID);
    const raw = source.info.scoringPeriods.find(item => item.number === period);
    if (!raw) throw new RangeError('Unknown scoring period');
    const normalized = normalizePeriod(raw);
    if (Date.now() < Date.parse(normalized.startDate)) return null;
    return getCachedWeekScores(FANTRAX_LEAGUE_ID, normalized, source.fetchedAt);
}

export const getScoringLeaders = (seasonYear: number) => getCachedLeaders(FANTRAX_LEAGUE_ID, seasonYear);
export const getRosterStats = (seasonYear: number) => getCachedRosterStats(FANTRAX_LEAGUE_ID, seasonYear);
