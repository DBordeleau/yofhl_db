import type { ReactNode } from 'react';
import { getFranchise } from '@/lib/data/league';
import { franchiseMetadata } from '@/lib/page-metadata';

// the franchise's name and history for the browser tab and for link previews in the group chat
export async function generateMetadata({ params }: { params: Promise<{ ID: string }> }) {
    const id = Number((await params).ID);
    return franchiseMetadata(id, Number.isInteger(id) ? await getFranchise(id) : null);
}

export default function TeamLayout({ children }: { children: ReactNode }) {
    return children;
}
