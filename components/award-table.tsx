import React from 'react';
import Link from 'next/link';

interface Award {
    Award: string;
    Year: number;
    Winner: string;
    Team: string;
    PlayerID: number | null;
}

interface AwardTableProps {
    awardsData: Award[];
}

// table rendered on /awards/[award]
const AwardTable: React.FC<AwardTableProps> = ({ awardsData }) => {
    return (
        <div className="flex flex-col items-center w-fit md:w-full h-[75vh] overflow-y-auto overflow-x-auto rounded-b-lg mx-auto">
            <table className="text-nowrap shadow-md mb-4 border border-solid border-slate-400 items-center text-center table-auto text-slate-800 w-full">
                <thead>
                    <tr className="text-black text-[.8rem] md:text-[1.25rem] border border-solid border-slate-400 bg-sky-300">
                        <th className="px-4 py-2 w-1/3">Year</th>
                        <th className="px-4 py-2 w-1/3">Winner</th>
                        <th className="px-4 py-2 w-1/3">Team</th>
                    </tr>
                </thead>
                <tbody>
                    {awardsData.length > 0 ? (
                        awardsData.map((award, index) => (
                            <tr
                                key={index}
                                className="text-[.8rem] md:text-[1.25rem] border-t group border border-solid bg-white border-slate-300 hover:bg-sky-100 border-black/10"
                            >
                                <td className="px-4 py-2">{award.Year}</td>
                                <td className="px-4 py-2 group-hover:font-semibold">
                                    {award.PlayerID ? (
                                        <Link
                                            href={`/player/${award.PlayerID}`}
                                            passHref
                                            className="hover:underline"
                                        >
                                            {award.Winner}
                                        </Link>
                                    ) : (
                                        award.Winner
                                    )}
                                </td>
                                <td className="px-4 py-2">{award.Team}</td>
                            </tr>
                        ))
                    ) : (
                        <tr>
                            <td colSpan={3} className="px-4 py-2 text-center text-slate-500">
                                No awards found
                            </td>
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
    );
};

export default AwardTable;