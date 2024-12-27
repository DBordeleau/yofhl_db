import prisma from '@/lib/db';

// returns and filters player stats, award and championship info for all-time and single season modes at /stats/[mode]/[position]
export async function GET(request: Request, { params }: { params: Promise<{ mode: string; position: string }> }) {
    const url = new URL(request.url);
    const page = parseInt(url.searchParams.get('page') || '1', 10); // default to page 1
    const itemsPerPage = 25; // hardcoded to 25 results per page, might make this dynamic and set by user
    const skip = (page - 1) * itemsPerPage;

    const { mode, position } = await params;
    console.log('Resolved Mode:', mode, 'Position:', position); // logs mode and position filters to console for debugging

    const filter: { Position?: { contains: string }; Player?: { contains: string }; FPts?: { gt: number } } = {};

    if (position !== 'all') {
        filter.Position = { contains: position.toUpperCase() };
    }

    const playerQuery = url.searchParams.get('player');
    if (playerQuery) {
        filter.Player = { contains: playerQuery };
    }

    filter.FPts = { gt: 0 }; // don't display stats if the player scored 0 points that year

    try {
        // all-time mode data filtering logic
        if (mode === 'all-time') {
            // pagination based on # of unique IDs in all-time mode, not just length of data
            const totalUniquePlayers = await prisma.player_stats.groupBy({
                by: ['ID'],
                where: filter,
            });

            console.log('Total Unique Players:', totalUniquePlayers.length);
            const maxPages = Math.ceil(totalUniquePlayers.length / itemsPerPage);
            console.log('Max Pages:', maxPages);

            // group by player ID and sum stats for all-time mode
            const topPlayers = await prisma.player_stats.groupBy({
                by: ['ID'],
                _sum: { FPts: true },
                _avg: { FPG: true }, // currently not using FPG sum anywhere on site. We don't track games played data so it does not work properly except in single-season context
                where: filter,
                orderBy: { _sum: { FPts: 'desc' } },
                skip,
                take: itemsPerPage,
            });

            const playerIds = topPlayers.map(player => player.ID);
            const playersDetails = await prisma.player_stats.findMany({
                where: {
                    ID: { in: playerIds },
                },
                select: {
                    ID: true,
                    Player: true,
                    Position: true,
                    Year: true,
                    Champion: true,
                },
                orderBy: {
                    Year: 'desc',
                }
            });

            // count championships won for trophy rendering in all-time mode
            const playersGrouped = playersDetails.reduce(
                (acc: { [key: string]: { Player: string; Positions: Set<string>; ChampionshipsWon: number } }, player) => {
                    if (!acc[player.ID]) {
                        acc[player.ID] = {
                            Player: player.Player,
                            Positions: new Set<string>(), //typescript gets mad if this isnt explicitly typed here
                            ChampionshipsWon: 0,
                        };
                    }

                    player.Position.split(',').forEach(position => {
                        acc[player.ID].Positions.add(position.trim());
                    });

                    if (player.Champion) {
                        acc[player.ID].ChampionshipsWon++;
                    }

                    return acc;
                },
                {} as { [key: string]: { Player: string; Positions: Set<string>; ChampionshipsWon: number } }
            );

            const players = topPlayers.map(player => {
                const playerDetails = playersGrouped[player.ID];
                return {
                    ID: player.ID,
                    Player: playerDetails.Player,
                    Position: Array.from(playerDetails.Positions).join(', '),
                    FPts: player._sum.FPts,
                    FPG: player._avg.FPG ? player._avg.FPG.toFixed(2) : 'N/A',
                    ChampionshipsWon: playerDetails.ChampionshipsWon,
                };
            });

            return new Response(JSON.stringify({ players, maxPages }), { status: 200 });

        }
        // single-season data filtering logic
        else if (mode === 'single-season') {
            const totalPlayers = await prisma.player_stats.count({
                where: filter
            });
            console.log('Total Players:', totalPlayers);
            const maxPages = Math.ceil(totalPlayers / itemsPerPage);
            console.log('Max Pages:', maxPages);

            const topPlayers = await prisma.player_stats.findMany({
                where: filter,
                orderBy: { FPts: 'desc' },
                skip,
                take: itemsPerPage,
            });

            const playerIds = topPlayers.map(player => player.ID);
            const awards = await prisma.awards.findMany({
                where: {
                    Winner: { in: playerIds },
                    Year: { in: topPlayers.map(player => player.Year) }
                }
            });

            const awardsCountByPlayer: { [key: string]: number } = awards.reduce((acc, award) => {
                const key = `${award.Winner}-${award.Year}`;
                if (acc[key]) {
                    acc[key]++;
                } else {
                    acc[key] = 1;
                }
                return acc;
            }, {} as { [key: string]: number });

            const players = topPlayers.map((player) => {
                const playerIdYear = `${player.ID}-${player.Year}`;
                const awardCount = awardsCountByPlayer[playerIdYear] || 0;
                const hasMultipleAwards = awardCount > 1;

                return {
                    ID: player.ID,
                    Player: player.Player,
                    Position: player.Position,
                    FPts: player.FPts,
                    FPG: player.FPG.toFixed(2),
                    Year: player.Year,
                    hasAward: awardCount > 0,
                    hasMultipleAwards,
                    Champion: player.Champion,
                };
            });

            return new Response(JSON.stringify({ players, maxPages }), { status: 200 });
        } else {
            return new Response(JSON.stringify({ error: 'Invalid mode' }), { status: 400 });
        }
    } catch {
        return new Response(JSON.stringify({ error: 'Failed to fetch data' }), { status: 500 });
    }
}