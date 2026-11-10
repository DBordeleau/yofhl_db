import type { StudioPlayer, StudioTeam } from '../teams';
import type { PlayerRef } from '../script';
import type { SnapshotDiagnostic } from '../player-snapshot';
import { createFantraxClient, readCore, toWeekScores, type Fetcher } from '../../fantrax/fantrax-client';
import type { SourceCore } from '../../fantrax/live-season-source';
import { playerName, type Period } from '../../fantrax/model';
import { seasonLabel } from '../../seasons';
import { eraFor, liveFantraxLeague, type Franchise, type LeagueConfig } from '../../../scripts/db/lib/league-config';

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
    /** the last stats capture: the refs it resolved, at which stats season, and what was wrong (the draft check reports these) */
    playerSnapshot?: { season: number; refs: PlayerRef[]; diagnostics: SnapshotDiagnostic[] };
    sources: Source[];
    limitations: string[];
}

const normalize = (name: string) => name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

/** Wraps the capture's fetcher: each response that comes back OK becomes a source, in request order, timed at its arrival. */
function sourceRecorder(fetcher: Fetcher) {
    const requests: (Source | null)[] = [];
    const recording: Fetcher = async (url, init) => {
        const slot = requests.push(null) - 1;
        const response = await fetcher(url, init);
        if (response.ok) requests[slot] = { url, fetchedAt: new Date().toISOString() };
        return response;
    };
    return { fetcher: recording, sources: () => requests.filter((source): source is Source => source !== null) };
}

async function nhlRequest(url: string, fetcher: Fetcher): Promise<{ value: unknown; source: Source }> {
    const response = await fetcher(url, { cache: 'no-store', signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error(`NHL returned HTTP ${response.status}: ${url}`);
    const fetchedAt = new Date().toISOString();
    return { value: await response.json(), source: { url, fetchedAt } };
}

/** the franchise's team season, or none when it hadn't started or had folded by then */
const teamSeason = (franchise: Franchise, season: number) =>
    franchise.folded == null || franchise.folded >= season ? eraFor(franchise, season) : undefined;

type FantraxFields = Pick<FactTeam, 'fantraxId' | 'rank' | 'record' | 'points'>;
const NO_FANTRAX: FantraxFields = { fantraxId: '', rank: null, record: null, points: null };
const fantraxFields = ({ fantraxId, rank, record, points }: FantraxFields): FantraxFields => ({ fantraxId, rank, record, points });
const TEAM_IDENTITY_NOTE = 'Team identity, owners and logos come from ';
const TEAM_IDENTITY = `${TEAM_IDENTITY_NOTE}the database's current identity at capture time, with saved team colours: the same team list the admin editor checks and Publish freezes.`;

/**
 * The packet's teams: the studio team list (the site's, as the database has it now), each with the Fantrax
 * fields of the franchise's Fantrax team. Every franchise in `fantrax` must be on the list, or the capture fails
 * before facts.json is replaced.
 */
export function packetTeams(studio: StudioTeam[], fantrax: Map<number, FantraxFields & { name: string }> = new Map()): FactTeam[] {
    for (const [franchiseId, team] of fantrax) {
        if (!studio.some(s => s.id === franchiseId)) throw new Error(`Fantrax team "${team.name}" (${team.fantraxId}) is franchise ${franchiseId}, which isn't an active franchise in the database's current teams. Check league.current_teams, or fix the franchise in league/league.yml.`);
    }
    return studio.map(team => {
        const found = fantrax.get(team.id);
        return { ...team, ...(found ? fantraxFields(found) : NO_FANTRAX) };
    });
}

/** Recapture the team list into an existing packet, keeping each franchise's Fantrax fields. */
export function withStudioTeams(packet: FactPacket, studio: StudioTeam[]): FactPacket {
    const fantrax = new Map(packet.teams.filter(team => team.fantraxId).map(team => [team.id, { name: team.name, ...fantraxFields(team) }]));
    // the identity note keeps its place; a packet from before it gains one
    const limitations = packet.limitations.some(note => note.startsWith(TEAM_IDENTITY_NOTE))
        ? packet.limitations.map(note => note.startsWith(TEAM_IDENTITY_NOTE) ? TEAM_IDENTITY : note) : [...packet.limitations, TEAM_IDENTITY];
    return { ...packet, teams: packetTeams(studio, fantrax), limitations };
}

export function referencePacket(config: LeagueConfig, season: number, teams: StudioTeam[]): FactPacket {
    const now = new Date().toISOString();
    return { version: 1, kind: 'reference', captureStartedAt: now, capturedAt: now, timezone: 'America/Toronto',
        leagueId: liveFantraxLeague(config), season, period: null, phase: 'reference', scheduledMatchups: [],
        teams: packetTeams(teams), matchups: [], rosters: [], rosterPeriod: null, players: [], sources: [],
        limitations: ['Pilot reference only. Scores in the script are historical example dialogue, not a current fact export.',
            'Offline reference starts without archived player statistics. Run coachs:stats after writing player/gap graphics.', TEAM_IDENTITY] };
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
    const { value } = await nhlRequest(search.href, fetcher);
    if (!Array.isArray(value)) throw new Error(`Invalid NHL search for ${name}`);
    const exact = value.filter((p: { name?: string }) => typeof p.name === 'string' && normalize(p.name) === normalize(name));
    if (exact.length !== 1 || !/^\d+$/.test(String(exact[0]?.playerId))) return empty;
    const nhlId = Number(exact[0].playerId);
    const landing = await nhlRequest(`https://api-web.nhle.com/v1/player/${nhlId}/landing`, fetcher);
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

/**
 * Each Fantrax team's franchise, from league.yml's `fantrax.teams` map for the season Fantrax reports.
 * Entries for Fantrax teams that Fantrax didn't return are ignored.
 */
function franchisesFor(config: LeagueConfig, core: SourceCore, leagueId: string): Map<string, number> {
    const label = seasonLabel(core.seasonYear), block = `seasons.${core.seasonYear}.fantrax`, key = `${block}.teams`;
    const fantrax = config.seasons[core.seasonYear]?.fantrax;
    if (!fantrax) throw new Error(`league/league.yml has no fantrax block for ${label}, the season Fantrax reports. Add ${block} with its league and teams.`);
    if (fantrax.league !== leagueId) throw new Error(`${block}.league is ${fantrax.league}, but the export fetched ${leagueId} for ${label}. Make league/league.yml agree on the live season's league.`);
    const teams = fantrax.teams ?? {};
    const mapped = new Map<string, number>();
    const fantraxTeamOf = new Map<number, string>();
    for (const team of core.teams) {
        const franchiseId = teams[team.id];
        const fantraxTeam = `Fantrax team "${team.name}" (${team.id})`;
        if (franchiseId === undefined) throw new Error(`${fantraxTeam} has no franchise for ${label}. Add ${team.id} to ${key} in league/league.yml.`);
        const franchise = config.franchises.find(f => f.id === franchiseId);
        if (!franchise) throw new Error(`${fantraxTeam} maps to franchise ${franchiseId}, which isn't in league/league.yml's franchises. Fix ${key}.${team.id}.`);
        if (!teamSeason(franchise, core.seasonYear)) throw new Error(`${fantraxTeam} maps to franchise ${franchiseId}, which has no team season in ${label}. Fix ${key}.${team.id} or the franchise's eras in league/league.yml.`);
        const taken = fantraxTeamOf.get(franchiseId);
        if (taken) throw new Error(`Fantrax teams ${taken} and ${team.id} are both mapped to franchise ${franchiseId} for ${label}. Fix ${key} in league/league.yml.`);
        fantraxTeamOf.set(franchiseId, team.id);
        mapped.set(team.id, franchiseId);
    }
    return mapped;
}

type ScoreCategory = { name: string; shortName: string; group: string; away: { value?: number }; home: { value?: number } };

/**
 * Read directly from sources, independent of Next's daily cache. `teams` is the studio team list, which the
 * caller loads from the database just before the capture.
 */
export async function captureFacts(config: LeagueConfig, options: { teams: StudioTeam[]; period?: number; recap?: boolean; airDate?: string; players?: string[]; fetcher?: Fetcher }): Promise<FactPacket> {
    if (options.recap && options.period !== undefined) throw new Error('Choose --recap or --period, not both.');
    if (options.airDate !== undefined && (!options.recap || !/^\d{4}-\d{2}-\d{2}$/.test(options.airDate) ||
        !Number.isFinite(Date.parse(`${options.airDate}T12:00:00Z`)) || new Date(`${options.airDate}T12:00:00Z`).toISOString().slice(0, 10) !== options.airDate)) {
        throw new Error('--air-date requires --recap and a valid YYYY-MM-DD calendar date.');
    }
    const recorder = sourceRecorder(options.fetcher ?? fetch);
    const fantrax = createFantraxClient(recorder.fetcher);
    const started = new Date().toISOString();
    const leagueId = liveFantraxLeague(config);
    const [league, directory] = await Promise.all([fantrax.league(leagueId), fantrax.playerDirectory()]);
    const core = readCore(league, directory);
    // An intended air date selects the editorial week only. Source times and phase stay live.
    const recap = options.recap ? selectRecapPeriod(core.weeks, Date.parse(options.airDate ? `${options.airDate}T12:00:00Z` : started)) : undefined;
    const period = recap?.period ?? (options.period === undefined
        ? core.weeks.find(week => Date.parse(week.endDate) >= Date.parse(started)) ?? core.weeks.at(-1)!
        : core.weeks.find(week => week.number === options.period));
    if (!period) throw new Error(`Unknown scoring period ${options.period}. Choose one from the league calendar.`);
    const season = core.seasonYear;
    const franchises = franchisesFor(config, core, leagueId);
    const teams = packetTeams(options.teams, new Map(core.teams.map(team => {
        const standing = core.standings.find(s => s.teamId === team.id);
        if (!standing || !finite(standing.rank) || !finite(standing.points) || typeof standing.record !== 'string') throw new Error(`Missing standings for ${team.name}`);
        return [franchises.get(team.id)!, { name: team.name, fantraxId: team.id, rank: standing.rank, record: standing.record, points: standing.points }];
    })));
    const phase = Date.parse(started) < Date.parse(period.startDate) ? 'upcoming' : Date.parse(started) > Date.parse(period.endDate) ? 'complete' : 'active';
    // a team with a bye has a published matchup with only one side
    const scheduledMatchups = (core.schedule.find(round => round.week === period.number)?.matchups ?? [])
        .filter(m => m.away.id && m.home.id).map(m => ({ awayId: m.away.id!, homeId: m.home.id! }));
    let matchups: Matchup[] = [];
    if (phase !== 'upcoming') {
        const scores = toWeekScores(await fantrax.weekScores(leagueId, period.number));
        const seen = new Set<string>();
        matchups = scores.matchups.map(m => {
            for (const side of [m.away, m.home]) {
                if (!teams.some(t => t.fantraxId === side.teamId) || seen.has(side.teamId) || !Number.isInteger(side.gamesPlayed) || side.gamesPlayed < 0) throw new Error('Invalid matchup team, score or player games');
                seen.add(side.teamId);
            }
            // Fantrax's category breakdown rides along on each matchup; the client passes it through unchecked.
            const categories = (m as typeof m & { categories?: ScoreCategory[] }).categories ?? [];
            return { away: m.away, home: m.home, categories: categories.map(c => ({ name: c.name, shortName: c.shortName, group: c.group,
                away: finite(c.away?.value) ? c.away.value : null, home: finite(c.home?.value) ? c.home.value : null })) };
        });
        if (scheduledMatchups.length && (matchups.length !== scheduledMatchups.length || scheduledMatchups.some(s =>
            !matchups.some(m => m.away.teamId === s.awayId && m.home.teamId === s.homeId)))) throw new Error('Matchup scores do not cover the published schedule');
    }
    const rosters = teams.filter(team => team.fantraxId).map(team => {
        const entries = core.rosters[team.fantraxId];
        if (!Array.isArray(entries)) throw new Error(`Missing roster for ${team.name}`);
        return { teamId: team.fantraxId, players: entries.map(item => {
            const p = core.players[item.id];
            if (!p) throw new Error(`Missing player directory entry ${item.id}`);
            return { id: item.id, name: playerName(p.name), position: p.position, nhlTeam: p.team ?? null, status: item.status };
        }) };
    });
    const players: FeaturedPlayer[] = [];
    const limitations = [
        'Live observations were collected over the capture interval, not an atomic or historical cutoff. Later stat corrections are possible.',
        'Standings and rosters are current at capture time even when an earlier matchup period is selected.',
        TEAM_IDENTITY,
        'Transactions, injuries, news and private league chat are not exported. Add dated, sourced notes to brief.md before using them.',
        'Run coachs:stats after adding or changing player/gap graphics to capture the relevant archived fantasy statistics.',
    ];
    if (recap) limitations.unshift(`Recap covers ${recap.startDate} through ${recap.endDate}, Monday through Sunday in America/Toronto. Fantrax's matchup window ends at ${period.endDate}; phase uses that raw boundary. Calendar selection does not confirm final scores.`);
    for (const name of [...new Set(options.players ?? [])]) {
        try {
            const player = await lookupFeaturedPlayer(name, recorder.fetcher);
            players.push(player);
            if (player.bornInNorthAmerica === null) limitations.push(`Verify birthplace manually for ${name}; NHL identity or country could not be resolved uniquely.`);
        } catch {
            players.push(unknownPlayer(name));
            limitations.push(`NHL lookup failed for ${name}. Verify birthplace and add the sourced player record before using the pronunciation rule.`);
        }
    }
    return { version: 1, kind: 'live', captureStartedAt: started, capturedAt: new Date().toISOString(), timezone: 'America/Toronto', leagueId,
        season, period, phase, scheduledMatchups, teams, matchups, rosters, rosterPeriod: core.lineupPeriod?.number ?? null, players,
        sources: recorder.sources(), limitations };
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
        (packet.playerSnapshot !== undefined && (!Number.isInteger(packet.playerSnapshot?.season) ||
            !Array.isArray(packet.playerSnapshot.refs) || !Array.isArray(packet.playerSnapshot.diagnostics))) ||
        !packet.players.every(p => p && typeof p.name === 'string' && [true, false, null].includes(p.bornInNorthAmerica) &&
            (p.birthCountry === null || typeof p.birthCountry === 'string') &&
            (birthRegion(p.birthCountry) === null || birthRegion(p.birthCountry) === p.bornInNorthAmerica) &&
            Array.isArray(p.positions) && [p.season, p.fpts, p.fpg, p.games].every(optionalNumber))) {
        throw new Error('Invalid facts.json. Expected a version 1 Coach\'s Corner fact packet.');
    }
    return packet;
}
