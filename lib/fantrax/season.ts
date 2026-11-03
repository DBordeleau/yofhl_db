// Fantrax and the NHL name a season by the year it starts in; past this adapter every
// season is named by its season year, the year it ends in (GLOSSARY.md, "Season year").

export const seasonYearFromFantrax = (startYear: number) => startYear + 1;

/** the scoring totals Fantrax's stats table offers for a season */
export const fantraxSeasonName = (year: number) => `${year - 1}-${String(year).slice(-2)} Reg Season - YTD`;

/** the NHL API's season id, such as 20262027 */
export const nhlSeasonId = (year: number) => (year - 1) * 10000 + year;
