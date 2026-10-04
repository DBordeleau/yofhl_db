export interface NhlSearchPlayer { playerId: string; name: string; positionCode: string; teamAbbrev?: string | null; lastTeamAbbrev?: string | null }
export interface NhlSeasonStats {
    season: number; gameTypeId: number; leagueAbbrev: string; gamesPlayed: number;
    goals?: number; assists?: number; points?: number; wins?: number; goalsAgainstAvg?: number;
    savePctg?: number; shotsAgainst?: number; goalsAgainst?: number; timeOnIce?: string;
    teamName?: { default: string };
}
export interface NhlProfile {
    playerId: number; firstName: { default: string }; lastName: { default: string }; birthDate?: string; position: string;
    seasonTotals?: NhlSeasonStats[];
}
export interface PlayerDetails {
    nhlId: number | null; birthDate: string | null; age: number | null;
    previousSeason: number; stats: { games: number; goals: number | null; assists: number | null; points: number | null;
        wins: number | null; gaa: number | null; savePct: number | null } | null;
    fantasyPoints: number | null; fantasyPerGame: number | null; checkedAt: string | null;
}
const normalizeName = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

// Exact normalized names only. Never assign another player's stats from a fuzzy match.
export function matchNhlPlayer(name: string, position: string, team: string, candidates: NhlSearchPlayer[]) {
    const group = (pos: string) => pos === 'G' ? 'G' : pos === 'D' ? 'D' : 'F';
    const matches = candidates.filter(player => normalizeName(player.name) === normalizeName(name) && group(player.positionCode) === group(position));
    if (matches.length === 1) return matches[0];
    const sameTeam = matches.filter(player => player.teamAbbrev === team || player.lastTeamAbbrev === team);
    return sameTeam.length === 1 ? sameTeam[0] : null;
}

export function playerAge(birthDate: string | null, on: string) {
    if (!birthDate || !/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) return null;
    const age = Number(on.slice(0, 4)) - Number(birthDate.slice(0, 4)) - (on.slice(5, 10) < birthDate.slice(5, 10) ? 1 : 0);
    return age >= 0 && age < 100 ? age : null;
}

export function profileDetails(profile: NhlProfile, season: number, checkedAt: string): Omit<PlayerDetails, 'fantasyPoints' | 'fantasyPerGame' | 'age'> {
    const regularSeasons = profile.seasonTotals?.filter(row => row.leagueAbbrev === 'NHL' && row.gameTypeId === 2);
    const seasonId = (season - 1) * 10000 + season;
    let seasonRows = regularSeasons?.filter(row => row.season === seasonId) ?? [];
    const combined = seasonRows.find(row => /^(total|totals|\d+ teams?)$/i.test(row.teamName?.default ?? ''));
    if (combined) seasonRows = [combined];
    const sum = (key: keyof NhlSeasonStats) => seasonRows.every(row => typeof row[key] === 'number') ? seasonRows.reduce((n, row) => n + Number(row[key]), 0) : null;
    const minutes = seasonRows.reduce((n, row) => { const [m, s] = (row.timeOnIce ?? '').split(':').map(Number); return n + m + s / 60; }, 0);
    const ga = sum('goalsAgainst'); const sa = sum('shotsAgainst');
    const stats = seasonRows.length ? {
        games: sum('gamesPlayed')!, goals: sum('goals'), assists: sum('assists'), points: sum('points'), wins: sum('wins'),
        gaa: seasonRows.length === 1 ? seasonRows[0].goalsAgainstAvg ?? null : ga !== null && minutes > 0 ? ga / minutes * 60 : null,
        savePct: seasonRows.length === 1 ? seasonRows[0].savePctg ?? null : ga !== null && sa !== null && sa > 0 ? (sa - ga) / sa : null,
    } : regularSeasons ? { games: 0, goals: null, assists: null, points: null, wins: null, gaa: null, savePct: null } : null;
    return { nhlId: profile.playerId, birthDate: profile.birthDate ?? null, previousSeason: season, stats, checkedAt };
}
