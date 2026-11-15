'use client';

// One voted award's candidates with their stats, as the ballot and its admin preview show them: the top of the
// list by the sort column (FPts at first), sortable by any stat column, with a search across every candidate.
// `action` adds a control to each row (the ballot's rank picker).
import { useId, useState } from 'react';
import { candidateColumns, listCandidates, statValue, type CandidateColumn } from '@/lib/award-vote/candidate-list';
import type { BallotAward, PlayerCandidate, StatSetName } from '@/lib/award-vote/create-award-vote';

type Sort = { statSet: StatSetName; key: CandidateColumn['key']; ascending: boolean };

const format = (value: number | null, key: CandidateColumn['key']) =>
    value === null ? '—' : key === 'points' || key === 'perGame' ? value.toFixed(key === 'perGame' ? 2 : 1) : String(value);

export default function CandidateList({ award, action }: { award: BallotAward; action?: (candidate: PlayerCandidate) => React.ReactNode }) {
    const searchId = useId();
    const [search, setSearch] = useState('');
    const [sort, setSort] = useState<Sort>({ statSet: award.statSets[0].name, key: 'points', ascending: false });
    const columns = candidateColumns(award);
    const listed = listCandidates(award, { statSet: sort.statSet, sortBy: sort.key, ascending: sort.ascending, search });
    const truncated = !search.trim() && award.shown !== null && award.candidates.length > award.shown;
    const sortBy = (statSet: StatSetName, key: CandidateColumn['key']) => setSort(current =>
        current.statSet === statSet && current.key === key ? { ...current, ascending: !current.ascending } : { statSet, key, ascending: false });
    const hasStatSetHeaders = award.statSets.length > 1;
    const sortLabel = [hasStatSetHeaders && award.statSets.find(set => set.name === sort.statSet)?.label,
        columns.find(column => column.key === sort.key)?.label].filter(Boolean).join(' ');

    return <div>
        <label htmlFor={searchId} className="sr-only">Search {award.label} candidates</label>
        <input
            id={searchId} type="search" value={search} onChange={event => setSearch(event.target.value)} autoComplete="off"
            placeholder="Search every candidate"
            className="h-11 w-full max-w-sm rounded-xl border border-line-strong bg-white px-3.5 text-[15px] outline-none focus:border-rink-blue focus:shadow-[0_0_0_3px_rgba(31,111,194,.15)]"
        />
        {truncated && <p className="mt-2 text-sm text-ink-soft">Top {award.shown} by {sortLabel}{sort.ascending ? ', lowest first' : ''}. Search to find anyone else.</p>}
        <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-sm tabular-nums">
                <thead>
                    {hasStatSetHeaders && <tr className="text-xs uppercase text-ink-soft">
                        <th colSpan={action ? 3 : 2} />
                        {award.statSets.map(set => <th key={set.name} colSpan={columns.length} scope="colgroup" className="px-2 pb-1 text-left">{set.label}</th>)}
                    </tr>}
                    <tr className="border-b border-line text-left text-xs uppercase text-ink-soft">
                        {action && <th className="px-2 py-2"><span className="sr-only">Rank</span></th>}
                        <th scope="col" className="px-2 py-2">Player</th>
                        <th scope="col" className="px-2 py-2">Franchise</th>
                        {award.statSets.flatMap(set => columns.map(column => {
                            const active = sort.statSet === set.name && sort.key === column.key;
                            return <th key={`${set.name}-${column.key}`} scope="col" className="px-2 py-2 text-right"
                                aria-sort={active ? (sort.ascending ? 'ascending' : 'descending') : 'none'}>
                                <button type="button" onClick={() => sortBy(set.name, column.key)} className={`font-bold uppercase hover:text-ink ${active ? 'text-ink' : ''}`}>
                                    {column.label}{active ? (sort.ascending ? ' ↑' : ' ↓') : ''}
                                </button>
                            </th>;
                        }))}
                    </tr>
                </thead>
                <tbody>
                    {listed.map(candidate => <tr key={candidate.playerId} className="border-b border-line/60">
                        {action && <td className="px-2 py-1.5">{action(candidate)}</td>}
                        <th scope="row" className="px-2 py-1.5 text-left font-semibold">
                            {candidate.name}
                            <span className="ml-2 text-xs font-normal text-ink-soft">{candidate.positions.join(', ')}{candidate.nhlTeam ? ` · ${candidate.nhlTeam}` : ''}</span>
                        </th>
                        <td className="px-2 py-1.5">{candidate.team ? <abbr title={candidate.team.name} className="no-underline">{candidate.team.abbreviation}</abbr> : <span className="text-ink-soft">None</span>}</td>
                        {award.statSets.flatMap(set => columns.map(column =>
                            <td key={`${set.name}-${column.key}`} className="px-2 py-1.5 text-right">{format(statValue(candidate, set.name, column.key), column.key)}</td>))}
                    </tr>)}
                </tbody>
            </table>
            {!listed.length && <p className="mt-3 text-sm text-ink-soft">{search.trim() ? 'No candidate by that name.' : 'No candidates.'}</p>}
        </div>
    </div>;
}
