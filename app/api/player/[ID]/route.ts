import prisma from '@/lib/db';

// maps franchise IDs to all abbreviations that are historically associated with the franchise ID
const teamMap: { [key: string]: string[] } = {
    "1": ["HCHH", "PVLS"],
    "2": ["NPD"],
    "3": ["STEG", "STEC", "HH"],
    "4": ["VWIZ"],
    "5": ["JAGR"],
    "6": ["WWE", "ORCA", "TEEHAW"],
    "7": ["Lali"],
    "8": ["SEED", "SKGS"],
    "9": ["WTURR", "Reaper", "Reapers"],
    "10": ["ASI", "RP"],
    "11": ["NFLD"],
    "12": ["DGWY", "MAC", "NKN"],
    "13": ["JUBA", "MEAT", "HUNG"],
    "14": ["JTPJ"],
};

// gets team ID based on the abbreviation
// this is used to generate abbreviation links to team page for old abbreviations
const getTeamIDFromMap = (abbreviation: string): string | null => {
    for (const [teamID, abbreviations] of Object.entries(teamMap)) {
        if (abbreviations.includes(abbreviation)) {
            return teamID;
        }
    }
    return null;
};

export async function GET(request: Request, { params }: { params: Promise<{ ID: string }> }) {
    const { ID } = await params;

    if (!ID) {
        return new Response(JSON.stringify({ error: 'Player ID is required' }), { status: 400 });
    }

    try {
        const playerStats = await prisma.player_stats.findMany({
            where: { ID },
            orderBy: { Year: 'asc' },
            select: {
                Year: true,
                Age: true,
                Position: true,
                FPts: true,
                FPG: true,
                Champion: true,
                YOFHLTeam: true,
                Player: true,
            },
        });

        // use the teamMap to associate abbrevs with correct ID
        const playerStatsWithTeamIDs = playerStats.map((stat) => ({
            ...stat,
            TeamID: getTeamIDFromMap(stat.YOFHLTeam) || null,
        }));

        // get player awards for trophy case
        const awards = await prisma.awards.findMany({
            where: { Winner: ID },
            orderBy: { Year: 'asc' },
            select: {
                Award: true,
                Year: true,
            },
        });

        if (playerStatsWithTeamIDs.length === 0 && awards.length === 0) {
            return new Response(JSON.stringify({ error: 'No stats or awards found for this player' }), { status: 404 });
        }

        return new Response(JSON.stringify({ playerStats: playerStatsWithTeamIDs, awards }), { status: 200 });
    } catch (error) {
        console.error(error);
        return new Response(JSON.stringify({ error: 'An error occurred while fetching player data' }), { status: 500 });
    }
}