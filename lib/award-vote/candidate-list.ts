// Which of a ballot award's candidates a list shows, and in what order: every candidate ranked by any stat column (FPts
// by default) and cut to the top 50 of that ranking (everyone for an award that shows all), or every candidate whose
// name matches a search. Also which values lead their column, across the award's whole list.
// Pure and free of server imports, so the ballot and its admin preview run it in the browser.
import type { BallotAward, GoalieLine, PlayerCandidate, SkaterLine, StatLine, StatSetName } from './model';

type Group = StatLine['group'];
/** a stat line's own categories, and those worked out from them (`DERIVED`) */
type StatKey = Exclude<keyof SkaterLine | keyof GoalieLine, 'group'> | 'goalsAndAssists';

export interface CandidateColumn {
    key: StatKey;
    label: string;
    /** the position group the column belongs to, or null for one every candidate has */
    group: Group | null;
}

/** the columns worked out from a line rather than stored: a skater's points (P), their goals and assists */
const DERIVED: Partial<Record<StatKey, (line: StatLine) => number | null>> = {
    goalsAndAssists: line => line.group === 'skater' ? line.goals + line.assists : null,
};

/**
 * skaters show FPts, FP/G, GP, G, A, P, SOG, Hit and Blk; goalies FPts, FP/G, GP, W, OL+ShL, GA, SV, SV% and SHO, of
 * which OL+ShL, GA, SV and SV% only when the season's league scores them
 */
export const CANDIDATE_COLUMNS: readonly CandidateColumn[] = [
    { key: 'points', label: 'FPts', group: null },
    { key: 'perGame', label: 'FP/G', group: null },
    { key: 'gamesPlayed', label: 'GP', group: null },
    { key: 'goals', label: 'G', group: 'skater' },
    { key: 'assists', label: 'A', group: 'skater' },
    { key: 'goalsAndAssists', label: 'P', group: 'skater' },
    { key: 'shots', label: 'SOG', group: 'skater' },
    { key: 'hits', label: 'Hit', group: 'skater' },
    { key: 'blocks', label: 'Blk', group: 'skater' },
    { key: 'wins', label: 'W', group: 'goalie' },
    { key: 'overtimeLosses', label: 'OL+ShL', group: 'goalie' },
    { key: 'goalsAgainst', label: 'GA', group: 'goalie' },
    { key: 'saves', label: 'SV', group: 'goalie' },
    { key: 'savePercentage', label: 'SV%', group: 'goalie' },
    { key: 'shutouts', label: 'SHO', group: 'goalie' },
];

/** the columns no value leads in: fewer goals against is better, so it is never bolded */
const NO_LEADER: ReadonlySet<StatKey> = new Set(['goalsAgainst']);

/**
 * the columns an award's list needs: the shared ones, then those of each position group among its candidates that
 * the group's lines have (a goalie category the season's league didn't score is in none)
 */
export function candidateColumns(award: BallotAward): CandidateColumn[] {
    const lines = award.candidates.flatMap(candidate => Object.values(candidate.stats));
    return CANDIDATE_COLUMNS.filter(column => column.group === null
        || lines.some(line => line!.group === column.group && (column.key in DERIVED || column.key in line!)));
}

/** a candidate's value in one column of one stat set, or null where the column doesn't apply */
export function statValue(candidate: PlayerCandidate, statSet: StatSetName, key: StatKey): number | null {
    const line = candidate.stats[statSet];
    if (!line) return null;
    const derived = DERIVED[key];
    if (derived) return derived(line);
    return (line as Partial<Record<StatKey, number | null>>)[key] ?? null;
}

/**
 * Whether a candidate's value leads its column of a stat set: the highest in it across the award's whole candidate
 * list (whatever the list shows), ties all leading. Goals against never leads, nor does any value of a column no
 * candidate has a value in.
 */
export function statLeaders(award: BallotAward): (candidate: PlayerCandidate, statSet: StatSetName, key: StatKey) => boolean {
    const best = new Map<string, number>();
    for (const { name: statSet } of award.statSets) {
        for (const { key } of CANDIDATE_COLUMNS) {
            if (NO_LEADER.has(key)) continue;
            const values = award.candidates.map(candidate => statValue(candidate, statSet, key)).filter(value => value !== null);
            if (values.length) best.set(`${statSet} ${key}`, Math.max(...values));
        }
    }
    return (candidate, statSet, key) => {
        const value = statValue(candidate, statSet, key);
        return value !== null && value === best.get(`${statSet} ${key}`);
    };
}

export interface CandidateListView {
    /** the stat set to sort by; the award's first by default */
    statSet?: StatSetName;
    /** FPts by default */
    sortBy?: StatKey;
    /** highest first by default */
    ascending?: boolean;
    /** a name, or part of one; empty for the top of the list */
    search?: string;
}

const normalize = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** every candidate ranked by the sort column, cut to the award's top `shown` (all for an award that shows everyone),
 * or every candidate whose name matches a search, in the same order */
export function listCandidates(award: BallotAward, { statSet = award.statSets[0].name, sortBy = 'points', ascending = false, search = '' }: CandidateListView = {}): PlayerCandidate[] {
    const query = normalize(search);
    // a candidate the column doesn't apply to goes last either way; ties keep the FPts order
    const ranked = award.candidates.map((candidate, index) => ({ candidate, index, value: statValue(candidate, statSet, sortBy) }))
        .sort((a, b) => a.value === null || b.value === null
            ? (a.value === null ? 1 : 0) - (b.value === null ? 1 : 0) || a.index - b.index
            : (ascending ? a.value - b.value : b.value - a.value) || a.index - b.index)
        .map(({ candidate }) => candidate);
    if (query) return ranked.filter(candidate => normalize(candidate.name).includes(query));
    return award.shown === null ? ranked : ranked.slice(0, award.shown);
}
