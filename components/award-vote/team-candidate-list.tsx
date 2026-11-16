// GM of the Year's candidates, as the ballot and its admin preview show them: each team season under that season's
// name and owner, with its record, FPts for and playoff finish beside the season before.
// `action` adds a control to each row (the ballot's rank picker).
import { Fragment } from 'react';
import { formatFpts } from '@/lib/league';
import type { PlayoffFinish, TeamCandidate, TeamSeasonLine } from '@/lib/award-vote/model';

const FINISHES: Record<PlayoffFinish, string> = {
    champion: 'Champion',
    finalist: 'Finalist',
    semifinalist: 'Semifinalist',
    quarterfinalist: 'Quarterfinalist',
    missed: 'Missed playoffs',
};

const SEASONS = [{ key: 'season', label: 'This season' }, { key: 'previous', label: 'Last season' }] as const;

function SeasonCells({ line }: { line: TeamSeasonLine | null }) {
    if (!line) return <td colSpan={3} className="px-2 py-1.5 text-ink-soft">Didn’t play</td>;
    return <>
        <td className="px-2 py-1.5">{line.wins}-{line.losses}-{line.ties}</td>
        <td className="px-2 py-1.5 text-right">{formatFpts(line.fptsFor)}</td>
        <td className="px-2 py-1.5">{FINISHES[line.playoffFinish]}</td>
    </>;
}

export default function TeamCandidateList({ candidates, action }: { candidates: TeamCandidate[]; action?: (candidate: TeamCandidate) => React.ReactNode }) {
    return <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-sm tabular-nums">
            <thead>
                <tr className="text-xs uppercase text-ink-soft">
                    <th colSpan={action ? 2 : 1} />
                    {SEASONS.map(season => <th key={season.key} colSpan={3} scope="colgroup" className="px-2 pb-1 text-left">{season.label}</th>)}
                </tr>
                <tr className="border-b border-line text-left text-xs uppercase text-ink-soft">
                    {action && <th className="px-2 py-2"><span className="sr-only">Rank</span></th>}
                    <th scope="col" className="px-2 py-2">Team</th>
                    {SEASONS.map(season => <Fragment key={season.key}>
                        <th scope="col" className="px-2 py-2">W-L-T</th>
                        <th scope="col" className="px-2 py-2 text-right">FPts</th>
                        <th scope="col" className="px-2 py-2">Playoffs</th>
                    </Fragment>)}
                </tr>
            </thead>
            <tbody>
                {candidates.map(candidate => <tr key={candidate.teamSeasonId} className="border-b border-line/60">
                    {action && <td className="px-2 py-1.5">{action(candidate)}</td>}
                    <th scope="row" className="px-2 py-1.5 text-left font-semibold">
                        {candidate.name}
                        {candidate.owner && <span className="ml-2 text-xs font-normal text-ink-soft">{candidate.owner}</span>}
                    </th>
                    <SeasonCells line={candidate.summary.season} />
                    <SeasonCells line={candidate.summary.previous} />
                </tr>)}
            </tbody>
        </table>
    </div>;
}
