"use client";

import React, { FC, useEffect, useState } from "react";
import { notFound } from "next/navigation";
import StatTable from "@/components/stat-table";
import Image from "next/image";

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

async function fetchTeamData(teamID: string): Promise<{ topPlayers: PlayerStats[]; teamName: string; logoUrl: string | null } | null> {
    const response = await fetch(`/api/teams/${teamID}`, { cache: "no-store" });

    if (!response.ok) return null;
    const data = await response.json();
    if (!data.teamName || !Array.isArray(data.topPlayers)) return null;
    return {
        topPlayers: data.topPlayers,
        teamName: data.teamName,
        logoUrl: data.logoUrl,
    };
}

// renders all-time fantasy point leaders in a table for a given team ID at /teams/[ID]
const TeamPage: FC<TeamPageProps> = ({ params }) => {
    const [topPlayers, setTopPlayers] = useState<PlayerStats[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [teamID, setTeamID] = useState<string>("");
    const [teamName, setTeamName] = useState<string>("");
    const [logoUrl, setLogoUrl] = useState<string | null>(null);

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
                const data = await fetchTeamData(teamID);
                if (!data) {
                    notFound();
                } else {
                    setTeamName(data.teamName);
                    setLogoUrl(data.logoUrl);
                    setTopPlayers(data.topPlayers);
                }
                setLoading(false);
            };

            fetchData();
        }
    }, [teamID]);

    if (loading) {
        return <div>Loading...</div>;
    }

    return (
        <div className="max-w-7xl mx-auto px-4 py-8">
            <h1 className="text-[1.25rem] lg:text-2xl font-bold text-center mb-4">
                {`${teamName} All-Time Leaders`}
            </h1>
            {logoUrl && (
                <div className="flex justify-center mb-4">
                    <Image src={logoUrl} alt={`${teamName} Logo`} width={175} height={175} />
                </div>
            )}
            <StatTable
                mode="all-time"
                topPlayers={topPlayers} // Ensure this is defined and an array
                currentPage={1}
            />
        </div>
    );
};

export default TeamPage;