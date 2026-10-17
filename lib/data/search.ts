import { sql } from 'drizzle-orm';
import { cached, rows } from './db';
import { getBannerSeasons, getFranchiseCards } from './league';
import { leagueTags } from './cache-tags';
import { playerHref, playerSlug } from '../player-url';
import { seasonLabel } from '../league';
import { AWARDS, awardHref } from '../awards';
import { normalizeSearch, searchDirectory, type SearchEntry, type SearchState } from '../search/model';

// Cache one public directory, not an unbounded set of arbitrary query strings.
export const getSearchDirectory = cached(async (): Promise<SearchEntry[]> => {
    const [players, teams, history, seasons] = await Promise.all([
        rows<{ id: string; name: string; positions: string[] | null; seasons: number | null; careerPoints: number }>(sql`
            select p.id, p.name, c.positions, c.seasons, coalesce(c.total_fpts, 0)::float8 as "careerPoints" from league.players p
            left join league.player_careers c on c.player_id = p.id`),
        getFranchiseCards(),
        rows<{ franchiseId: number; year: number; name: string; importedName: string; franchiseName: string; abbreviation: string }>(sql`
            select t.franchise_id as "franchiseId", t.season_year as year, t.name, t.fantrax_name as "importedName", f.display_name as "franchiseName", t.abbreviation
            from league.team_seasons t join league.franchises f on f.id = t.franchise_id
            order by t.season_year`),
        getBannerSeasons(),
    ]);
    // Match getPlayer's preference for an exact, unwrapped ID if legacy IDs collide.
    const seen = new Set<string>();
    const uniquePlayers = players.sort((a, b) => Number(a.id !== playerSlug(a.id)) - Number(b.id !== playerSlug(b.id))).filter(player => {
        const id = playerSlug(player.id);
        if (seen.has(id)) return false;
        seen.add(id); return true;
    });
    const entries: SearchEntry[] = uniquePlayers.map(player => ({ kind: 'players', id: playerSlug(player.id),
        title: player.name, href: playerHref(player.id),
        subtitle: [player.positions?.join(' · '), player.seasons ? `${player.seasons} archive ${player.seasons === 1 ? 'season' : 'seasons'}` : 'No career statistics yet'].filter(Boolean).join(' · '),
        careerPoints: player.careerPoints,
    }));
    for (const team of teams) {
        const stints = history.filter(row => row.franchiseId === team.ID);
        entries.push({ kind: 'teams', id: String(team.ID), title: team.Team, href: `/teams/${team.ID}`,
            subtitle: team.defunct ? 'Defunct franchise' : 'Franchise', defunct: team.defunct,
            logo: team.LogoUrl, abbreviation: team.Abbreviation,
            aliases: [...new Set(stints.map(row => row.name))].filter(name => name !== team.Team).map(name => ({
                text: name, note: `Formerly ${name} · ${stints.filter(row => row.name === name).map(row => seasonLabel(row.year)).join(', ')}`,
            })).concat([...new Set([team.Abbreviation, ...stints.map(row => row.abbreviation)])].map(text => ({ text, note: '' })))
                .concat([...new Set(stints.flatMap(row => [row.importedName, row.franchiseName]))].filter(name => name !== team.Team && !stints.some(row => row.name === name))
                    .map(text => ({ text, note: `Also recorded as ${text}` }))),
        });
    }
    for (const award of AWARDS) {
        entries.push({ kind: 'awards', id: award.id, title: award.label, subtitle: award.honor,
            href: awardHref(award.name), aliases: [{ text: award.name }, { text: award.id }] });
    }
    for (const season of seasons) {
        // Incomplete imports are not proof that a season is the live Fantrax season.
        if (!season.team && season.playoffStatus !== 'cancelled') continue;
        entries.push({ kind: 'seasons', id: String(season.year), title: seasonLabel(season.year),
            subtitle: season.playoffStatus === 'cancelled' ? 'Playoffs cancelled' : `Jagr Cup champions: ${season.team}`,
            href: `/season/${season.year}`, logo: season.logo, abbreviation: season.abbreviation,
            aliases: [{ text: String(season.year) }, { text: `${season.year - 1}-${season.year}` }],
        });
    }
    return entries;
}, 'search-directory', [leagueTags.discovery]);

export async function searchPublicDirectory(state: SearchState) {
    // Empty search must not wake the database.
    if (normalizeSearch(state.q).length < 2) return searchDirectory([], state);
    return searchDirectory(await getSearchDirectory(), state);
}
