import { unstable_cache } from 'next/cache';
import { sql } from 'drizzle-orm';
import { cached, rows } from '@/lib/data/db';
import { KEEPER_SEASON, type KeeperPlayer } from './model';
import { matchNhlPlayer, playerAge, profileDetails, type NhlProfile, type NhlSearchPlayer, type PlayerDetails } from './player-details';

async function request<T>(url: string): Promise<T> {
    const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(6000) });
    if (!response.ok) throw new Error('NHL player data unavailable');
    return response.json();
}
const identifyPlayer = unstable_cache(async (name: string, position: string, team: string) => {
    const url = new URL('https://search.d3.nhle.com/api/v1/search/player');
    url.search = new URLSearchParams({ culture: 'en-us', limit: '100', q: name }).toString();
    const candidates = await request<NhlSearchPlayer[]>(url.toString());
    if (!Array.isArray(candidates)) throw new Error('NHL search unavailable');
    return matchNhlPlayer(name, position, team, candidates)?.playerId ?? null;
}, ['keeper-nhl-identities-v1'], { revalidate: 86400 });

async function loadProfile(id: string) {
    if (!/^\d+$/.test(id)) throw new Error('Invalid NHL identity');
    const profile = await request<NhlProfile>(`https://api-web.nhle.com/v1/player/${id}/landing`);
    if (profile.playerId !== Number(id) || !profile.firstName?.default || !profile.lastName?.default || !Array.isArray(profile.seasonTotals)) throw new Error('Incomplete NHL profile');
    return profileDetails(profile, KEEPER_SEASON - 1, new Date().toISOString());
}
const dailyProfile = unstable_cache(loadProfile, ['keeper-nhl-profiles-v1', String(KEEPER_SEASON)], { revalidate: 86400 });
const previousFantasyStats = cached(() => rows<{ id: string; points: number; perGame: number }>(sql`
    select replace(player_id, '*', '') as id, fpts::float8 as points, fpg::float8 as "perGame"
    from league.player_seasons where season_year = ${KEEPER_SEASON - 1}`), 'keeper-previous-fantasy-stats-2026');

export async function enrichKeeperRoster(roster: KeeperPlayer[]): Promise<KeeperPlayer[]> {
    const fantasy = new Map((await previousFantasyStats()).map(row => [row.id, row]));
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    const enriched: KeeperPlayer[] = [];
    // Six requests at a time; cached across owners and visits.
    for (let i = 0; i < roster.length; i += 6) {
        enriched.push(...await Promise.all(roster.slice(i, i + 6).map(async player => {
            let nhl: Awaited<ReturnType<typeof loadProfile>> | null = null;
            try {
                const id = await identifyPlayer(player.name, player.position, player.nhlTeam);
                if (id) nhl = await dailyProfile(id);
            } catch { /* Missing data is shown as unavailable; keeper choices still work. */ }
            const archived = fantasy.get(player.id);
            const details: PlayerDetails = {
                nhlId: null, birthDate: null, previousSeason: KEEPER_SEASON - 1, stats: null, checkedAt: null,
                ...nhl, age: playerAge(nhl?.birthDate ?? null, today),
                fantasyPoints: archived?.points ?? null, fantasyPerGame: archived?.perGame ?? null,
            };
            return { ...player, details };
        })));
    }
    return enriched;
}
