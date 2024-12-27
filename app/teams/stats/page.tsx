'use client'
import { useEffect, useState } from 'react';
import TeamStatTable from '@/components/team-stat-table';
import { motion } from 'framer-motion';

// renders all-time team stats in a table at /teams/stats
const TeamStatsPage = () => {
    const [teamStats, setTeamStats] = useState([]);

    // get all-time data for all teams from /api/team/stats
    useEffect(() => {
        const fetchTeamStats = async () => {
            const response = await fetch(`/api/teams/stats`);
            const data = await response.json();
            setTeamStats(data);
        };

        fetchTeamStats();
    }, []);

    return (
        <div className="flex overflow-y-hidden flex-col items-center p-4">
            <h1 className="text-3xl font-bold mb-4">All-Time Team Stats</h1>
            <motion.div
                className="flex flex-col items-center"
                initial={{ opacity: 0, y: 100 }}
                animate={{ opacity: 1, y: 0 }}
            >
                <TeamStatTable teamStats={teamStats} />
            </motion.div>
        </div>
    );
};

export default TeamStatsPage;