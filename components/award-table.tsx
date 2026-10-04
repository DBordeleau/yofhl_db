import React from 'react';
import Link from 'next/link';
import type { AwardWinner } from '@/lib/data/league';
import { seasonLabel } from '@/lib/league';

interface AwardTableProps {
    awardsData: AwardWinner[];
    recipient?: 'team' | 'player';
}

const GRID = 'grid grid-cols-[72px_minmax(0,1fr)_minmax(0,1fr)] items-center gap-2.5 px-3.5 md:grid-cols-[110px_minmax(0,1fr)_minmax(0,1fr)] md:gap-4 md:px-6';

// table rendered on /awards/[award]
const AwardTable: React.FC<AwardTableProps> = ({ awardsData, recipient = 'player' }) => {
    return (
        <div className="overflow-hidden rounded-3xl border border-line bg-white shadow-card" role="table" aria-label="Award winners">
            <div className={`${GRID} min-h-12 border-b-2 border-ink text-[11px] font-bold uppercase tracking-[.12em] text-ink-muted md:text-xs`} role="row">
                <span role="columnheader">Season</span>
                <span role="columnheader">Winner</span>
                <span role="columnheader" className="text-right">{recipient === 'team' ? 'Owner' : 'Team'}</span>
            </div>
            {awardsData.length > 0 ? (
                awardsData.map((award, index) => {
                    return (
                        <div
                            key={`${award.Year}-${index}`}
                            role="row"
                            className={`${GRID} row-hover animate-rise min-h-[60px] border-b border-line-soft last:border-b-0`}
                            style={{ animationDelay: `${index * 40}ms` }}
                        >
                            <span role="cell" className="tabular font-bold">{seasonLabel(award.Year)}</span>
                            <span role="cell" className="min-w-0">
                                {award.PlayerID || (recipient === 'team' && award.TeamID) ? (
                                    <Link href={recipient === 'team' ? `/teams/${award.TeamID}` : `/player/${encodeURIComponent(award.PlayerID)}`} className="text-[15px] font-bold text-ink underline-offset-[3px] hover:text-rink-blue hover:underline md:text-[17px]">
                                        {award.Winner}
                                    </Link>
                                ) : (
                                    <span className="font-bold">{award.Winner}</span>
                                )}
                            </span>
                            <span role="cell" className="text-right text-sm font-semibold leading-snug text-ink-muted">
                                {recipient === 'team' ? award.Owner ?? '—' : award.TeamID ? <Link href={`/teams/${award.TeamID}`} className="hover:text-rink-blue hover:underline">{award.Team}</Link> : award.Team ?? '—'}
                            </span>
                        </div>
                    );
                })
            ) : (
                <div className="p-7 text-center text-ink-muted">No awards found</div>
            )}
        </div>
    );
};

export default AwardTable;
