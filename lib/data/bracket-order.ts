// A bracket's drawing order (each game's slot): every round's games top to bottom so that a game sits beside the
// games that fed it, and the bracket draws without crossing lines. The season import and the season sync both
// slot playoff games by it, and the bracket on the season page draws them in slot order.

/**
 * Each round's games (the rounds in order) in drawing order. The round at `anchor` keeps the order given. A round
 * before it follows the round after it: for each of that round's games in order, the game its away team came
 * from, then its home team's. A round after it follows the round before it: for each of that round's games in
 * order, the game its teams went on to. Any game left over (one fed only by a bye) follows, in the order given.
 */
export function drawingOrder<Game>(rounds: Game[][], anchor: number, teams: (game: Game) => readonly unknown[]): Game[][] {
    const ordered = [...rounds];
    const beside = (games: Game[], neighbours: Game[]) => {
        const placed: Game[] = [];
        for (const neighbour of neighbours) {
            for (const team of teams(neighbour)) {
                const game = games.find(candidate => !placed.includes(candidate) && teams(candidate).includes(team));
                if (game) placed.push(game);
            }
        }
        return [...placed, ...games.filter(game => !placed.includes(game))];
    };
    for (let index = anchor - 1; index >= 0; index--) ordered[index] = beside(rounds[index], ordered[index + 1]);
    for (let index = anchor + 1; index < rounds.length; index++) ordered[index] = beside(rounds[index], ordered[index - 1]);
    return ordered;
}
