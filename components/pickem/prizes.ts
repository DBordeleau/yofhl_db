// Each Pick'em season's first place prize, by season year: shown on the Pick'em page and on the home page's matchups
const PRIZES: Record<number, { what: string; season: string }> = {
    2027: { what: 'Fee Waiver', season: '2027–28' },
};

export const pickemPrize = (seasonYear: number) => PRIZES[seasonYear] ?? null;
