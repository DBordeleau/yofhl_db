// The award vote's NHL player lookup over HTTP, matching players the way the keeper page does: a verified identity
// from league/nhl-player-ids.json when there is one, else the NHL's player search and an exact match on name and
// position group (lib/keepers/player-details.ts), then the player's NHL profile for their birth date and NHL
// regular-season games in each season. No match, or more than one, is no match: a rookie is never admitted on
// another player's record; nor is a profile with no birth date or season history. A failed or unexpected NHL answer
// throws, and the prepare leaves that player unmatched for the admin to decide on by hand.
import nhlIdentities from '@/league/nhl-player-ids.json';
import { matchNhlPlayer, type NhlProfile, type NhlSearchPlayer } from '@/lib/keepers/player-details';
import type { AwardVoteNhl, NhlLookupPlayer, NhlPlayerRecord } from './ports';

const verified = nhlIdentities as Record<string, { nhlId: number }>;

/** a row naming a player's combined line for a season split between teams */
const COMBINED = /^(total|totals|\d+ teams?)$/i;

/**
 * a profile's NHL regular-season games per season, using the combined line of a season split between teams, or
 * null when a line's games are missing
 */
function seasonGames(profile: NhlProfile): NhlPlayerRecord['seasons'] | null {
    const rows = profile.seasonTotals!.filter(row => row.leagueAbbrev === 'NHL' && row.gameTypeId === 2);
    const seasons = [...new Set(rows.map(row => row.season))].map(season => {
        let lines = rows.filter(row => row.season === season);
        const combined = lines.find(row => COMBINED.test(row.teamName?.default ?? ''));
        if (combined) lines = [combined];
        if (lines.some(row => !Number.isInteger(row.gamesPlayed) || row.gamesPlayed < 0)) return null;
        return { season, games: lines.reduce((sum, row) => sum + row.gamesPlayed, 0) };
    });
    return seasons.every(season => season !== null) ? seasons : null;
}

export function createNhlLookup(fetcher: typeof fetch = fetch): AwardVoteNhl {
    async function request<T>(url: string): Promise<T> {
        const response = await fetcher(url, { cache: 'no-store', signal: AbortSignal.timeout(6000) });
        if (!response.ok) throw new Error(`The NHL returned ${response.status} for ${url}`);
        return response.json() as Promise<T>;
    }

    /** the one NHL player matching the Fantrax player in any of their position groups, or null */
    async function search(player: NhlLookupPlayer): Promise<number | null> {
        const url = new URL('https://search.d3.nhle.com/api/v1/search/player');
        url.search = new URLSearchParams({ culture: 'en-us', limit: '100', q: player.name }).toString();
        const candidates = await request<NhlSearchPlayer[]>(url.toString());
        if (!Array.isArray(candidates)) throw new Error('The NHL player search answered unexpectedly');
        const positions = player.positions.length ? player.positions : [''];
        const matches = new Set(positions.map(position => matchNhlPlayer(player.name, position, player.nhlTeam ?? '', candidates)?.playerId).filter(id => id !== undefined));
        return matches.size === 1 ? Number([...matches][0]) : null;
    }

    return {
        lookup: async player => {
            const nhlId = verified[player.id]?.nhlId ?? await search(player);
            if (nhlId === null) return null;
            const profile = await request<NhlProfile>(`https://api-web.nhle.com/v1/player/${nhlId}/landing`);
            if (profile.playerId !== nhlId) throw new Error(`The NHL answered for player ${profile.playerId} when asked for ${nhlId}`);
            // a profile without a birth date or season history can't be judged: the admin decides on the player by hand
            if (!profile.birthDate || !Array.isArray(profile.seasonTotals)) return null;
            const seasons = seasonGames(profile);
            return seasons && { nhlId, birthDate: profile.birthDate, seasons };
        },
    };
}
