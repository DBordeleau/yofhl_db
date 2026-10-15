export interface RivalryGame {
    id: number;
    year: number;
    stage: 'regular' | 'playoff';
    round: number;
    finalRound: number;
    away: number;
    home: number;
    awayName: string;
    homeName: string;
    awayScore: number;
    homeScore: number;
    winner: number | null;
    adjusted: boolean;
    note: string | null;
}

export interface RivalrySeason { year: number; team: number; points: number; wins: number; losses: number; ties: number }
export interface TradeAsset { id: string; from: number | null; to: number | null; label: string; playerId: string | null }
export interface RivalryTrade { id: string; date: string; year: number; assets: TradeAsset[] }

export const roundLabel = (game: RivalryGame) => game.stage === 'regular' ? `Period ${game.round}` : ['Final', 'Semifinal', 'Quarterfinal'][game.finalRound - game.round] ?? `Round ${game.round}`;
export const gameScore = (game: RivalryGame, team: number) => game.away === team ? game.awayScore : game.homeScore;

export function rivalryGames(games: RivalryGame[], a: number, b: number) {
    return games.filter(game => (game.away === a && game.home === b) || (game.away === b && game.home === a))
        .sort((x, y) => y.year - x.year || y.round - x.round);
}

export function directAssets(trade: RivalryTrade, a: number, b: number) {
    return trade.assets.filter(asset => (asset.from === a && asset.to === b) || (asset.from === b && asset.to === a));
}

export function pairSummary(games: RivalryGame[], a: number, b: number) {
    const meetings = rivalryGames(games, a, b);
    // Adjusted scores preserve the recorded winner, but cannot establish a real margin.
    const closest = meetings.filter(game => !game.adjusted && (game.winner !== null || (game.stage === 'regular' && (game.awayScore !== 0 || game.homeScore !== 0))))
        .sort((x, y) => Math.abs(x.awayScore - x.homeScore) - Math.abs(y.awayScore - y.homeScore))[0] ?? null;
    return { meetings, closest, winsA: meetings.filter(game => game.winner === a).length, winsB: meetings.filter(game => game.winner === b).length,
        pointsA: meetings.reduce((sum, game) => sum + Math.round(gameScore(game, a) * 100), 0) / 100,
        pointsB: meetings.reduce((sum, game) => sum + Math.round(gameScore(game, b) * 100), 0) / 100,
        ties: meetings.filter(game => game.stage === 'regular' && game.winner === null && game.awayScore === game.homeScore).length,
        undecided: meetings.filter(game => game.winner === null && (game.stage === 'playoff' || game.awayScore !== game.homeScore)).length };
}
