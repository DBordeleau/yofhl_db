'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import PlayerComparisonGraph, { COMPARE_COLORS } from '@/components/player-comparison-graph';
import PageTitle from '@/components/page-title';
import RinkDivider from '@/components/rink-divider';
import { FaSearch, FaTimes, FaChartLine } from 'react-icons/fa';

interface Player {
    ID: string;
    Player: string;
}

interface PlayerStats {
    Year: number;
    FPts: number;
    FPG: number;
    YOFHLTeam: string;
    Player: string;
}

export default function ComparisonPage() {
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<Player[]>([]);
    const [selectedPlayers, setSelectedPlayers] = useState<Player[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [showComparison, setShowComparison] = useState(false);
    const [comparisonData, setComparisonData] = useState<Record<string, PlayerStats[]>>({});

    // Check for pre-selected player from sessionStorage on mount
    useEffect(() => {
        const preSelectedPlayer = sessionStorage.getItem('comparePlayer');
        if (preSelectedPlayer) {
            try {
                const player = JSON.parse(preSelectedPlayer);
                setSelectedPlayers([player]);
                sessionStorage.removeItem('comparePlayer'); // Clean up after use
            } catch (error) {
                console.error('Error parsing pre-selected player:', error);
            }
        }
    }, []);

    // Debounced search function
    const performSearch = useCallback(async (query: string) => {
        if (query.length < 3) {
            setSearchResults([]);
            setIsSearching(false);
            return;
        }

        setIsSearching(true);
        try {
            const res = await fetch(`/api/players/search?q=${encodeURIComponent(query)}`);
            const data = await res.json();
            setSearchResults(data.players || []);
        } catch (error) {
            console.error('Error searching players:', error);
            setSearchResults([]);
        } finally {
            setIsSearching(false);
        }
    }, []);

    // Debounce effect - waits 300ms after user stops typing
    useEffect(() => {
        const debounceTimer = setTimeout(() => {
            if (searchQuery.length >= 3) {
                performSearch(searchQuery);
            } else if (searchQuery.length === 0) {
                setSearchResults([]);
                setIsSearching(false);
            }
        }, 300);

        return () => clearTimeout(debounceTimer);
    }, [searchQuery, performSearch]);

    // Handle input change
    const handleSearchChange = (query: string) => {
        setSearchQuery(query);

        if (query.length >= 3) {
            setIsSearching(true);
        } else {
            setSearchResults([]);
            setIsSearching(false);
        }
    };

    // Add player to comparison
    const addPlayer = (player: Player) => {
        if (selectedPlayers.length >= 5) {
            alert('Maximum 5 players can be compared at once');
            return;
        }

        if (selectedPlayers.find(p => p.ID === player.ID)) {
            alert('Player already added to comparison');
            return;
        }

        setSelectedPlayers([...selectedPlayers, player]);
        setSearchQuery('');
        setSearchResults([]);
    };

    // Remove player from comparison
    const removePlayer = (playerID: string) => {
        setSelectedPlayers(selectedPlayers.filter(p => p.ID !== playerID));
        setShowComparison(false);
    };

    // Fetch data and initiate comparison
    const handleCompare = async () => {
        if (selectedPlayers.length < 2) {
            alert('Please select at least 2 players to compare');
            return;
        }

        try {
            const data: Record<string, PlayerStats[]> = {};

            // Fetch stats for all selected players
            for (const player of selectedPlayers) {
                const res = await fetch(`/api/players/${encodeURIComponent(player.ID)}`);
                const playerData = await res.json();
                data[player.ID] = playerData.playerStats || [];
            }

            setComparisonData(data);
            setShowComparison(true);
        } catch (error) {
            console.error('Error fetching comparison data:', error);
            alert('Error loading player data. Please try again.');
        }
    };

    const panel = 'absolute z-20 mt-2 w-full rounded-2xl border border-line bg-white p-4 text-center text-ink-muted shadow-[0_24px_48px_-24px_rgba(31,39,69,.45)]';

    return (
        <main className="mx-auto max-w-page 3xl:max-w-page-3xl 4xl:max-w-page-4xl px-4 pb-16 pt-8 md:px-8 md:pt-12">
            <PageTitle eyebrow="Head to Head" title="Compare Players" />
            <RinkDivider />
            <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.45, ease: [0.2, 0.8, 0.2, 1] }}
                className="mx-auto w-full max-w-4xl"
            >
                {/* Search Bar */}
                <div className="relative mb-6">
                    <label className="flex h-[52px] items-center gap-3 rounded-2xl border border-line-strong bg-white px-4 text-ink-muted focus-within:border-rink-blue focus-within:shadow-[0_0_0_3px_rgba(31,111,194,.15)]">
                        <FaSearch aria-hidden="true" />
                        <span className="sr-only">Search for players to compare</span>
                        <input
                            type="search"
                            value={searchQuery}
                            onChange={(e) => handleSearchChange(e.target.value)}
                            placeholder="Search players to compare"
                            className="w-full bg-transparent text-base text-ink outline-none placeholder:text-ink-faint"
                        />
                    </label>

                    {/* Search Results Dropdown */}
                    {searchResults.length > 0 && (
                        <motion.div
                            initial={{ opacity: 0, y: -10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="absolute z-20 mt-2 max-h-72 w-full overflow-y-auto rounded-2xl border border-line bg-white p-1.5 shadow-[0_24px_48px_-24px_rgba(31,39,69,.45)]"
                        >
                            {searchResults.map((player) => (
                                <button
                                    key={player.ID}
                                    type="button"
                                    onClick={() => addPlayer(player)}
                                    className="flex min-h-11 w-full items-center rounded-xl px-3.5 text-left font-semibold text-ink hover:bg-rink-wash"
                                >
                                    {player.Player}
                                </button>
                            ))}
                        </motion.div>
                    )}

                    {/* Show searching state or hint */}
                    {isSearching && searchQuery.length >= 3 && (
                        <div className={panel}>Searching...</div>
                    )}

                    {/* Show hint when query is too short */}
                    {searchQuery.length > 0 && searchQuery.length < 3 && (
                        <div className={`${panel} text-sm`}>Type at least 3 characters to search</div>
                    )}

                    {/* Show no results message */}
                    {!isSearching && searchQuery.length >= 3 && searchResults.length === 0 && (
                        <div className={panel}>No players found</div>
                    )}
                </div>

                {/* Selected Players */}
                <div className="mb-6">
                    <h2 className="mb-3 text-xs font-bold uppercase tracking-[.14em] text-ink-muted">
                        Selected <span className="tabular">{selectedPlayers.length}/5</span>
                    </h2>

                    {selectedPlayers.length === 0 ? (
                        <div className="rounded-2xl border-2 border-dashed border-line-strong py-8 text-center font-semibold text-ink-faint">
                            No players selected
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                            {selectedPlayers.map((player, index) => (
                                <motion.div
                                    key={player.ID}
                                    initial={{ opacity: 0, scale: 0.94 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    className="flex min-h-14 items-center justify-between gap-3 rounded-2xl border border-line bg-white pl-4 pr-1.5 shadow-card"
                                >
                                    <span className="flex items-center gap-3 font-bold">
                                        <span className="h-3 w-3 flex-none rounded-full" style={{ background: COMPARE_COLORS[index % COMPARE_COLORS.length] }} />
                                        {player.Player}
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => removePlayer(player.ID)}
                                        className="inline-flex h-11 w-11 items-center justify-center rounded-xl text-ink-muted transition-colors hover:bg-award-multi hover:text-rink-red"
                                        aria-label={`Remove ${player.Player}`}
                                    >
                                        <FaTimes aria-hidden="true" />
                                    </button>
                                </motion.div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Compare Button - Always visible but disabled if < 2 players */}
                <button
                    type="button"
                    onClick={handleCompare}
                    disabled={selectedPlayers.length < 2}
                    className="flex min-h-[56px] w-full items-center justify-center gap-3 rounded-2xl bg-ink text-base font-bold text-white transition-colors hover:bg-[#232C4A] disabled:cursor-not-allowed disabled:bg-line disabled:text-ink-faint"
                >
                    <FaChartLine aria-hidden="true" />
                    {selectedPlayers.length < 2
                        ? `Select ${2 - selectedPlayers.length} more player${2 - selectedPlayers.length === 1 ? '' : 's'}`
                        : 'Compare Players'
                    }
                </button>

                {/* Comparison Graph */}
                {showComparison && (
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="mt-8"
                    >
                        <PlayerComparisonGraph
                            playersData={comparisonData}
                            playerNames={selectedPlayers.reduce((acc, p) => {
                                acc[p.ID] = p.Player;
                                return acc;
                            }, {} as Record<string, string>)}
                        />
                    </motion.div>
                )}
            </motion.div>
        </main>
    );
}
