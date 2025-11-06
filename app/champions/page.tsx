'use client'
import Link from "next/link";
import { FaLink } from "react-icons/fa6";
import { motion } from "framer-motion";

// displays jagr cup winning teams and owners by year at /champions
// hard-coded because Fantrax doesn't give us this information and putting it into a CSV to import into the database seemed unneccessary.
export default function ChampionPage() {
    return (
        <main className="relative overflow-hidden overflow-y-hidden z-10 flex flex-col gap-y-2 lg:gap-y-5 items-center pt-2 text-center bg-transparent">
            <h1 className="text-[1.25rem] lg:text-3xl font-semibold">Jagr Cup Champions</h1>
            <p>* - 2019-2020 Playoffs cancelled due to COVID-19 pandemic.</p>
            <div className="flex flex-col w-full items-center mb-4">
                <div className="flex flex-col items-center w-full max-w-7xl h-[75vh] overflow-y-auto overflow-x-auto rounded-b-lg mx-auto">
                    <motion.div
                        className="flex flex-col w-full items-center"
                        initial={{ opacity: 0, y: 100 }}
                        animate={{ opacity: 1, y: 0 }}>
                        <table className="text-[.75rem] md:text-[1.25rem] shadow-md mb-4 border border-collapse border-solid border-slate-400 items-center text-center table-auto text-slate-800 w-full">
                            <thead>
                                <tr className="text-black border border-solid border-slate-400 bg-sky-300">
                                    <th className="px-2 py-2 w-1/4">Season</th>
                                    <th className="px-2 py-2 w-1/4 sm:w-1/4">Champions</th>
                                    <th className="px-2 py-2 w-1/4 sm:w-1/6">Owner</th>
                                    <th className="px-2 py-2 w-1/8 sm:w-1/5">Roster</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr className="bg-white border-t group border border-solid border-slate-300 border-black/10">
                                    <td className="px-2 py-2">2024-2025</td>
                                    <td className="px-2 py-2">Hamhung Hall Monitors</td>
                                    <td className="px-2 py-2">Andrew Halstad</td>
                                    <td className="p-0">
                                        <Link href="/champions/2025">
                                            <div className="flex items-center justify-center h-full">
                                                <FaLink className="text-black" title="Link to Roster Table" />
                                            </div>
                                        </Link>
                                    </td>
                                </tr>
                                <tr className="bg-white border-t group border border-solid border-slate-300 border-black/10">
                                    <td className="px-2 py-2">2023-2024</td>
                                    <td className="px-2 py-2">Varrock Dark Wizards</td>
                                    <td className="px-2 py-2">Dillon Bordeleau</td>
                                    <td className="p-0">
                                        <Link href="/champions/2024">
                                            <div className="flex items-center justify-center h-full">
                                                <FaLink className="text-black" title="Link to Roster Table" />
                                            </div>
                                        </Link>
                                    </td>
                                </tr>
                                <tr className="bg-white border-t group border border-solid border-slate-300 border-black/10">
                                    <td className="px-2 py-2">2022-2023</td>
                                    <td className="px-2 py-2">Jagrtown Icefellas</td>
                                    <td className="px-2 py-2">Nick Kavanagh</td>
                                    <td className="p-0">
                                        <Link href="/champions/2023">
                                            <div className="flex items-center justify-center h-full">
                                                <FaLink className="text-black" title="Link to Roster Table" />
                                            </div>
                                        </Link>
                                    </td>
                                </tr>
                                <tr className="bg-white border-t group border border-solid border-slate-300 border-black/10">
                                    <td className="px-2 py-2">2021-2022</td>
                                    <td className="px-2 py-2">Jagrtown Icefellas</td>
                                    <td className="px-2 py-2">Nick Kavanagh</td>
                                    <td className="p-0">
                                        <Link href="/champions/2022">
                                            <div className="flex items-center justify-center h-full">
                                                <FaLink className="text-black" title="Link to Roster Table" />
                                            </div>
                                        </Link>
                                    </td>
                                </tr>
                                <tr className="bg-white border-t group border border-solid border-slate-300 border-black/10">
                                    <td className="px-2 py-2">2020-2021</td>
                                    <td className="px-2 py-2">Hub City Hyman Hounds</td>
                                    <td className="px-2 py-2">Sean Crocker</td>
                                    <td className="p-0">
                                        <Link href="/champions/2021">
                                            <div className="flex items-center justify-center h-full">
                                                <FaLink className="text-black" title="Link to Roster Table" />
                                            </div>
                                        </Link>
                                    </td>
                                </tr>
                                <tr className="bg-white border-t group border border-solid border-slate-300 border-black/10">
                                    <td className="px-2 py-2">2018-2019</td>
                                    <td className="px-2 py-2">Hub City Hyman Hounds</td>
                                    <td className="px-2 py-2">Sean Crocker</td>
                                    <td className="p-0">
                                        <Link href="/champions/2019">
                                            <div className="flex items-center justify-center h-full">
                                                <FaLink className="text-black" title="Link to Roster Table" />
                                            </div>
                                        </Link>
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </motion.div>.
                </div>
            </div>
        </main>
    );
}
