import { FC } from 'react';
import Link from 'next/link';

interface TeamStats {
    ID: number;
    Team: string;
    Abbreviation: string;
    Owner: string;
    Wins: number;
    Losses: number;
    FPF: number;
    Championships: string;
    Finals: string;
}

interface TeamStatTableProps {
    teamStats: TeamStats[];
}

const TeamStatTable: FC<TeamStatTableProps> = ({ teamStats }) => {
    return (
        <div className="flex flex-col items-center w-fit lg:w-full h-[75vh] overflow-y-scroll overflow-x-auto rounded-b-lg mx-auto">
            <table className="shadow-md border border-solid border-slate-400 text-center table-auto text-slate-800">
                <thead>
                    <tr className="text-black text-nowrap text-[.8rem] md:text-[1.25rem] border border-solid border-slate-400 bg-sky-300">
                        <th className="px-2 py-2 w-1/4 sm:w-1/3 md:w-1/4">Team</th>
                        <th className="px-2 py-2 w-1/6 sm:w-1/4 md:w-1/6 hidden sm:table-cell">Abbrev</th>
                        <th className="px-2 py-2 w-1/5 sm:w-1/4 md:w-1/5">Owner</th>
                        <th className="px-2 py-2 w-1/12 sm:w-1/6 md:w-1/12">Wins</th>
                        <th className="px-2 py-2 w-1/12 sm:w-1/6 md:w-1/12">Losses</th>
                        <th className="px-2 py-2 w-1/5 sm:w-1/3 md:w-1/5">FPF</th>
                        <th className="px-2 py-2 w-1/6 sm:w-1/3 md:w-1/6">Jagr Cups</th>
                        <th className="px-2 py-2 w-1/8 sm:w-1/12 md:w-1/12 lg:w-1/12 hidden sm:table-cell">
                            Finals
                        </th>
                    </tr>
                </thead>
                <tbody>
                    {teamStats.length > 0 ? (
                        teamStats.map((team) => (
                            <tr
                                key={team.ID}
                                className="text-[.75rem] lg:text-[1.25rem] border-t group border border-solid bg-white border-slate-300 hover:bg-sky-100 border-black/10">
                                <td className="px-2 py-2">
                                    <Link href={`/teams/${team.ID}`} className="hover:underline">
                                        {team.Team}
                                    </Link>
                                </td>
                                <td className="px-2 py-2 hidden sm:table-cell">{team.Abbreviation}</td>
                                <td className="px-2 py-2">{team.Owner}</td>
                                <td className="px-2 py-2">{team.Wins}</td>
                                <td className="px-2 py-2">{team.Losses}</td>
                                <td className="px-2 py-2">{team.FPF.toFixed(2)}</td>
                                <td className="px-2 py-2 sm:text-[.75rem] lg:text-[.9rem]">{team.Championships}</td>
                                <td className="px-2 py-2 sm:text-[.75rem] lg:text-[.9rem] hidden sm:table-cell overflow-x-auto">
                                    <div className="flex overflow-x-auto">
                                        {team.Finals}
                                    </div>
                                </td>
                            </tr>
                        ))
                    ) : (
                        <tr>
                            <td colSpan={9} className="px-2 py-2 text-center text-slate-500">
                                Loading...
                            </td>
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
    );
};

export default TeamStatTable;
