import type { StudioPlayer, StudioTeam } from '../teams';
import { FANTRAX_LEAGUE_ID } from '../../fantrax/config';
import { playerName, type Period } from '../../fantrax/model';
import { eraFor, findByName, type LeagueConfig } from '../../../scripts/db/lib/league-config';
import { suggestedPalettes, fallbackColours } from '../../team-branding';

export interface Source { url: string; fetchedAt: string }
export interface FeaturedPlayer extends StudioPlayer {
    nhlId: number | null;
    birthCountry: string | null;
    birthCity: string | null;
    bornInNorthAmerica: boolean | null;
    source: Source | null;
    statsSource?: Source & { season: number; playerId: string | null };
}
export interface FactTeam extends StudioTeam { fantraxId: string; rank: number | null; record: string | null; points: number | null }
export interface Matchup {
    away: { teamId: string; score: number; gamesPlayed: number };
    home: { teamId: string; score: number; gamesPlayed: number };
    categories: { name: string; shortName: string; group: string; away: number | null; home: number | null }[];
}
export interface FactPacket {
    version: 1;
    kind: 'live' | 'reference';
    captureStartedAt: string;
    capturedAt: string;
    timezone: 'America/Toronto';
    leagueId: string;
    season: number;
    period: Period | null;
    phase: 'upcoming' | 'active' | 'complete' | 'reference';
    scheduledMatchups: { awayId: string; homeId: string }[];
    teams: FactTeam[];
    matchups: Matchup[];
    rosters: { teamId: string; players: { id: string; name: string; position: string; nhlTeam: string | null; status: string }[] }[];
    rosterPeriod: number | null;
    players: FeaturedPlayer[];
    sources: Source[];
    limitations: string[];
}

type Fetcher = typeof fetch;
const normalize = (name: string) => name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const iso = (value: string) => new Date(value.replace(/([+-]\d{2})(\d{2})$/, '$1:$2')).toISOString();

async function request(url: string, fetcher: Fetcher): Promise<{ value: unknown; source: Source }> {
    const response = await fetcher(url, { cache: 'no-store', signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error(`Source returned HTTP ${response.status}: ${url}`);
    return { value: await response.json(), source: { url, fetchedAt: new Date().toISOString() } };
}

export function studioTeam(config: LeagueConfig, season: number, name: string): StudioTeam {
    const match = findByName(config, season, name);
    if (!match) throw new Error(`Unmapped Fantrax team "${name}" for season ${season}. Update league/league.yml before exporting.`);
    const { era, franchise } = match;
    const colours = suggestedPalettes[franchise.id] ?? fallbackColours;
    return { id: franchise.id, name: era.name, abbreviation: era.abbreviations[0], owner: era.owner ?? null,
        ownerFirst: era.owner?.split(/\s+/)[0] ?? null, logo: era.logo ?? null, primary: colours.primary, secondary: colours.secondary };
}

export function referencePacket(config: LeagueConfig, season: number): FactPacket {
    const now = new Date().toISOString();
    return { version: 1, kind: 'reference', captureStartedAt: now, capturedAt: now, timezone: 'America/Toronto',
        leagueId: FANTRAX_LEAGUE_ID, season, period: null, phase: 'reference', scheduledMatchups: [],
        teams: config.franchises.filter(f => f.folded == null || f.folded >= season).flatMap(f => {
            const era = eraFor(f, season);
            return era ? [{ ...studioTeam(config, season, era.name), fantraxId: '', rank: null, record: null, points: null }] : [];
        }), matchups: [], rosters: [], rosterPeriod: null, players: [], sources: [],
        limitations: ['Pilot reference only. Scores in the script are historical example dialogue, not a current fact export.',
            'Offline reference starts without archived player statistics. Run coachs:stats after writing player/gap graphics.'] };
}

// Unknown country codes stay unknown. Birthplace, not nationality or the spelling of a name, determines this rule.
const NORTH_AMERICA = new Set(['CAN', 'USA', 'MEX', 'CANADA', 'UNITED STATES', 'MEXICO', 'BMU', 'GRL', 'BLZ', 'CRI', 'SLV', 'GTM', 'HND', 'NIC', 'PAN', 'CUB', 'HTI', 'DOM', 'JAM', 'BHS', 'BRB', 'ATG', 'DMA', 'GRD', 'KNA', 'LCA', 'VCT', 'TTO', 'PRI']);
const OUTSIDE_NORTH_AMERICA = new Set(['SWE', 'FIN', 'RUS', 'CZE', 'SVK', 'CHE', 'SUI', 'DEU', 'GER', 'AUT', 'DNK', 'DEN', 'NOR', 'FRA', 'GBR', 'GB', 'LAT', 'LVA', 'LTU', 'EST', 'BLR', 'UKR', 'POL', 'SVN', 'SLO', 'HRV', 'ITA', 'HUN', 'NLD', 'BEL', 'KAZ', 'UZB', 'JPN', 'CHN', 'KOR', 'AUS', 'NZL', 'BRA', 'ZAF']);
export const birthRegion = (country: string | null): boolean | null => {
    const code = country?.toUpperCase();
    return code && NORTH_AMERICA.has(code) ? true : code && OUTSIDE_NORTH_AMERICA.has(code) ? false : null;
};

export const unknownPlayer = (name: string): FeaturedPlayer => ({ name, nhlId: null, birthCountry: null, birthCity: null, bornInNorthAmerica: null,
    source: null, headshot: null, nhlTeam: null, positions: [], season: null, fpts: null, fpg: null, games: null });

export async function lookupFeaturedPlayer(name: string, fetcher: Fetcher = fetch): Promise<FeaturedPlayer> {
    const empty = unknownPlayer(name);
    const search = new URL('https://search.d3.nhle.com/api/v1/search/player');
    search.search = new URLSearchParams({ culture: 'en-us', limit: '20', q: name }).toString();
    const { value } = await request(search.href, fetcher);
    if (!Array.isArray(value)) throw new Error(`Invalid NHL search for ${name}`);
    const exact = value.filter((p: { name?: string }) => typeof p.name === 'string' && normalize(p.name) === normalize(name));
    if (exact.length !== 1 || !/^\d+$/.test(String(exact[0]?.playerId))) return empty;
    const nhlId = Number(exact[0].playerId);
    const landing = await request(`https://api-web.nhle.com/v1/player/${nhlId}/landing`, fetcher);
    const p = landing.value as { playerId?: number; firstName?: { default: string }; lastName?: { default: string }; birthCountry?: string; birthCity?: { default: string }; headshot?: string; currentTeamAbbrev?: string; position?: string };
    if (p.playerId !== nhlId || normalize(`${p.firstName?.default} ${p.lastName?.default}`) !== normalize(name)) return empty;
    const country = typeof p.birthCountry === 'string' ? p.birthCountry : null;
    return { ...empty, nhlId, source: landing.source, birthCountry: country, birthCity: p.birthCity?.default ?? null,
        bornInNorthAmerica: birthRegion(country), headshot: p.headshot?.startsWith('https://') ? p.headshot : null,
        nhlTeam: p.currentTeamAbbrev ?? null, positions: p.position ? [p.position] : [] };
}

/** Select the previous Monday through Sunday in Toronto, independently of Fantrax's Monday evening rollover. */
export function selectRecapPeriod(periods: Period[], now: number): { period: Period; startDate: string; endDate: string } {
    const torontoDate = (time: number) => new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Toronto', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(time);
    // UTC arithmetic here operates on calendar dates, avoiding 23/25-hour days at DST changes.
    const monday = new Date(`${torontoDate(now)}T00:00:00Z`);
    monday.setUTCDate(monday.getUTCDate() - (monday.getUTCDay() + 6) % 7);
    const dateBefore = (days: number) => new Date(monday.getTime() - days * 86_400_000).toISOString().slice(0, 10);
    const startDate = dateBefore(7), endDate = dateBefore(1), followingMonday = dateBefore(0);
    const matches = periods.filter(period => {
        const start = Date.parse(period.startDate), end = Date.parse(period.endDate);
        return Number.isFinite(start) && Number.isFinite(end) && end >= start && torontoDate(start) === startDate &&
            [endDate, followingMonday].includes(torontoDate(end));
    });
    if (matches.length !== 1) throw new Error(`Cannot identify one weekly scoring period for the recap from ${startDate} through ${endDate} in America/Toronto. Use --period <n> to select explicitly; label any provisional rehearsal accordingly.`);
    return { period: matches[0], startDate, endDate };
}

/** Read directly from sources, independent of Next's daily cache and the production database. */
export async function captureFacts(config: LeagueConfig, options: { period?: number; recap?: boolean; players?: string[]; fetcher?: Fetcher } = {}): Promise<FactPacket> {
    if (options.recap && options.period !== undefined) throw new Error('Choose --recap or --period, not both.');
    const fetcher = options.fetcher ?? fetch;
    const started = new Date().toISOString();
    const url = (endpoint: string, params: Record<string, string> = {}) => `https://www.fantrax.com/fxea/general/${endpoint}?${new URLSearchParams({ leagueId: FANTRAX_LEAGUE_ID, ...params })}`;
    const responses = await Promise.all([
        request(url('getLeagueInfo', { excludePlayerInfo: 'true' }), fetcher), request(url('getStandings'), fetcher),
        request(url('getTeamRosters'), fetcher), request('https://www.fantrax.com/fxea/general/getPlayerIds?sport=NHL', fetcher),
    ]);
    const [infoResult, standingsResult, rosterResult, directoryResult] = responses;
    const info = infoResult.value as { seasonYear: number; teamInfo: Record<string, { name: string }>; scoringPeriods: Period[];
        matchups: { period: number; matchupList: { away: { id?: string }; home: { id?: string } }[] }[] };
    const standings = standingsResult.value as { teamId: string; rank: number; points: string; totalPointsFor: number }[];
    const roster = rosterResult.value as { period: number; rosters: Record<string, { rosterItems: { id: string; status: string; position: string }[] }> };
    const directory = directoryResult.value as Record<string, { name: string; position: string; team?: string }>;
    if (!Number.isInteger(info?.seasonYear) || !info.teamInfo || !Object.keys(info.teamInfo).length || !Array.isArray(info.scoringPeriods) || !info.scoringPeriods.length || !Array.isArray(info.matchups) ||
        !Array.isArray(standings) || !roster?.rosters || !Number.isInteger(roster.period) || !directory || !Object.values(directory).every(p => typeof p?.name === 'string')) {
        throw new Error('Incomplete Fantrax fact export. No previous snapshot has been replaced.');
    }
    const periods = info.scoringPeriods.map(p => ({ number: p.number, startDate: iso(p.startDate), endDate: iso(p.endDate) })).sort((a, b) => a.number - b.number);
    const recap = options.recap ? selectRecapPeriod(periods, Date.parse(started)) : undefined;
    const period = recap?.period ?? (options.period === undefined
        ? periods.find(p => Date.parse(p.endDate) >= Date.parse(started)) ?? periods.at(-1)!
        : periods.find(p => p.number === options.period));
    if (!period) throw new Error(`Unknown scoring period ${options.period}. Choose one from the league calendar.`);
    // Fantrax uses the starting year; this site's screenplay uses the ending year.
    const season = info.seasonYear + 1;
    const teams = Object.entries(info.teamInfo).map(([id, team]): FactTeam => {
        const standing = standings.find(s => s.teamId === id);
        if (!standing || !finite(standing.rank) || !finite(standing.totalPointsFor) || typeof standing.points !== 'string') throw new Error(`Missing standings for ${team.name}`);
        return { ...studioTeam(config, season, team.name), fantraxId: id, rank: standing.rank, record: standing.points, points: standing.totalPointsFor };
    });
    const phase = Date.parse(started) < Date.parse(period.startDate) ? 'upcoming' : Date.parse(started) > Date.parse(period.endDate) ? 'complete' : 'active';
    const scheduledMatchups = (info.matchups.find(m => m.period === period.number)?.matchupList ?? [])
        .filter(m => m.away?.id && m.home?.id).map(m => ({ awayId: m.away.id!, homeId: m.home.id! }));
    const sources = responses.map(r => r.source);
    let matchups: Matchup[] = [];
    if (phase !== 'upcoming') {
        const scoresResult = await request(url('getMatchupScores', { period: String(period.number) }), fetcher);
        sources.push(scoresResult.source);
        const scores = scoresResult.value as { period: number; matchups: (Omit<Matchup, 'categories'> & { categories?: { name: string; shortName: string; group: string; away: { value?: number }; home: { value?: number } }[] })[] };
        if (scores?.period !== period.number || !Array.isArray(scores.matchups) || !scores.matchups.length) throw new Error('Missing or wrong-period matchup scores');
        const seen = new Set<string>();
        matchups = scores.matchups.map(m => {
            for (const side of [m.away, m.home]) {
                if (!side || !teams.some(t => t.fantraxId === side.teamId) || seen.has(side.teamId) || !finite(side.score) || !Number.isInteger(side.gamesPlayed) || side.gamesPlayed < 0) throw new Error('Invalid matchup team, score or player games');
                seen.add(side.teamId);
            }
            return { away: m.away, home: m.home, categories: (m.categories ?? []).map(c => ({ name: c.name, shortName: c.shortName, group: c.group,
                away: finite(c.away?.value) ? c.away.value : null, home: finite(c.home?.value) ? c.home.value : null })) };
        });
        if (scheduledMatchups.length && (matchups.length !== scheduledMatchups.length || scheduledMatchups.some(s =>
            !matchups.some(m => m.away.teamId === s.awayId && m.home.teamId === s.homeId)))) throw new Error('Matchup scores do not cover the published schedule');
    }
    const rosters = teams.map(team => {
        const entries = roster.rosters[team.fantraxId]?.rosterItems;
        if (!Array.isArray(entries)) throw new Error(`Missing roster for ${team.name}`);
        return { teamId: team.fantraxId, players: entries.map(item => {
            const p = directory[item.id];
            if (!p) throw new Error(`Missing player directory entry ${item.id}`);
            return { id: item.id, name: playerName(p.name), position: p.position, nhlTeam: p.team ?? null, status: item.status };
        }) };
    });
    const players: FeaturedPlayer[] = [];
    const limitations = [
        'Live observations were collected over the capture interval, not an atomic or historical cutoff. Later stat corrections are possible.',
        'Standings and rosters are current at capture time even when an earlier matchup period is selected.',
        'Team identity, owners and logos come from league/league.yml; colours are repository defaults, not saved admin branding.',
        'Transactions, injuries, news and private league chat are not exported. Add dated, sourced notes to brief.md before using them.',
        'Run coachs:stats after adding or changing player/gap graphics to capture the relevant archived fantasy statistics.',
    ];
    if (recap) limitations.unshift(`Recap covers ${recap.startDate} through ${recap.endDate}, Monday through Sunday in America/Toronto. Fantrax's matchup window ends at ${period.endDate}; phase uses that raw boundary. Calendar selection does not confirm final scores.`);
    for (const name of [...new Set(options.players ?? [])]) {
        try {
            const player = await lookupFeaturedPlayer(name, fetcher);
            players.push(player);
            if (player.source) sources.push(player.source);
            if (player.bornInNorthAmerica === null) limitations.push(`Verify birthplace manually for ${name}; NHL identity or country could not be resolved uniquely.`);
        } catch {
            players.push(unknownPlayer(name));
            limitations.push(`NHL lookup failed for ${name}. Verify birthplace and add the sourced player record before using the pronunciation rule.`);
        }
    }
    return { version: 1, kind: 'live', captureStartedAt: started, capturedAt: new Date().toISOString(), timezone: 'America/Toronto', leagueId: FANTRAX_LEAGUE_ID,
        season, period, phase, scheduledMatchups, teams, matchups, rosters, rosterPeriod: roster.period, players, sources, limitations };
}

export function parseFactPacket(value: unknown): FactPacket {
    const packet = value as FactPacket;
    const timestamp = (v: unknown) => typeof v === 'string' && Number.isFinite(Date.parse(v));
    const optionalNumber = (v: unknown) => v === null || finite(v);
    const periodValid = (p: Period | null) => p !== null && Number.isInteger(p.number) && p.number > 0 && timestamp(p.startDate) && timestamp(p.endDate) && Date.parse(p.endDate) >= Date.parse(p.startDate);
    if (packet?.version !== 1 || !['live', 'reference'].includes(packet.kind) || !Number.isInteger(packet.season) ||
        packet.timezone !== 'America/Toronto' || typeof packet.leagueId !== 'string' ||
        !timestamp(packet.capturedAt) || !timestamp(packet.captureStartedAt) || Date.parse(packet.capturedAt) < Date.parse(packet.captureStartedAt) ||
        (packet.kind === 'live' && (!packet.period || !periodValid(packet.period) || !['active', 'complete', 'upcoming'].includes(packet.phase))) ||
        (packet.kind === 'reference' && (packet.period !== null || packet.phase !== 'reference')) ||
        !Array.isArray(packet.teams) || !Array.isArray(packet.matchups) || !Array.isArray(packet.players) ||
        !Array.isArray(packet.rosters) || !Array.isArray(packet.sources) || !Array.isArray(packet.limitations) ||
        !packet.teams.every(t => t && Number.isInteger(t.id) && typeof t.name === 'string' && typeof t.abbreviation === 'string' && typeof t.primary === 'string' && typeof t.secondary === 'string') ||
        !packet.sources.every(s => s && typeof s.url === 'string' && timestamp(s.fetchedAt)) ||
        !packet.limitations.every(s => typeof s === 'string') ||
        !packet.players.every(p => p && typeof p.name === 'string' && [true, false, null].includes(p.bornInNorthAmerica) &&
            (p.birthCountry === null || typeof p.birthCountry === 'string') &&
            (birthRegion(p.birthCountry) === null || birthRegion(p.birthCountry) === p.bornInNorthAmerica) &&
            Array.isArray(p.positions) && [p.season, p.fpts, p.fpg, p.games].every(optionalNumber))) {
        throw new Error('Invalid facts.json. Expected a version 1 Coach\'s Corner fact packet.');
    }
    return packet;
}
