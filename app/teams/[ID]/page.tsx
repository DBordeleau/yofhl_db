"use client";

import React, { FC, useEffect, useState } from "react";
import { notFound } from "next/navigation";
import StatTable from "@/components/stat-table";

interface PlayerStats {
    Player: string;
    Position: string;
    FPts: number;
    FPG: string;
    ID: string;
}

interface TeamPageProps {
    params: Promise<{ ID: string }>;
}

async function fetchTopPlayers(teamID: string): Promise<PlayerStats[] | null> {
    const response = await fetch(`/api/teams/${teamID}`, { cache: "no-store" });

    if (!response.ok) return null;
    const data = await response.json();
    return data.topPlayers || [];
}

async function fetchTeamName(teamID: string): Promise<string | null> {
    const response = await fetch(`/api/teams/${teamID}`, { cache: "no-store" });

    if (!response.ok) return null;
    const data = await response.json();
    return data.teamName || null;
}

// renders all-time fantasy point leaders in a table for a given team ID at /teams/[ID]
const TeamPage: FC<TeamPageProps> = ({ params }) => {
    const [topPlayers, setTopPlayers] = useState<PlayerStats[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [teamID, setTeamID] = useState<string>("");
    const [teamName, setTeamName] = useState<string>("");

    useEffect(() => {
        const getParams = async () => {
            const { ID } = await params;
            if (ID) {
                setTeamID(ID);
            }
        };
        getParams();
    }, [params]);

    useEffect(() => {
        if (teamID) {
            const fetchData = async () => {
                const teamNameData = await fetchTeamName(teamID);
                if (!teamNameData) {
                    notFound();
                } else {
                    setTeamName(teamNameData);
                }

                const data = await fetchTopPlayers(teamID);
                if (!data || data.length === 0) {
                    notFound();
                }
                setTopPlayers(data);
                setLoading(false);
            };

            fetchData();
        }
    }, [teamID]); // data is re-fetched if teamID changes

    if (loading) {
        return <div>Loading...</div>;
    }

    return (
        <div className="max-w-7xl mx-auto px-4 py-8">
            <h1 className="text-[1.25rem] lg:text-2xl font-bold text-center mb-4">
                {`${teamName} All-Time Leaders`}
            </h1>
            <StatTable mode="all-time" topPlayers={topPlayers} />
        </div>
    );
};

export default TeamPage;