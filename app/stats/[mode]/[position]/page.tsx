'use client';

import { useEffect, useState } from 'react';
import React from 'react';
import { useSearchParams } from 'next/navigation';  // Import useSearchParams
import StatTable from '@/components/stat-table';
import SearchBar from '@/components/search-bar';
import PaginationControls from '@/components/pagination-controls';
import { motion } from 'framer-motion';
import Link from 'next/link';  // Use Link for client-side navigation

export default function StatsPage() {
    const searchParams = useSearchParams();
    const initialMode = searchParams.get('mode') || 'all-time';
    const initialPosition = searchParams.get('position') || 'all';

    const [topPlayers, setTopPlayers] = useState([]);
    const [currentPage, setCurrentPage] = useState(1);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [maxPages, setMaxPages] = useState(100);
    const [mode, setMode] = useState<string>(initialMode);
    const [position, setPosition] = useState<string>(initialPosition);

    useEffect(() => {
        setMode(initialMode);
        setPosition(initialPosition);
    }, [initialMode, initialPosition]);

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true); // Start loading
            const query = searchQuery ? `&player=${searchQuery}` : '';
            const res = await fetch(`/api/stats/${mode}/${position}?page=${currentPage}${query}`);
            const data = await res.json();
            setTopPlayers(data.players);

            // pagination limit calculated by ID for all-time mode and by length of data for single season
            setMaxPages(data.maxPages);
            setLoading(false);
        };

        if (mode && position) {
            fetchData();
        }
    }, [mode, position, currentPage, searchQuery]); // re-fetch data whenever mode, position, page, or searchQuery changes

    return (
        <div className="flex flex-col items-center p-4 overflow-x-hidden">
            <h1 className="text-[1.25rem] lg:text-3xl -mt-2 font-semibold mb-4">
                Fantasy Points - {mode === 'all-time' ? 'All-Time' : 'Single-Season'}
            </h1>
            <nav className="flex gap-x-4 items-center mb-4">
                {['All-Time', 'Single-Season'].map((m) => (
                    <Link
                        key={m}
                        href={{
                            pathname: '/stats',
                            query: { mode: m.toLowerCase(), position },
                        }}
                        className={`shadow-md items-center text-center text-[.85rem] lg:text-[1rem] px-4 py-2 rounded-full transition-all cursor-pointer border-black ${mode === m.toLowerCase()
                            ? 'bg-sky-300 hover:bg-sky-500 text-slate'
                            : 'bg-gray-200 hover:bg-gray-300 text-black'
                            }`}
                    >
                        {m}
                    </Link>
                ))}
            </nav>
            <nav className="flex gap-x-4 items-center mb-4">
                {['All', 'C', 'LW', 'RW', 'D', 'G'].map((pos) => (
                    <Link
                        key={pos}
                        href={{
                            pathname: '/stats',
                            query: { mode, position: pos.toLowerCase() },
                        }}
                        className={`shadow-md items-center text-center text-[.75rem] lg:text-[1rem] px-4 py-2 rounded-full transition-all cursor-pointer border-black ${position === pos.toLowerCase()
                            ? 'bg-sky-300 hover:bg-sky-500 text-slate'
                            : 'bg-gray-200 hover:bg-gray-300 text-black'
                            }`}
                    >
                        {pos}
                    </Link>
                ))}
            </nav>
            <div className="flex justify-center mt-4 mb-4">
                <PaginationControls
                    currentPage={currentPage}
                    setCurrentPage={setCurrentPage}
                    maxPages={maxPages}
                />
            </div>
            <motion.div
                className="flex flex-col w-full items-center"
                initial={{ opacity: 0, y: 100 }}
                animate={{ opacity: 1, y: 0 }}
            >
                <SearchBar searchQuery={searchQuery} setSearchQuery={setSearchQuery} />
                {loading ? (
                    <div>Loading...</div>
                ) : (
                    <>
                        {mode === 'single-season' && (
                            <div className="flex flex-wrap md:flex-nowrap justify-center items-center gap-2 mb-4">
                                <div className="flex items-center gap-1">
                                    <div className="w-4 h-4 bg-yellow-400 border-2 border-black"></div>
                                    <p className="text-[.7rem] md:text-[.75rem] lg:text-sm text-slate-700 mr-5">
                                        - Denotes the player won an individual award that season
                                    </p>
                                </div>
                                <div className="flex items-center gap-1">
                                    <div className="w-4 h-4 bg-red-300 border-2 border-black"></div>
                                    <p className="text-[.7rem] md:text-[.75rem] lg:text-sm text-slate-700">
                                        - Denotes the player won multiple individual awards that season
                                    </p>
                                </div>
                            </div>
                        )}
                        <StatTable
                            mode={mode}
                            topPlayers={topPlayers}
                            currentPage={currentPage}
                            searchQuery={searchQuery}
                        />
                    </>
                )}
            </motion.div>
        </div>
    );
}