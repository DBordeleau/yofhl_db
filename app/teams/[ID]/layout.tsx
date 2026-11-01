import type { ReactNode } from 'react';
import { getFranchise } from '@/lib/data/league';

// the club's name for the browser tab and for link previews in the group chat
export async function generateMetadata({ params }: { params: Promise<{ ID: string }> }) {
    const id = Number((await params).ID);
    const team = Number.isInteger(id) ? await getFranchise(id) : null;
    return { title: team ? `${team.name} · YOFHL` : 'Franchises · YOFHL' };
}

export default function TeamLayout({ children }: { children: ReactNode }) {
    return children;
}
