'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import PlayerComparisonGraph from '@/components/player-comparison-graph';
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
            const res = await fetch(`/api/player/search?q=${encodeURIComponent(query)}`);
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
                const res = await fetch(`/api/player/${player.ID}`);
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

    return (
        <main className="relative overflow-hidden z-10 flex flex-col gap-y-6 items-center pt-6 px-4 min-h-screen">
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="w-full max-w-4xl"
            >
                <h1 className="text-3xl font-bold mb-6 text-center">Player Comparison</h1>

                {/* Search Bar */}
                <div className="relative mb-6">
                    <div className="relative">
                        <FaSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => handleSearchChange(e.target.value)}
                            placeholder="Search for players to compare (min 3 characters)..."
                            className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                    </div>

                    {/* Search Results Dropdown */}
                    {searchResults.length > 0 && (
                        <motion.div
                            initial={{ opacity: 0, y: -10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="absolute z-20 w-full mt-2 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto"
                        >
                            {searchResults.map((player) => (
                                <button
                                    key={player.ID}
                                    onClick={() => addPlayer(player)}
                                    className="w-full text-left px-4 py-3 hover:bg-gray-100 transition-colors border-b last:border-b-0"
                                >
                                    {player.Player}
                                </button>
                            ))}
                        </motion.div>
                    )}

                    {/* Show searching state or hint */}
                    {isSearching && searchQuery.length >= 3 && (
                        <div className="absolute z-20 w-full mt-2 bg-white border border-gray-300 rounded-lg shadow-lg p-4 text-center text-gray-500">
                            Searching...
                        </div>
                    )}

                    {/* Show hint when query is too short */}
                    {searchQuery.length > 0 && searchQuery.length < 3 && (
                        <div className="absolute z-20 w-full mt-2 bg-white border border-gray-300 rounded-lg shadow-lg p-4 text-center text-gray-500 text-sm">
                            Type at least 3 characters to search
                        </div>
                    )}

                    {/* Show no results message */}
                    {!isSearching && searchQuery.length >= 3 && searchResults.length === 0 && (
                        <div className="absolute z-20 w-full mt-2 bg-white border border-gray-300 rounded-lg shadow-lg p-4 text-center text-gray-500">
                            No players found
                        </div>
                    )}
                </div>

                {/* Selected Players */}
                <div className="mb-6">
                    <h2 className="text-lg font-semibold mb-3">
                        Selected Players ({selectedPlayers.length}/5)
                    </h2>

                    {selectedPlayers.length === 0 ? (
                        <div className="text-center py-8 text-gray-500 bg-gray-50 rounded-lg">
                            No players selected. Search and add players to compare.
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {selectedPlayers.map((player) => (
                                <motion.div
                                    key={player.ID}
                                    initial={{ opacity: 0, scale: 0.9 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    className="flex items-center justify-between bg-blue-50 border border-blue-200 rounded-lg px-4 py-3"
                                >
                                    <span className="font-medium">{player.Player}</span>
                                    <button
                                        onClick={() => removePlayer(player.ID)}
                                        className="text-red-500 hover:text-red-700 transition-colors"
                                    >
                                        <FaTimes />
                                    </button>
                                </motion.div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Compare Button - Always visible but disabled if < 2 players */}
                <motion.button
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    whileHover={selectedPlayers.length >= 2 ? { scale: 1.05 } : {}}
                    whileTap={selectedPlayers.length >= 2 ? { scale: 0.95 } : {}}
                    onClick={handleCompare}
                    disabled={selectedPlayers.length < 2}
                    className={`w-full font-bold py-4 rounded-lg flex items-center justify-center gap-3 shadow-lg transition-all ${selectedPlayers.length >= 2
                        ? 'bg-gradient-to-r from-blue-600 to-blue-700 text-white hover:shadow-xl cursor-pointer'
                        : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                        }`}
                >
                    <FaChartLine />
                    {selectedPlayers.length < 2
                        ? `Select ${2 - selectedPlayers.length} more player${2 - selectedPlayers.length === 1 ? '' : 's'} to compare`
                        : 'Compare Players'
                    }
                </motion.button>

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