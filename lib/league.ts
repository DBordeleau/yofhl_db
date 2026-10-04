// shared display helpers; league data itself lives in the database (see lib/data/league.ts)

export const LEADERBOARD_MODES = [
    { slug: 'all-time', label: 'All-Time' },
    { slug: 'single-season', label: 'Single-Season' },
];

export const LEADERBOARD_POSITIONS = ['All', 'C', 'LW', 'RW', 'D', 'G'];

// award names are stored with spaces; URLs use underscores (/awards/Wayne_Gretzky_Award)
export const awardSlug = (name: string) => name.replace(/ /g, "_");
export const awardFromSlug = (slug: string) => decodeURIComponent(slug).replace(/_/g, " ");

export const positionNames: { [key: string]: string } = {
    C: "Centre",
    LW: "Left Wing",
    RW: "Right Wing",
    D: "Defence",
    G: "Goaltender",
};

// splits "C,LW" or "C, LW" into ["C", "LW"]
export const splitPositions = (position: string) =>
    position.split(",").map((p) => p.trim()).filter(Boolean);

// 2023 -> "2022–23"
export const seasonLabel = (year: number) => `${year - 1}–${String(year).slice(2)}`;

export const formatFpts = (value: number) =>
    value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
